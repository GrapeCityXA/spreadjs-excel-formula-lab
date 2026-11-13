// Agent-friendly CLI.
//
//   node src/cli.mjs run [--json]             same as npm run check
//   node src/cli.mjs refresh                  rebuild the Excel baseline (Windows + Excel)
//   node src/cli.mjs report                   regenerate site/ from existing comparisons
//   node src/cli.mjs list [filters] [--json]  list compared cases
//   node src/cli.mjs case <id> [--json]       show one case across both configurations
//   node src/cli.mjs experiment "<formula>" [--data '[[1,2]]'] [--excel] [--json]
//
// JSON output is stable and intended for AI agents and scripts.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS = path.join(ROOT, 'cases', 'public', 'corpus.json');
const ORACLE = path.join(ROOT, 'oracle', 'excel-results.json');
const argv = process.argv.slice(2);
const jsonOutput = argv.includes('--json');
const command = argv.find(arg => !arg.startsWith('--')) || 'help';

function readJson(file) { return JSON.parse(readFileSync(file, 'utf8')); }
function runNode(args, env = {}) {
  return spawnSync(process.execPath, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: jsonOutput ? 'ignore' : 'inherit' });
}
function runPwsh(args) {
  return spawnSync('pwsh', ['-NoProfile', '-File', ...args], { cwd: ROOT, stdio: jsonOutput ? 'ignore' : 'inherit' });
}
function fail(message) { console.error(message); process.exitCode = 1; }
function option(name, fallback = '') {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
}
function has(name) { return argv.includes(name); }

function loadComparisons() {
  const modes = ['default', 'compatible'];
  const result = {};
  for (const mode of modes) {
    const file = path.join(ROOT, 'out', mode, 'comparison.json');
    if (!existsSync(file)) return null;
    result[mode] = readJson(file);
  }
  return result;
}

function humanCase(entry) {
  const lines = [
    `${entry.id}  ${entry.meta.function}  [${entry.meta.category}]`,
    `formula: ${entry.meta.formula}`,
    `scenario: ${entry.meta.scenario.zh} / ${entry.meta.scenario.en}`,
  ];
  for (const mode of ['default', 'compatible']) {
    const row = entry.modes[mode];
    if (!row) continue;
    const excel = row.excel?.value ? JSON.stringify(row.excel.value.value ?? row.excel.value) : 'n/a';
    const spread = row.spreadjs?.value ? JSON.stringify(row.spreadjs.value.value ?? row.spreadjs.value) : 'n/a';
    lines.push(`${mode.padEnd(10)} ${row.outcome.padEnd(12)} Excel=${excel}  SpreadJS=${spread}  ${row.classification?.code || ''}`);
  }
  return lines.join('\n');
}

function cmdCase(id) {
  const comparisons = loadComparisons();
  if (!comparisons) return fail('comparison files missing; run "npm run check" first');
  const corpus = readJson(CORPUS);
  const meta = corpus.cases.find(item => item.id === id);
  if (!meta) return fail(`unknown case id: ${id}`);
  const entry = { id, meta, modes: {} };
  for (const mode of ['default', 'compatible']) {
    entry.modes[mode] = comparisons[mode].rows.find(row => row.id === id) || null;
  }
  if (jsonOutput) console.log(JSON.stringify(entry, null, 2));
  else console.log(humanCase(entry));
}

function cmdList() {
  const comparisons = loadComparisons();
  if (!comparisons) return fail('comparison files missing; run "npm run check" first');
  const mode = option('--mode', 'default');
  const comparison = comparisons[mode];
  if (!comparison) return fail(`unknown mode: ${mode}`);
  const corpus = readJson(CORPUS);
  const byId = Object.fromEntries(corpus.cases.map(item => [item.id, item]));
  const status = option('--status');
  const fn = option('--function').toUpperCase();
  const category = option('--category');
  const rows = comparison.rows
    .filter(row => !status || row.outcome === status)
    .filter(row => !fn || byId[row.id]?.function === fn)
    .filter(row => !category || byId[row.id]?.category === category)
    .map(row => ({
      id: row.id,
      function: byId[row.id]?.function,
      category: byId[row.id]?.category,
      dimension: byId[row.id]?.dimension || 'baseline',
      outcome: row.outcome,
      classification: row.classification?.code || null,
      formula: byId[row.id]?.formula,
      scenario: byId[row.id]?.scenario,
    }));
  if (jsonOutput) console.log(JSON.stringify(rows, null, 2));
  else {
    console.log(`mode=${mode} cases=${rows.length}`);
    for (const row of rows) console.log(`${row.outcome.padEnd(12)} ${row.id.padEnd(18)} ${String(row.function).padEnd(14)} ${row.classification || ''}`);
  }
}

