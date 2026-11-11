// SpreadJS headless formula calculation runner.
//
// Implements docs/RUNNER-CONTRACT.md:
//   node src/spreadjs/run.mjs [casesFile] [outFile]
//   casesFile default cases/public.json
//   outFile   default out/spreadjs-results.json
//
// One Chromium page loads the installed bundle through a real <script src>
// (page.addScriptTag makes the bundle load without a worksheet, so a same-directory
// harness HTML is required).  All cases are then calculated batched inside one
// page.evaluate call, which keeps the 500-case scale fast.
//
// Two engine quirks of this bundle are worth knowing (both verified empirically):
//   * sheet.clear()/Range.clear() are effectively no-ops here: they neither remove cell
//     values nor formulas.  Cross-case isolation is therefore implemented explicitly:
//     the previous case's formula anchor is reset with setFormula(null) + setValue(null)
//     (which also removes its dynamic-array spill and the leftover "#SPILL!" artifact),
//     and the previous case's data rectangle is overwritten with nulls via setArray.
//   * Every cell mutation triggers a synchronous canvas repaint (~15-20 ms) unless paint
//     is suspended.  The whole batch runs under wb.suspendPaint(), which keeps a case at
//     roughly 1-2 ms without affecting formula calculation or getText/getArray results.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseCell, parseRange } from '../shared/common.mjs';
import { createHash } from 'node:crypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, '..', '..');

const DEFAULT_CASES = path.join(PROJECT_ROOT, 'cases', 'public', 'starter.json');
const DEFAULT_OUT = path.join(PROJECT_ROOT, 'out', 'default', 'spreadjs-results.json');
// Resolve the installed SpreadJS distribution from the project dependency.
// The CN distribution (@grapecity-software/spread-sheets) is the default target;
// SJS_PACKAGE can point at another installed package name for cross-version runs.
const SJS_PACKAGE = process.env.SJS_PACKAGE || '@grapecity-software/spread-sheets';
const BUNDLE_DIR = path.join(PROJECT_ROOT, 'node_modules', ...SJS_PACKAGE.split('/'));
const BUNDLE_PATH = path.join(BUNDLE_DIR, 'dist', 'gc.spread.sheets.all.min.js');
const HARNESS_NAME = `__spreadjs_runner_harness_${process.pid}.html`;
const HARNESS_PATH = path.join(PROJECT_ROOT, 'out', HARNESS_NAME);
const HARNESS_HTML = [
  '<!doctype html>',
  '<html>',
  '<head><meta charset="utf-8"><title>SpreadJS runner harness</title></head>',
  '<body style="margin:0">',
  '<div id="host" style="position:absolute;left:0;top:0;width:1200px;height:800px"></div>',
  `<script src="${pathToFileURL(BUNDLE_PATH).href}"></script>`,
  '</body>',
  '</html>',
].join('\n');

const CHROMIUM_CANDIDATES = [
  process.env.CHROMIUM_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const LOG_LINES = [];
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  LOG_LINES.push(line);
  console.log(msg);
}

function rel(p) {
  return path.relative(PROJECT_ROOT, p).replace(/\\/g, '/');
}

function readSpreadjsVersion() {
  return JSON.parse(readFileSync(path.join(BUNDLE_DIR, 'package.json'), 'utf8')).version;
}

function loadCases(casesFile) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(casesFile, 'utf8'));
  } catch (e) {
    throw new Error(`failed to read cases file ${casesFile}: ${e.message}`);
  }
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.cases) ? parsed.cases : null;
  if (!list) throw new Error(`cases file has no "cases" array: ${casesFile}`);
  return list;
}

