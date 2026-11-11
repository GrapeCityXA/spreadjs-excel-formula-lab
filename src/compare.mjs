// Compare one Excel oracle run with one SpreadJS run, case by case.
//
// Outcomes: PASS / FAIL / INVALID / EXEC_FAIL / INCONCLUSIVE.
// FAIL rows also get a structural classification so reports can separate
// environment differences (for example an Excel add-in that is not installed)
// from genuine calculation differences.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateCases } from './validate.mjs';
import { parseRange } from './shared/common.mjs';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function compareScalar(excel, spread, tolerance = {}) {
  if (!excel || !spread || typeof excel !== 'object' || typeof spread !== 'object') return false;
  if (['number', 'date'].includes(excel.type) && ['number', 'date'].includes(spread.type)) {
    if (typeof excel.value !== 'number' || typeof spread.value !== 'number' || !Number.isFinite(excel.value) || !Number.isFinite(spread.value)) return false;
    const diff = Math.abs(excel.value - spread.value);
    return diff <= (tolerance.abs ?? 1e-9) || diff <= (tolerance.rel ?? 1e-9) * Math.max(Math.abs(excel.value), Math.abs(spread.value));
  }
  if (excel.type !== spread.type) return false;
  if (excel.type === 'empty') return true;
  if (!['text', 'bool', 'error'].includes(excel.type)) return false;
  const expectedType = excel.type === 'bool' ? 'boolean' : 'string';
  if (typeof excel.value !== expectedType || typeof spread.value !== expectedType) return false;
  return excel.value === spread.value;
}

// Structural classification for a differing row. This is a first-pass hint for
// triage, not a root-cause verdict: every difference still needs human review.
export function classifyDifference(item, excel, spread) {
  const ex = excel?.value;
  const sp = spread?.value;
  if (excel?.status === 'formulaError' && spread?.status === 'ok') {
    if (ex?.type === 'error' && ex.value === '#NAME?') {
      return {
        code: 'EXCEL_FUNCTION_UNAVAILABLE',
        label: 'Excel 未提供该函数（加载项或版本差异）',
        attribution: 'environment',
      };
    }
    return { code: 'EXCEL_ERROR_ONLY', label: 'Excel 报错而 SpreadJS 正常返回', attribution: 'environment' };
  }
  if (excel?.status === 'ok' && spread?.status === 'formulaError') {
    return { code: 'SPREADJS_ERROR', label: 'SpreadJS 返回错误而 Excel 正常', attribution: 'product' };
  }
  if (ex?.type === 'error' && sp?.type === 'error') {
    return { code: 'ERROR_CODE_DIFF', label: `错误码不同（Excel ${ex.value} / SpreadJS ${sp.value}）`, attribution: 'product' };
  }
  if (ex && sp && ex.type !== sp.type) {
    return { code: 'TYPE_DIFF', label: `结果类型不同（Excel ${ex.type} / SpreadJS ${sp.type}）`, attribution: 'product' };
  }
  if (ex?.type === 'number' && sp?.type === 'number') {
    const abs = Math.abs(ex.value - sp.value);
    const rel = abs / Math.max(Math.abs(ex.value), Math.abs(sp.value), 1e-300);
    if (rel <= 1e-6) {
      return { code: 'PRECISION_DIFF', label: `数值精度差异（相对 ${rel.toExponential(2)}）`, attribution: 'product', abs, rel };
    }
    return { code: 'VALUE_DIFF', label: `数值不同（Excel ${ex.value} / SpreadJS ${sp.value}）`, attribution: 'product', abs, rel };
  }
  if (ex?.type === 'text' && sp?.type === 'text') {
    const looksLocalized = /[¥$€£]/.test(String(ex.value) + String(sp.value));
    return looksLocalized
      ? { code: 'LOCALE_DIFF', label: '文本不同（疑似区域/货币设置差异）', attribution: 'environment' }
      : { code: 'TEXT_DIFF', label: '文本结果不同', attribution: 'product' };
  }
  if (ex?.type === 'bool' && sp?.type === 'bool') {
    return { code: 'BOOLEAN_DIFF', label: '布尔结果不同', attribution: 'product' };
  }
  return { code: 'OTHER_DIFF', label: '结果不同', attribution: 'unknown' };
}

