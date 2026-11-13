// Orchestrates the compatibility lab.
//
//   node src/pipeline.mjs refresh   Excel COM baseline -> SpreadJS runs -> compare -> site
//   node src/pipeline.mjs check     SpreadJS runs -> compare against committed oracle -> site
//   node src/pipeline.mjs report    Regenerate the static site from existing comparisons
//
// `refresh` needs Windows + desktop Excel. `check` needs only Node + a local Chrome/Edge,
// because the Excel results are committed under oracle/.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CASES = 'cases/public/corpus.json';
const ORACLE = 'oracle/excel-results.json';
const MANIFEST = 'oracle/manifest.json';
const MODES = [
  { id: 'default', env: { SJS_EXCEL_COMPATIBLE: 'false' }, label: '默认模式' },
  { id: 'compatible', env: { SJS_EXCEL_COMPATIBLE: 'true' }, label: 'ExcelCompatibleCalcMode' },
];

function runNode(args, env = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
  return result.status ?? 1;
}

function runPwsh(args) {
  const result = spawnSync('pwsh', ['-NoProfile', '-File', ...args], {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
  });
  return result.status ?? 1;
}

function sha256File(file) {
  return createHash('sha256').update(readFileSync(path.join(ROOT, file))).digest('hex');
}

function installedVersion(packageName) {
  const pkgFile = path.join(ROOT, 'node_modules', ...packageName.split('/'), 'package.json');
  return existsSync(pkgFile) ? JSON.parse(readFileSync(pkgFile, 'utf8')).version : null;
}

function writeManifest() {
  const excel = JSON.parse(readFileSync(path.join(ROOT, ORACLE), 'utf8'));
  const dependency = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).dependencies || {};
  const spreadjsPackage = Object.keys(dependency).find(name => /spread-sheets$/.test(name)) || '@grapecity-software/spread-sheets';
  const manifest = {
    generatedAt: new Date().toISOString(),
    casesFile: CASES,
    casesSha256: sha256File(CASES),
    caseCount: excel.caseCount,
    excel: {
      version: excel.meta?.excelVersion,
      build: excel.meta?.excelBuild,
      culture: excel.meta?.culture,
      dateSystem1904: excel.meta?.date1904,
      calculation: excel.meta?.calculation,
      totalElapsedMs: excel.meta?.totalMs,
    },
    spreadjs: {
      package: spreadjsPackage,
      version: installedVersion(spreadjsPackage),
    },
  };
  mkdirSync(path.dirname(path.join(ROOT, MANIFEST)), { recursive: true });
  writeFileSync(path.join(ROOT, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`manifest: ${MANIFEST} (Excel ${manifest.excel.version} build ${manifest.excel.build}, SpreadJS ${manifest.spreadjs.version})`);
}

function refreshOracle() {
  console.log('== Excel oracle (COM) ==');
  const code = runPwsh(['src/excel/run.ps1', '-Cases', CASES, '-Out', ORACLE, '-Workbook', 'oracle/excel-oracle-workbook.xlsx']);
  if (code !== 0) throw new Error(`Excel runner failed with exit code ${code}`);
  writeManifest();
}

function runSpreadjs() {
  for (const mode of MODES) {
    console.log(`== SpreadJS (${mode.id}) ==`);
    const code = runNode(['src/spreadjs/run.mjs', CASES, `out/${mode.id}/spreadjs-results.json`], mode.env);
    if (code !== 0) throw new Error(`SpreadJS runner failed (${mode.id}) with exit code ${code}`);
  }
}

function runCompare() {
  for (const mode of MODES) {
    console.log(`== compare (${mode.id}) ==`);
    const code = runNode(['src/compare.mjs', CASES, ORACLE, `out/${mode.id}/spreadjs-results.json`, `out/${mode.id}/comparison.json`, mode.id]);
    if (code !== 0 && code !== 2) throw new Error(`compare failed (${mode.id}) with exit code ${code}`);
  }
}

function runReport() {
  console.log('== static report ==');
  const code = runNode(['src/report/site.mjs']);
  if (code !== 0) throw new Error(`report failed with exit code ${code}`);
}

function check() {
  if (!existsSync(path.join(ROOT, ORACLE))) {
    throw new Error(`missing ${ORACLE}; run "npm run refresh" on Windows with desktop Excel first, or commit an oracle snapshot`);
  }
  runSpreadjs();
  runCompare();
  runReport();
}

const command = process.argv[2] || 'check';
try {
  if (command === 'refresh') {
    refreshOracle();
    runSpreadjs();
    runCompare();
    runReport();
  } else if (command === 'check') {
    check();
  } else if (command === 'report') {
    runReport();
  } else {
    throw new Error(`unknown command "${command}"; expected refresh | check | report`);
  }
} catch (error) {
  console.error(`pipeline failed: ${error.message}`);
  process.exitCode = 1;
}