// Validate/normalize one case on the Node side. Anything structurally unusable is
// recorded as engineError instead of aborting the whole run.
function prepareCase(c, index) {
  const problems = [];
  const id = typeof c.id === 'string' && c.id.trim() ? c.id.trim() : `__case_${index}_no_id__`;
  if (id.startsWith('__case_')) problems.push('missing or invalid id');
  const formula = typeof c.formula === 'string' ? c.formula.trim() : '';
  if (!formula) problems.push('missing formula');
  else if (!formula.startsWith('=')) problems.push(`formula does not start with "=": ${formula}`);

  const formulaCell = typeof c.formulaCell === 'string' && c.formulaCell.trim() ? c.formulaCell.trim() : 'H1';
  const fc = parseCell(formulaCell);
  if (!fc) problems.push(`invalid formulaCell: ${formulaCell}`);

  const readRangeRaw = typeof c.readRange === 'string' ? c.readRange.trim() : '';
  let rr = null;
  if (readRangeRaw) {
    rr = parseRange(readRangeRaw);
    if (!rr) problems.push(`invalid readRange: ${readRangeRaw}`);
  }

  let data = [];
  if (c.data !== undefined && c.data !== null) {
    if (!Array.isArray(c.data) || c.data.some((row) => !Array.isArray(row))) {
      problems.push('data is not a 2D array');
    } else {
      data = c.data.map((row) => row.map((v) => (v === undefined ? null : v)));
    }
  }

  return { id, formula, formulaCell, fc, rr, data, arrayMode: c.arrayMode, preError: problems.length ? problems.join('; ') : '' };
}