function cmdExperiment(formula) {
  if (!formula || !formula.startsWith('=')) return fail('usage: node src/cli.mjs experiment "=SUM(1,2)"');
  const dir = path.join(ROOT, 'out', 'experiment');
  mkdirSync(dir, { recursive: true });
  const data = option('--data') ? JSON.parse(option('--data')) : [];
  const document = {
    name: 'experiment',
    cases: [{
      id: 'EXP-1',
      category: 'math',
      function: 'EXPERIMENT',
      dimension: 'baseline',
      scenario: { zh: '临时实验公式', en: 'Ad-hoc experiment formula' },
      formula,
      data,
      priority: 'P1',
      source: 'cli-experiment',
    }],
  };
  const casesFile = path.join(dir, 'cases.json');
  writeFileSync(casesFile, JSON.stringify(document, null, 2));
  const spreadFile = path.join(dir, 'spreadjs-results.json');
  const spread = runNode(['src/spreadjs/run.mjs', path.relative(ROOT, casesFile), path.relative(ROOT, spreadFile)]);
  if (spread.status !== 0) return fail('SpreadJS runner failed');
  const spreadResult = readJson(spreadFile).results['EXP-1'];
  const output = { formula, data, spreadjs: spreadResult.value, status: spreadResult.status, message: spreadResult.message || '' };
  if (has('--excel')) {
    if (process.platform !== 'win32') return fail('--excel requires Windows with desktop Excel');
    const excelFile = path.join(dir, 'excel-results.json');
    const excel = runPwsh(['src/excel/run.ps1', '-Cases', path.relative(ROOT, casesFile), '-Out', path.relative(ROOT, excelFile), '-Workbook', 'out/experiment/excel-workbook.xlsx']);
    if (excel.status !== 0) return fail('Excel runner failed');
    const excelResult = readJson(excelFile).results['EXP-1'];
    const comparisonFile = path.join(dir, 'comparison.json');
    const compare = runNode(['src/compare.mjs', path.relative(ROOT, casesFile), path.relative(ROOT, excelFile), path.relative(ROOT, spreadFile), path.relative(ROOT, comparisonFile), 'default']);
    if (compare.status !== 0 && compare.status !== 2) return fail('compare failed');
    Object.assign(output, { excel: excelResult.value, comparison: readJson(comparisonFile).rows[0] });
  }
  if (jsonOutput) console.log(JSON.stringify(output, null, 2));
  else {
    console.log(`formula: ${formula}`);
    console.log(`SpreadJS ${spreadResult.status}: ${JSON.stringify(spreadResult.value)}`);
    if (output.excel) console.log(`Excel: ${JSON.stringify(output.excel)}`);
    if (output.comparison) console.log(`outcome: ${output.comparison.outcome}${output.comparison.classification ? ' (' + output.comparison.classification.code + ')' : ''}`);
  }
}

function cmdPipeline(mode) {
  const pipeline = runNode(['src/pipeline.mjs', mode]);
  if (pipeline.status !== 0) process.exitCode = pipeline.status || 1;
}

if (command === 'run') cmdPipeline('check');
else if (command === 'refresh') cmdPipeline('refresh');
else if (command === 'report') cmdPipeline('report');
else if (command === 'case') cmdCase(option('--id', argv[argv.indexOf('case') + 1]));
else if (command === 'list') cmdList();
else if (command === 'experiment') cmdExperiment(argv[argv.indexOf('experiment') + 1]);
else {
  console.log(`Usage:
  node src/cli.mjs run|refresh|report [--json]
  node src/cli.mjs list [--mode default|compatible] [--status PASS|FAIL|...] [--function SUM] [--category math] [--json]
  node src/cli.mjs case <id> [--json]
  node src/cli.mjs experiment "=<formula>" [--data '[[1,2]]'] [--excel] [--json]`);
  if (command !== 'help') process.exitCode = 1;
}