export function compareCase(item, excel, spread) {
  if (!excel || !spread || !['ok', 'formulaError'].includes(excel.status) || !['ok', 'formulaError'].includes(spread.status) || !excel.value?.type || !spread.value?.type) return { outcome: 'EXEC_FAIL', reason: 'Missing or invalid engine result' };
  const expectedInputs = item.data ?? [];
  for (const [engine, result] of [['Excel', excel], ['SpreadJS', spread]]) {
    if (!Array.isArray(result.inputs) || result.inputs.length !== expectedInputs.length) return { outcome: 'EXEC_FAIL', reason: `${engine}: missing input evidence` };
    for (const [rowIndex, row] of expectedInputs.entries()) {
      if (!Array.isArray(result.inputs[rowIndex]) || result.inputs[rowIndex].length !== row.length) return { outcome: 'EXEC_FAIL', reason: `${engine}: malformed input evidence at row ${rowIndex + 1}` };
      for (const [columnIndex, input] of row.entries()) {
        const expected = input === null ? { type: 'empty' } : typeof input === 'object' ? input : { type: typeof input === 'boolean' ? 'bool' : typeof input === 'string' ? 'text' : 'number', value: input };
        const actual = result.inputs[rowIndex][columnIndex];
        if (expected.type !== actual?.type || !compareScalar(expected, actual, { abs: 0, rel: 0 })) return { outcome: 'EXEC_FAIL', reason: `${engine}: input mismatch at row ${rowIndex + 1}, column ${columnIndex + 1}` };
      }
    }
  }
  const excelError = excel.value.type === 'error';
  if (Boolean(item.expectError) !== excelError) return { outcome: 'INVALID', reason: 'Excel result does not match expectError' };
  if (item.arrayMode === 'native') {
    const fields = ['row', 'column', 'rows', 'columns'];
    if (!excel.spill || !spread.spill || fields.some(key => !Number.isInteger(excel.spill[key]) || !Number.isInteger(spread.spill[key]))) return { outcome: 'EXEC_FAIL', reason: 'Native spill evidence unavailable' };
    if (fields.some(key => excel.spill[key] !== spread.spill[key])) return { outcome: 'FAIL', reason: 'Native spill dimensions differ', classification: { code: 'ARRAY_SHAPE_DIFF', label: '动态数组溢出区域不同', attribution: 'product' } };
    const expected = parseRange(item.readRange);
    if (excel.spill.row !== expected.r1 || excel.spill.column !== expected.c1 || excel.spill.rows !== expected.r2 - expected.r1 + 1 || excel.spill.columns !== expected.c2 - expected.c1 + 1) return { outcome: 'INCONCLUSIVE', reason: 'Declared readRange does not match actual spill; update case before comparing values' };
  }
  if (item.readRange) {
    const expected = parseRange(item.readRange);
    const rows = expected.r2 - expected.r1 + 1;
    const columns = expected.c2 - expected.c1 + 1;
    if (!Array.isArray(excel.range) || !Array.isArray(spread.range) || excel.range.length !== rows || spread.range.length !== rows || excel.range.some((row, index) => !Array.isArray(row) || !Array.isArray(spread.range[index]) || row.length !== columns || spread.range[index].length !== columns)) return { outcome: 'EXEC_FAIL', reason: 'Missing or malformed result range' };
    const differences = [];
    excel.range.forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
      if (!compareScalar(value, spread.range[rowIndex][columnIndex], item.tolerance || {})) differences.push({ row: rowIndex + 1, column: columnIndex + 1, excel: value, spreadjs: spread.range[rowIndex][columnIndex] });
    }));
    if (item.volatile) return { outcome: 'INCONCLUSIVE', reason: 'Volatile range requires a case-specific assertion' };
    return differences.length
      ? { outcome: 'FAIL', reason: 'Range values differ', differences, classification: { code: 'ARRAY_VALUE_DIFF', label: `区域结果有 ${differences.length} 个单元格不同`, attribution: 'product' } }
      : { outcome: 'PASS' };
  }
  if (item.volatile) return { outcome: 'INCONCLUSIVE', reason: 'Volatile formula requires a case-specific assertion' };
  return compareScalar(excel.value, spread.value, item.tolerance || {})
    ? { outcome: 'PASS' }
    : { outcome: 'FAIL', reason: 'Values differ', classification: classifyDifference(item, excel, spread) };
}

export function compareRun(document, excel, spread, caseHash, options = {}) {
  const errors = validateCases(document);
  if (errors.length) throw new Error(`Invalid case file: ${errors.join('; ')}`);
  for (const [name, run] of [['excel', excel], ['spreadjs', spread]]) {
    const selfValue = typeof run.selfCheck?.value === 'object' ? run.selfCheck.value?.value : run.selfCheck?.value;
    if (run.engine !== name || run.selfCheck?.formula !== '=1+1' || selfValue !== 2) throw new Error(`${name}: engine self-check failed`);
    if (!run.casesSha256 || run.casesSha256 !== caseHash) throw new Error(`${name}: case file hash does not match`);
    if (run.caseCount !== document.cases.length || !run.results || Object.keys(run.results).length !== document.cases.length) throw new Error(`${name}: result count does not match`);
  }
  const rows = document.cases.map(item => {
    const compared = compareCase(item, excel.results[item.id], spread.results[item.id]);
    return {
      id: item.id,
      category: item.category,
      function: item.function,
      scenario: item.scenario,
      formula: item.formula,
      priority: item.priority || 'P1',
      excel: excel.results[item.id],
      spreadjs: spread.results[item.id],
      ...compared,
    };
  });
  const counts = Object.fromEntries(['PASS', 'FAIL', 'INVALID', 'EXEC_FAIL', 'INCONCLUSIVE'].map(key => [key, rows.filter(row => row.outcome === key).length]));
  const classificationCounts = {};
  for (const row of rows) {
    if (!row.classification?.code) continue;
    classificationCounts[row.classification.code] = (classificationCounts[row.classification.code] || 0) + 1;
  }
  return {
    generatedAt: new Date().toISOString(),
    mode: options.mode || 'default',
    casesSha256: caseHash,
    caseCount: rows.length,
    counts,
    classificationCounts,
    environment: {
      excel: { version: excel.engineVersion, ...excel.meta },
      spreadjs: { version: spread.engineVersion, ...spread.meta },
    },
    rows,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [casesPath, excelPath, spreadPath, outputPath, mode = 'default'] = process.argv.slice(2);
    if (!outputPath) throw new Error('Usage: node src/compare.mjs <cases.json> <excel.json> <spreadjs.json> <output.json> [mode]');
    const bytes = readFileSync(casesPath);
    const report = compareRun(JSON.parse(bytes), JSON.parse(readFileSync(excelPath)), JSON.parse(readFileSync(spreadPath)), sha256(bytes), { mode });
    mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ mode: report.mode, ...report.counts, classificationCounts: report.classificationCounts }, null, 2));
    if (report.counts.FAIL || report.counts.INVALID || report.counts.EXEC_FAIL || report.counts.INCONCLUSIVE) process.exitCode = 2;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