// Everything inside this function runs in the browser page. Keep it self-contained:
// page.evaluate serializes the source, so no Node-side closures are available.
async function runBatchInPage(payload) {
  const { cases, selfCheckFormula, culture, excelCompatibleCalcMode } = payload;

  function round(x, digits) {
    const f = Math.pow(10, digits);
    return Math.round(x * f) / f;
  }

  function normalize(v) {
    if (v === null || v === undefined) return { type: 'empty' };
    if (v instanceof Date) {
      // SpreadJS returns JS Date (local calendar fields) for date values; convert to the
      // Excel 1900 date system serial value exactly like docs/RUNNER-CONTRACT.md §3.
      const ms = Date.UTC(
        v.getFullYear(), v.getMonth(), v.getDate(),
        v.getHours(), v.getMinutes(), v.getSeconds(), v.getMilliseconds(),
      );
      let serial = round(ms / 86400000 + 25569, 9);
      // Excel 1900 日期系统把 1900 年当闰年（存在不存在的 1900-02-29，序列值 60）。
      // SpreadJS 对 1900-01-01~1900-02-28 返回的日期比 Excel 序列值大 1，这里做补偿；
      // 1900-03-01（序列值 61）起两边一致。详见 docs/RUNNER-CONTRACT.md。
      if (serial < 61 && serial >= 1) serial = round(serial - 1, 9);
      return { type: 'date', value: serial };
    }
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return { type: 'error', value: '#NUM!' };
      return { type: 'number', value: v };
    }
    if (typeof v === 'boolean') return { type: 'bool', value: v };
    if (typeof v === 'string') return { type: 'text', value: v };
    if (typeof v === 'object') {
      if (typeof v._error === 'string' && v._error) return { type: 'error', value: v._error };
      if (typeof v._calcError === 'string' && v._calcError) return { type: 'error', value: v._calcError };
      if (Array.isArray(v)) return { type: 'error', value: '#VALUE!' };
      return { type: 'empty' };
    }
    return { type: 'empty' };
  }

  const out = {
    ok: false,
    fatal: '',
    selfCheckValue: null,
    functionNames: [],
    registeredFunctionCount: 0,
    productInfo: null,
    sheetName: '',
    results: [],
    batchElapsedMs: 0,
  };

  let wb = null;
  try {
    if (!window.GC || !GC.Spread || !GC.Spread.Sheets || !GC.Spread.Sheets.Workbook) {
      throw new Error('SpreadJS bundle did not initialize (window.GC missing)');
    }
    // 运行区域（语言包）：必须在创建工作簿之前设置。DBCS 字节函数（LENB/LEFTB/MIDB 等）、
    // 日期/数字格式与货币符号都依赖该设置，默认 zh-CN 以对齐 Excel 中文基线。
    out.culture = culture || null;
    out.cultureApplied = false;
    if (culture) {
      try {
        if (!GC.Spread.Common || !GC.Spread.Common.CultureManager) throw new Error('CultureManager missing');
        GC.Spread.Common.CultureManager.culture(culture);
        out.cultureApplied = String(GC.Spread.Common.CultureManager.culture() || '') === String(culture).toLowerCase();
      } catch (e) {
        out.cultureError = e && (e.message || String(e));
      }
    }
    GC.Spread.CalcEngine.ExcelCompatibleCalcMode = excelCompatibleCalcMode;
    out.excelCompatibleCalcMode = GC.Spread.CalcEngine.ExcelCompatibleCalcMode;
    wb = new GC.Spread.Sheets.Workbook(document.getElementById('host'), { allowDynamicArray: true });
    const sheet = wb.getActiveSheet();
    if (!sheet) throw new Error('Workbook has no active sheet');
    try {
      out.sheetName = typeof sheet.name === 'function' ? String(sheet.name()) : String(sheet.name || '');
    } catch (e) {
      out.sheetName = '';
    }
    try {
      if (GC.Spread.Sheets.ProductInfo) out.productInfo = JSON.parse(JSON.stringify(GC.Spread.Sheets.ProductInfo));
    } catch (e) {
      out.productInfo = null;
    }
    try {
      const fns = GC.Spread.CalcEngine.Functions.findGlobalFunctions();
      out.functionNames = Array.from(fns || [])
        .map((f) => (f && f.name ? String(f.name) : String(f)))
        .filter((n) => n && n !== 'undefined')
        .sort();
      out.registeredFunctionCount = out.functionNames.length;
    } catch (e) {
      throw new Error(`findGlobalFunctions() failed: ${e && (e.message || e)}`);
    }

    // Repaint on every mutation costs ~15-20 ms; suspend once for the whole batch.
    if (typeof wb.suspendPaint === 'function') wb.suspendPaint();
    try {
      // ---- explicit per-case cleanup state (sheet.clear is a no-op in this bundle) ----
      let dirty = null; // { fc: {r,c}, dataRows: number, dataCols: number }
      function resetDirty() {
        if (!dirty) return;
        if (dirty.fc) {
          try {
            sheet.setFormula(dirty.fc.r, dirty.fc.c, null);
          } catch (e) {
            /* ignore */
          }
          try {
            // Removes the leftover "#SPILL!" artifact at a former dynamic-array anchor.
            sheet.setValue(dirty.fc.r, dirty.fc.c, null);
          } catch (e) {
            /* ignore */
          }
        }
        if (dirty.dataRows > 0 && dirty.dataCols > 0) {
          for (const cell of dirty.errorCells) sheet.setFormula(cell.r, cell.c, null);
          const nulls = [];
          for (let r = 0; r < dirty.dataRows; r++) nulls.push(new Array(dirty.dataCols).fill(null));
          try {
            sheet.setArray(0, 0, nulls);
          } catch (e) {
            /* ignore */
          }
        }
        dirty = null;
      }

      // ---- self check: =1+1 must be 2 ----
      sheet.setFormula(0, 0, selfCheckFormula);
      const selfRaw = sheet.getValue(0, 0);
      out.selfCheckValue = typeof selfRaw === 'number' && Number.isFinite(selfRaw) ? selfRaw : normalize(selfRaw);
      // reset the self-check cell so it cannot leak into case #1
      sheet.setFormula(0, 0, null);
      sheet.setValue(0, 0, null);

      // ---- batch case calculation ----
      const tBatch = performance.now();
      for (let i = 0; i < cases.length; i++) {
        const c = cases[i];
        const t0 = performance.now();
        const res = { status: 'ok', value: null, displayText: '', elapsedMs: 0, message: '' };
        try {
          resetDirty();
          const errorFormulas = { '#N/A': '=NA()', '#DIV/0!': '=1/0', '#VALUE!': '=VALUE("not-a-number")', '#NUM!': '=SQRT(-1)' };
          const errorCells = [];
          dirty = {
            fc: c.fc,
            dataRows: c.data ? c.data.length : 0,
            dataCols: c.data && c.data.length ? Math.max(...c.data.map((row) => row.length)) : 0,
            errorCells,
          };
          if (c.data && c.data.length) {
            sheet.setArray(0, 0, c.data.map(row => row.map(value => value && typeof value === 'object' ? null : value)));
            c.data.forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
              if (value && typeof value === 'object') {
                if (!errorFormulas[value.value]) throw new Error(`Unsupported error input: ${value.value}`);
                errorCells.push({ r: rowIndex, c: columnIndex });
                sheet.setFormula(rowIndex, columnIndex, errorFormulas[value.value]);
              }
            }));
          }
          res.inputs = c.data.map((row, rowIndex) => row.map((value, columnIndex) => normalize(sheet.getValue(rowIndex, columnIndex))));
          sheet.setFormula(c.fc.r, c.fc.c, c.formula);
          const raw = sheet.getValue(c.fc.r, c.fc.c);
          const text = sheet.getText(c.fc.r, c.fc.c);
          res.value = normalize(raw);
          if (c.arrayMode === 'native') {
            const info = sheet.getFormulaInformation(c.fc.r, c.fc.c);
            const range = info && info.baseRange;
            if (!range || !Number.isInteger(range.rowCount) || !Number.isInteger(range.colCount)) throw new Error('Native spill range unavailable');
            res.spill = { row: range.row, column: range.col, rows: range.rowCount, columns: range.colCount };
          }
          res.displayText = text === null || text === undefined ? '' : String(text);
          if (res.value.type === 'error') res.status = 'formulaError';
          if (c.rr) {
            const rows = c.rr.r2 - c.rr.r1 + 1;
            const cols = c.rr.c2 - c.rr.c1 + 1;
            const block = sheet.getArray(c.rr.r1, c.rr.c1, rows, cols);
            res.range = [];
            for (let r = 0; r < rows; r++) {
              const outRow = [];
              const srcRow = block && block[r] ? block[r] : [];
              for (let col = 0; col < cols; col++) outRow.push(normalize(srcRow[col]));
              res.range.push(outRow);
            }
          }
        } catch (e) {
          res.status = 'engineError';
          res.value = null;
          res.displayText = '';
          delete res.range;
          res.message = String((e && (e.stack || e.message)) || e);
        }
        res.elapsedMs = round(performance.now() - t0, 3);
        out.results.push(res);
      }
      // do not leave the last case's formula/spill behind
      resetDirty();
      out.batchElapsedMs = round(performance.now() - tBatch, 3);
    } finally {
      if (typeof wb.resumePaint === 'function') wb.resumePaint();
    }
    out.ok = true;
  } catch (e) {
    out.fatal = String((e && (e.stack || e.message)) || e);
  }
  return out;
}

function pickChromium() {
  const seen = new Set();
  const found = [];
  for (const p of CHROMIUM_CANDIDATES) {
    if (!p || seen.has(p)) continue;
    seen.add(p);
    if (existsSync(p)) found.push(p);
  }
  return found;
}

async function launchBrowser() {
  const candidates = pickChromium();
  if (!candidates.length) {
    throw new Error(`no Chromium executable found. Tried:\n  ${CHROMIUM_CANDIDATES.join('\n  ')}`);
  }
  const failures = [];
  for (const executablePath of candidates) {
    try {
      const browser = await chromium.launch({
        executablePath,
        headless: true,
        timeout: 60000,
        args: ['--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--allow-file-access-from-files'],
      });
      return { browser, executablePath };
    } catch (e) {
      failures.push(`${executablePath}: ${e && (e.message || e)}`);
    }
  }
  throw new Error(`failed to launch any Chromium:\n${failures.join('\n')}`);
}

function ensureDirFor(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeLog(logFile) {
  ensureDirFor(logFile);
  writeFileSync(logFile, LOG_LINES.join('\n') + '\n', 'utf8');
}

async function main() {
  const tStart = performance.now();
  const casesFile = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : DEFAULT_CASES;
  const outFile = process.argv[3] ? path.resolve(process.cwd(), process.argv[3]) : DEFAULT_OUT;
  const logFile = path.join(path.dirname(outFile), 'spreadjs-run.log');

  const startedAt = new Date().toISOString();
  log(`SpreadJS runner start (node ${process.version}, ${process.platform} ${process.arch})`);
  log(`projectRoot: ${PROJECT_ROOT}`);
  log(`casesFile:   ${rel(casesFile)}`);
  log(`outFile:     ${rel(outFile)}`);
  log(`logFile:     ${rel(logFile)}`);

  if (!existsSync(BUNDLE_PATH)) throw new Error(`SpreadJS bundle not found: ${BUNDLE_PATH}`);
  const spreadjsVersion = readSpreadjsVersion();
  const bundleBytes = statSync(BUNDLE_PATH).size;
  log(`bundle:      ${rel(BUNDLE_PATH)} (bytes=${bundleBytes}, version=${spreadjsVersion})`);

  const rawCases = loadCases(casesFile);
  const prepared = rawCases.map((c, i) => prepareCase(c, i));
  const badIds = prepared.filter((p) => p.preError).map((p) => `${p.id} (${p.preError})`);
  if (badIds.length) log(`WARNING: ${badIds.length} malformed case(s): ${badIds.join(' | ')}`);
  log(`cases:       ${prepared.length}`);

  // Same-directory harness HTML: loading the bundle with <script src> is the only
  // reliable way to get a Workbook that actually has a worksheet.
  ensureDirFor(HARNESS_PATH);
  writeFileSync(HARNESS_PATH, HARNESS_HTML, 'utf8');
  log(`harness:     ${rel(HARNESS_PATH)} (script src=${path.basename(BUNDLE_PATH)})`);

  let browser = null;
  let executablePath = '';
  let chromiumVersion = '';
  let userAgent = '';
  let launchMs = 0;
  let pageLoadMs = 0;
  let batch = null;

  try {
    const tLaunch = performance.now();
    ({ browser, executablePath } = await launchBrowser());
    chromiumVersion = browser.version();
    launchMs = Math.round((performance.now() - tLaunch) * 1000) / 1000;
    log(`chromium:    ${executablePath} (version=${chromiumVersion}, launchMs=${launchMs})`);

    const tLoad = performance.now();
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    const consoleMessages = [];
    page.on('console', (m) => consoleMessages.push(`[console:${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => consoleMessages.push(`[pageerror] ${e && e.message}`));
    page.on('requestfailed', (r) => consoleMessages.push(`[requestfailed] ${r.url()} ${r.failure() && r.failure().errorText}`));
    await page.goto(pathToFileURL(HARNESS_PATH).href, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(
      () => !!(window.GC && GC.Spread && GC.Spread.Sheets && GC.Spread.Sheets.Workbook),
      null,
      { timeout: 60000 },
    );
    userAgent = await page.evaluate(() => navigator.userAgent);
    pageLoadMs = Math.round((performance.now() - tLoad) * 1000) / 1000;
    log(`page ready:  loadMs=${pageLoadMs}`);
    log(`userAgent:   ${userAgent}`);

    const pageCases = prepared
      .filter((p) => !p.preError)
      .map((p) => ({ id: p.id, formula: p.formula, data: p.data, fc: p.fc, rr: p.rr, arrayMode: p.arrayMode }));
    const culture = process.env.SJS_CULTURE || 'zh-CN';
    const mode = process.env.SJS_EXCEL_COMPATIBLE || 'false';
    if (!['true', 'false'].includes(mode)) throw new Error('SJS_EXCEL_COMPATIBLE must be true or false');
    log(`culture:     ${culture}（运行时区域设置，对齐 Excel 基线）`);
    batch = await page.evaluate(runBatchInPage, {
      cases: pageCases,
      selfCheckFormula: '=1+1',
      culture,
      excelCompatibleCalcMode: mode === 'true',
    });

    if (!batch.ok) throw new Error(`batch calculation failed: ${batch.fatal}`);
    if (culture && !batch.cultureApplied) {
      throw new Error(`culture "${culture}" 未生效（${batch.cultureError || 'CultureManager unavailable'}）——DBCS 字节函数会退化为字符语义，结果不可与 Excel 中文基线比对`);
    }
    log(`registered:  findGlobalFunctions() -> ${batch.registeredFunctionCount} function names`);
    log(`selfCheck:   =1+1 -> ${JSON.stringify(batch.selfCheckValue)} ${batch.selfCheckValue === 2 ? '(passed)' : '(FAILED: expected 2)'}`);
    log(`batch:       ${batch.results.length} calculated cases in ${batch.batchElapsedMs} ms (paint suspended)`);

    const consoleErrors = consoleMessages.filter((m) => /pageerror|requestfailed|console:error/.test(m));
    if (consoleMessages.length) log(`page console: ${consoleMessages.length} message(s), ${consoleErrors.length} error/failed`);
    for (const m of consoleMessages.slice(0, 20)) LOG_LINES.push(`  ${m}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    try {
      unlinkSync(HARNESS_PATH);
    } catch (e) {
      /* harness already gone */
    }
  }

  // ---- merge page results with Node-side validation, preserving input order ----
  const results = {};
  let okCount = 0;
  let formulaErrorCount = 0;
  let engineErrorCount = 0;
  let rangeCount = 0;
  let caseElapsedSumMs = 0;
  let pageIdx = 0;
  for (const pc of prepared) {
    let result;
    if (pc.preError) {
      result = { status: 'engineError', value: null, displayText: '', elapsedMs: 0, message: pc.preError };
    } else {
      const raw = batch.results[pageIdx++];
      if (!raw || typeof raw !== 'object' || !raw.status) {
        result = {
          status: 'engineError',
          value: null,
          displayText: '',
          elapsedMs: 0,
          message: 'missing page result for case',
        };
      } else {
        result = {
          status: raw.status,
          value: raw.value,
          inputs: raw.inputs,
          spill: raw.spill,
          displayText: raw.displayText,
          elapsedMs: raw.elapsedMs,
          message: raw.message || '',
        };
        if (raw.range) {
          result.range = raw.range;
          rangeCount++;
        }
      }
    }
    if (result.status === 'ok') okCount++;
    else if (result.status === 'formulaError') formulaErrorCount++;
    else engineErrorCount++;
    caseElapsedSumMs += result.elapsedMs || 0;
    results[pc.id] = result;
  }
  caseElapsedSumMs = Math.round(caseElapsedSumMs * 1000) / 1000;
  const caseCount = prepared.length;
  const avgCaseMs = caseCount ? Math.round((caseElapsedSumMs / caseCount) * 1000) / 1000 : 0;

  const finishedAt = new Date().toISOString();
  const totalElapsedMs = Math.round((performance.now() - tStart) * 1000) / 1000;

  const output = {
    engine: 'spreadjs',
    engineVersion: spreadjsVersion,
    casesSha256: createHash('sha256').update(readFileSync(casesFile)).digest('hex'),
    startedAt,
    finishedAt,
    caseCount,
    meta: {
      chromiumVersion,
      chromiumExecutable: executablePath,
      userAgent,
      spreadjsVersion,
      bundlePath: rel(BUNDLE_PATH),
      bundleBytes,
      registeredFunctionCount: batch.registeredFunctionCount,
      registeredFunctions: batch.functionNames,
      sheetName: batch.sheetName,
      allowDynamicArray: true,
      culture: batch.culture || null,
      cultureApplied: batch.cultureApplied === true,
      excelCompatibleCalcMode: batch.excelCompatibleCalcMode,
      cultureError: batch.cultureError || null,
      dateSystem: '1900',
      formulaLanguage: 'A1',
      paintSuspendedDuringBatch: true,
      resetStrategy: 'explicit: setFormula(null)+setValue(null) on previous formula anchor; setArray nulls over previous data rectangle (sheet.clear is a no-op in this bundle)',
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      totalElapsedMs,
      launchMs,
      pageLoadMs,
      batchMs: batch.batchElapsedMs,
      caseElapsedSumMs,
      avgCaseMs,
      productInfo: batch.productInfo,
    },
    selfCheck: {
      formula: '=1+1',
      value: batch.selfCheckValue,
    },
    results,
  };

  ensureDirFor(outFile);
  writeFileSync(outFile, JSON.stringify(output, null, 2) + '\n', 'utf8');

  log(`status:      ok=${okCount}, formulaError=${formulaErrorCount}, engineError=${engineErrorCount}, rangeCases=${rangeCount}`);
  log(`timing:      total=${totalElapsedMs} ms, batch=${batch.batchElapsedMs} ms, caseElapsedSum=${caseElapsedSumMs} ms, avgCase=${avgCaseMs} ms`);
  log(`output:      ${rel(outFile)} (bytes=${statSync(outFile).size})`);
  log('done');
  writeLog(logFile);
  console.log(`\nWrote ${rel(outFile)}`);

  if (batch.selfCheckValue !== 2) {
    console.error(`ERROR: selfCheck =1+1 returned ${JSON.stringify(batch.selfCheckValue)}, expected 2`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  const msg = String((e && (e.stack || e.message)) || e);
  console.error(`SpreadJS runner FAILED: ${msg}`);
  LOG_LINES.push(`[${new Date().toISOString()}] FATAL: ${msg}`);
  try {
    const outArg = process.argv[3] ? path.resolve(process.cwd(), process.argv[3]) : DEFAULT_OUT;
    writeLog(path.join(path.dirname(outArg), 'spreadjs-run.log'));
  } catch (err) {
    /* logging best effort */
  }
  process.exitCode = 1;
});




