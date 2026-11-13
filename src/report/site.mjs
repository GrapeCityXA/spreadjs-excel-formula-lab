// Build the self-contained bilingual compatibility report under site/.
//
// Inputs: cases/public/corpus.json, oracle manifest + Excel results, and one
// comparison.json per SpreadJS configuration. Outputs: site/index.html plus
// compatibility.json / compatibility.csv for machine consumption.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'site');
const CORPUS = path.join(ROOT, 'cases', 'public', 'corpus.json');
const ORACLE = path.join(ROOT, 'oracle', 'excel-results.json');
const MANIFEST = path.join(ROOT, 'oracle', 'manifest.json');
const KNOWN = path.join(ROOT, 'docs', 'known-differences.json');
const MODES = [
  { id: 'default', label: { zh: '默认模式', en: 'Default mode' } },
  { id: 'compatible', label: { zh: 'ExcelCompatibleCalcMode', en: 'ExcelCompatibleCalcMode' } },
];

const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const pickResult = result => result && ({
  status: result.status,
  value: result.value,
  displayText: result.displayText,
  range: result.range,
  inputs: result.inputs,
  spill: result.spill,
  elapsedMs: result.elapsedMs,
});
const sanitizeEnvironment = environment => {
  const excel = environment?.excel || {};
  const spreadjs = environment?.spreadjs || {};
  return {
    excel: { version: excel.version, build: excel.excelBuild, culture: excel.culture, date1904: excel.date1904, calculation: excel.calculation },
    spreadjs: { version: spreadjs.version, culture: spreadjs.culture, excelCompatibleCalcMode: spreadjs.excelCompatibleCalcMode, registeredFunctionCount: spreadjs.registeredFunctionCount, bundleBytes: spreadjs.bundleBytes },
  };
};

const pkg = readJson(path.join(ROOT, 'package.json'));
const corpus = readJson(CORPUS);
const oracle = readJson(ORACLE);
const manifest = existsSync(MANIFEST) ? readJson(MANIFEST) : null;
const known = existsSync(KNOWN) ? readJson(KNOWN) : { items: [] };
const caseIndex = Object.fromEntries(corpus.cases.map(item => [item.id, {
  id: item.id,
  function: item.function,
  category: item.category,
  dimension: item.dimension || 'baseline',
  priority: item.priority || 'P1',
  formula: item.formula,
  scenario: item.scenario,
}]));

const modes = MODES.map(mode => {
  const comparison = readJson(path.join(ROOT, 'out', mode.id, 'comparison.json'));
  return {
    id: mode.id,
    label: mode.label,
    counts: comparison.counts,
    classificationCounts: comparison.classificationCounts,
    environment: sanitizeEnvironment(comparison.environment),
    rows: comparison.rows.map(row => ({
      id: row.id,
      outcome: row.outcome,
      reason: row.reason || '',
      classification: row.classification ? { code: row.classification.code, label: row.classification.label } : null,
      differences: row.differences || null,
      excel: pickResult(row.excel),
      spreadjs: pickResult(row.spreadjs),
    })),
  };
});

// Cases whose verdict changes between the two SpreadJS configurations are
// configuration-sensitive, not necessarily product differences.
const modeRows = Object.fromEntries(modes.map(mode => [mode.id, Object.fromEntries(mode.rows.map(row => [row.id, row]))]));
const crossMode = {};
for (const id of Object.keys(caseIndex)) {
  const defaultOutcome = modeRows.default?.[id]?.outcome;
  const compatibleOutcome = modeRows.compatible?.[id]?.outcome;
  if (defaultOutcome && compatibleOutcome && defaultOutcome !== compatibleOutcome) {
    crossMode[id] = { default: defaultOutcome, compatible: compatibleOutcome };
  }
}

const data = {
  generatedAt: new Date().toISOString(),
  product: { name: pkg.name, version: pkg.version },
  spreadjs: manifest?.spreadjs || { package: '@grapecity-software/spread-sheets', version: modes[0]?.environment?.spreadjs?.version },
  excel: manifest?.excel || { version: oracle.meta?.excelVersion, build: oracle.meta?.excelBuild, culture: oracle.meta?.culture },
  corpus: {
    caseCount: corpus.caseCount,
    functionCount: corpus.functionCount,
    categories: corpus.categories,
    functions: corpus.functions,
    dimensions: Object.fromEntries([...new Set(corpus.cases.map(item => item.dimension || 'baseline'))].map(dimension => [dimension, corpus.cases.filter(item => (item.dimension || 'baseline') === dimension).length])),
  },
  knownDifferences: known.items || [],
  crossMode,
  cases: caseIndex,
  modes,
};

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
const csvRows = [['id', 'mode', 'category', 'function', 'dimension', 'scenario_zh', 'scenario_en', 'formula', 'outcome', 'classification', 'excel_type', 'excel_value', 'spreadjs_type', 'spreadjs_value']];
for (const mode of modes) {
  for (const row of mode.rows) {
    const item = caseIndex[row.id] || {};
    const ex = row.excel?.value || {};
    const sp = row.spreadjs?.value || {};
    csvRows.push([
      row.id, mode.id, item.category, item.function, item.dimension,
      item.scenario?.zh, item.scenario?.en, item.formula, row.outcome,
      row.classification?.code || '',
      ex.type || '', JSON.stringify(ex.value ?? ''), sp.type || '', JSON.stringify(sp.value ?? ''),
    ]);
  }
}
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'compatibility.json'), JSON.stringify(data, null, 2) + '\n');
writeFileSync(path.join(OUT, 'compatibility.csv'), '\ufeff' + csvRows.map(row => row.map(csvEscape).join(',')).join('\n') + '\n');

const embedded = JSON.stringify(data).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SpreadJS × Excel Formula Compatibility Lab</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#18212f;--muted:#667085;--line:#e4e7ec;--brand:#0b5bd3;--pass:#087443;--pass-bg:#e7f6ee;--fail:#b42318;--fail-bg:#fdeceb;--warn:#b54708;--warn-bg:#fef3e6;--info:#175cd3;--info-bg:#eaf1fd;--shadow:0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.1)}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.wrap{max-width:1220px;margin:0 auto;padding:28px 20px 60px}
header.hero{display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;align-items:flex-end;padding:22px 24px;border-radius:14px;background:linear-gradient(135deg,#0b2b5b,#0b5bd3);color:#fff;box-shadow:var(--shadow)}
h1{margin:0;font-size:23px;letter-spacing:.2px}h2{font-size:17px;margin:26px 0 10px}
.hero .env{font-size:12.5px;opacity:.92;line-height:1.7}.hero .env b{font-weight:600}
.langbtn{border:1px solid rgba(255,255,255,.5);background:transparent;color:#fff;border-radius:999px;padding:6px 14px;cursor:pointer;font-size:13px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:12px;margin-top:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;box-shadow:var(--shadow)}
.card .k{font-size:12px;color:var(--muted)}.card .v{font-size:23px;font-weight:650;margin-top:2px}.card .u{font-size:12px;color:var(--muted);margin-left:2px}
.nav{display:flex;gap:8px;margin:20px 0 10px;flex-wrap:wrap;align-items:center}
.nav button{border:1px solid var(--line);background:#fff;color:var(--ink);padding:8px 14px;border-radius:999px;cursor:pointer;font-size:13px}
.nav button.active{background:var(--ink);color:#fff;border-color:var(--ink)}
.modes{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
.modes button{border:1px solid var(--line);background:#fff;color:var(--ink);padding:6px 12px;border-radius:8px;cursor:pointer;font-size:12.5px}
.modes button.active{background:var(--info-bg);border-color:#b2ccf5;color:var(--info)}
.toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:12px 0}
.toolbar input,.toolbar select{padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:#fff;font-size:13px;color:var(--ink)}
.toolbar input{min-width:230px;flex:1;max-width:420px}
.hint{color:var(--muted);font-size:12px}
table{width:100%;border-collapse:separate;border-spacing:0;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;box-shadow:var(--shadow)}
th,td{padding:9px 11px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top;font-size:13px}
th{background:#f8fafc;color:var(--muted);font-weight:600;white-space:nowrap}
tr.row{cursor:pointer}tr.row:hover td{background:#fafbff}
tr.row:last-child td{border-bottom:1px solid var(--line)}
.badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap}
.pass{color:var(--pass);background:var(--pass-bg)}.fail{color:var(--fail);background:var(--fail-bg)}.warn{color:var(--warn);background:var(--warn-bg)}.info{color:var(--info);background:var(--info-bg)}
.mono{font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;font-size:12.5px}
.nowrap{white-space:nowrap}.muted{color:var(--muted)}
.formula{max-width:330px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#344054}
.scenario{max-width:310px;color:var(--muted)}
.detail{display:none;background:#fbfcfe}.detail.open{display:table-row}
.detail .inner{padding:4px 14px 18px;display:grid;grid-template-columns:1.1fr 1fr 1fr;gap:12px}
.detail h4{margin:12px 0 6px;font-size:13px}
.panel{background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 12px;min-width:0}
.panel .kv{display:grid;grid-template-columns:105px 1fr;gap:4px 10px;font-size:12.5px}
.panel .kv .k{color:var(--muted)}
pre{white-space:pre-wrap;word-break:break-word;margin:0;font-size:12px;line-height:1.5;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
.note{background:#fffaeb;border:1px solid #fedf89;color:#7a2e0e;padding:10px 12px;border-radius:10px;font-size:13px;margin:14px 0}
footer{margin-top:26px;color:var(--muted);font-size:12px;line-height:1.7}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin-top:6px}
.hidden{display:none}
@media (max-width:900px){.detail .inner{grid-template-columns:1fr}.formula{max-width:180px}.scenario{max-width:180px}}
</style>
</head>
<body>
<div class="wrap">
<header class="hero">
  <div>
    <h1 id="title"></h1>
    <div class="env" id="envLine"></div>
  </div>
  <div class="env" id="runLine"></div>
  <button class="langbtn" id="langBtn"></button>
</header>

<div class="cards" id="cards"></div>

<div class="nav" id="nav"></div>
<div class="modes" id="modes"></div>

<section id="viewDetail">
  <div class="toolbar">
    <input id="search">
    <select id="status"></select>
    <select id="category"></select>
    <select id="dimension"></select>
    <span class="hint" id="countLine"></span>
  </div>
  <table><thead id="detailHead"></thead><tbody id="detailBody"></tbody></table>
</section>

<section id="viewMatrix" class="hidden">
  <div class="toolbar"><input id="matrixSearch"><span class="hint" id="matrixCount"></span></div>
  <table><thead id="matrixHead"></thead><tbody id="matrixBody"></tbody></table>
</section>

<section id="viewKnown" class="hidden">
  <div class="note" id="knownNote"></div>
  <table><thead id="knownHead"></thead><tbody id="knownBody"></tbody></table>
  <div id="knownExtra"></div>
</section>

<footer>
  <div id="foot1"></div>
  <div id="foot2"></div>
  <div>Download: <a href="compatibility.csv">compatibility.csv</a> · <a href="compatibility.json">compatibility.json</a></div>
</footer>
</div>
<script>
const DATA = ${embedded};

const I18N = {
  zh: {
    title: 'SpreadJS × Excel 公式兼容性实验台',
    subtitle: '可复现的公式计算结果对比',
    env: '被测：<b>SpreadJS {sjs}</b>（{pkg}）· 基线：<b>Microsoft Excel {excel}</b> build {build} · 区域 {culture} · 1900 日期系统',
    run: '用例 {cases} 条 · 函数 {functions} 个<br>生成于 {time} UTC',
    cards: { cases: '用例总数', functions: '覆盖函数', pass: '通过', fail: '差异', inconclusive: '待判定', env: '环境类差异', config: '跨配置差异' },
    configDependent: '跨配置结果不同',
    knownConfigTitle: '两种配置下结果不同的用例',
    knownConfigNote: '这些用例在默认模式与 ExcelCompatibleCalcMode 下得到不同结果，报告按配置分别展示。',
    nav: { detail: '用例明细', matrix: '函数矩阵', known: '已知差异' },
    mode: { default: '默认模式', compatible: 'ExcelCompatibleCalcMode' },
    search: '搜索 ID、函数、公式、场景…',
    allStatus: '全部状态', allCategory: '全部分类', allDimension: '全部维度',
    showing: '显示 {n} / {total} 条',
    status: { PASS: '通过', FAIL: '差异', INCONCLUSIVE: '待判定', INVALID: '无效用例', EXEC_FAIL: '执行失败' },
    cols: { status: '状态', id: '用例', function: '函数', category: '分类', dimension: '维度', scenario: '场景', formula: '公式', diff: '差异分类', cases: '用例数', passCol: '通过', failCol: '差异', otherCol: '其他', note: '说明', excel: 'Excel 结果', sjs: 'SpreadJS 结果', inputs: '输入数据', value: '值', display: '显示文本', elapsed: '耗时', diffCells: '区域差异单元格', defaultMode: '默认模式', compatibleMode: '兼容模式' },
    categories: { math: '数学与三角函数', statistical: '统计函数', text: '文本函数', date: '日期与时间函数', logical: '逻辑函数', lookup: '查找与引用函数', information: '信息函数', financial: '财务函数', engineering: '工程函数', database: '数据库函数', compatibility: '兼容函数', web: '网络函数', addin: '加载项函数' },
    dimensions: { baseline: '基线', boundary: '边界', 'type-coercion': '类型转换', reference: '引用', array: '数组', error: '错误', date: '日期', text: '文本', precision: '精度', lookup: '查找', config: '配置', combination: '组合', volatile: '易变' },

    classes: {
      EXCEL_FUNCTION_UNAVAILABLE: { label: 'Excel 未提供该函数（加载项/版本差异）' },
      EXCEL_ERROR_ONLY: { label: 'Excel 报错而 SpreadJS 正常返回' },
      LOCALE_DIFF: { label: '文本不同（疑似区域/货币设置差异）' },
      SPREADJS_ERROR: { label: 'SpreadJS 返回错误而 Excel 正常' },
      ERROR_CODE_DIFF: { label: '错误码不同' },
      TYPE_DIFF: { label: '结果类型不同' },
      PRECISION_DIFF: { label: '数值精度差异' },
      VALUE_DIFF: { label: '数值不同' },
      TEXT_DIFF: { label: '文本结果不同' },
      BOOLEAN_DIFF: { label: '布尔结果不同' },
      ARRAY_VALUE_DIFF: { label: '区域结果有单元格不同' },
      ARRAY_SHAPE_DIFF: { label: '动态数组溢出区域不同' },
      OTHER_DIFF: { label: '结果不同' }
    },
    empty: '（空）',
    noData: '（该用例没有数据区）',
    knownNote: '以下差异来自 2026-10 的试点基线，并在当前版本上复跑；数值为实测值，具体以对应版本和环境为准。',
    foot1: '判定口径：数值默认容差 1e-9；文本、布尔、错误码精确比较；日期按 Excel 1900 序列值比较；数组按 readRange 逐格比较。',
    foot2: '结果与环境绑定，由 npm run refresh / npm run check 生成，不代表对所有 Excel 版本或全部函数的兼容性承诺。',
    repro: '复现',
    unknown: '—'
  },
  en: {
    title: 'SpreadJS × Excel Formula Compatibility Lab',
    subtitle: 'A reproducible comparison of calculated formula results',
    env: 'Tested: <b>SpreadJS {sjs}</b> ({pkg}) · Baseline: <b>Microsoft Excel {excel}</b> build {build} · culture {culture} · 1900 date system',
    run: '{cases} cases · {functions} functions<br>generated {time} UTC',
    cards: { cases: 'Cases', functions: 'Functions', pass: 'Pass', fail: 'Diff', inconclusive: 'Inconclusive', env: 'Environment diffs', config: 'Cross-config diffs' },
    configDependent: 'Differs across configs',
    knownConfigTitle: 'Cases with different results across configurations',
    knownConfigNote: 'These cases produce different results in default mode and ExcelCompatibleCalcMode. The report shows each configuration separately.',
    nav: { detail: 'Cases', matrix: 'Function matrix', known: 'Known differences' },
    mode: { default: 'Default mode', compatible: 'ExcelCompatibleCalcMode' },
    search: 'Search id, function, formula, scenario…',
    allStatus: 'All statuses', allCategory: 'All categories', allDimension: 'All dimensions',
    showing: '{n} of {total}',
    status: { PASS: 'Pass', FAIL: 'Diff', INCONCLUSIVE: 'Inconclusive', INVALID: 'Invalid case', EXEC_FAIL: 'Execution failed' },
    cols: { status: 'Status', id: 'Case', function: 'Function', category: 'Category', dimension: 'Dimension', scenario: 'Scenario', formula: 'Formula', diff: 'Classification', cases: 'Cases', passCol: 'Pass', failCol: 'Diff', otherCol: 'Other', note: 'Note', excel: 'Excel', sjs: 'SpreadJS', inputs: 'Inputs', value: 'Value', display: 'Display text', elapsed: 'Time', diffCells: 'Differing cells', defaultMode: 'Default mode', compatibleMode: 'Compatible mode' },
    categories: { math: 'Math & Trig', statistical: 'Statistical', text: 'Text', date: 'Date & Time', logical: 'Logical', lookup: 'Lookup & Reference', information: 'Information', financial: 'Financial', engineering: 'Engineering', database: 'Database', compatibility: 'Compatibility', web: 'Web', addin: 'Add-in' },
    dimensions: { baseline: 'Baseline', boundary: 'Boundary', 'type-coercion': 'Type coercion', reference: 'Reference', array: 'Array', error: 'Error', date: 'Date', text: 'Text', precision: 'Precision', lookup: 'Lookup', config: 'Config', combination: 'Combination', volatile: 'Volatile' },

    classes: {
      EXCEL_FUNCTION_UNAVAILABLE: { label: 'Excel lacks this function (add-in/version gap)' },
      EXCEL_ERROR_ONLY: { label: 'Excel errors, SpreadJS returns a value' },
      LOCALE_DIFF: { label: 'Text differs (likely locale/currency)' },
      SPREADJS_ERROR: { label: 'SpreadJS errors, Excel returns a value' },
      ERROR_CODE_DIFF: { label: 'Different error code' },
      TYPE_DIFF: { label: 'Different result type' },
      PRECISION_DIFF: { label: 'Numeric precision difference' },
      VALUE_DIFF: { label: 'Different numeric value' },
      TEXT_DIFF: { label: 'Different text' },
      BOOLEAN_DIFF: { label: 'Different boolean' },
      ARRAY_VALUE_DIFF: { label: 'Some cells in the range differ' },
      ARRAY_SHAPE_DIFF: { label: 'Different spilled range' },
      OTHER_DIFF: { label: 'Different result' }
    },
    empty: '(empty)',
    noData: '(no input data)',
    knownNote: 'These differences come from the 2026-10 pilot baseline and were re-run on the current version. Values are measured; the exact result depends on the tested version and environment.',
    foot1: 'Rules: numeric tolerance 1e-9; exact text/boolean/error comparison; dates compared as Excel 1900 serials; array results compared cell by cell over readRange.',
    foot2: 'Results are tied to the recorded environment and generated by npm run refresh / npm run check. They are not a compatibility guarantee for every Excel version or function.',
    repro: 'Reproduce',
    unknown: '—'
  }
};

const STATUS_CLASS = { PASS: 'pass', FAIL: 'fail', INCONCLUSIVE: 'warn', INVALID: 'warn', EXEC_FAIL: 'warn' };
const state = { lang: 'zh', view: 'detail', mode: 'default', search: '', status: '', category: '', dimension: '', matrixSearch: '' };
const $ = id => document.getElementById(id);
const t = key => {
  const value = key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), I18N[state.lang]);
  return value === undefined ? key : value;
};
const fmt = (template, values) => template.replace(/\\{(\\w+)\\}/g, (_, key) => values[key] === undefined ? '' : values[key]);
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const label = (group, key) => (I18N[state.lang][group] && I18N[state.lang][group][key]) || key;
const caseMeta = id => DATA.cases[id] || { id: id, function: '', category: '', dimension: '', scenario: { zh: '', en: '' }, formula: '' };
const currentMode = () => DATA.modes.find(mode => mode.id === state.mode) || DATA.modes[0];
const rowOf = (modeId, id) => (DATA.modes.find(mode => mode.id === modeId)?.rows || []).find(row => row.id === id);
const valueText = value => {
  if (!value) return t('unknown');
  if (value.type === 'empty') return t('empty');
  if (value.type === 'number') return String(value.value);
  if (value.type === 'bool') return value.value ? 'TRUE' : 'FALSE';
  if (value.type === 'text') return JSON.stringify(value.value);
  if (value.type === 'error') return String(value.value);
  if (value.type === 'date') return 'serial ' + value.value;
  return JSON.stringify(value);
};
const classLabel = row => {
  if (!row.classification) return row.reason || t('unknown');
  const code = row.classification.code;
  const info = I18N[state.lang].classes[code];
  return info ? info.label : (row.classification.label || code);
};

function renderHeader() {
  document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
  document.title = t('title');
  $('title').textContent = t('title');
  const sjs = DATA.spreadjs || {}, excel = DATA.excel || {};
  $('envLine').innerHTML = fmt(t('env'), {
    sjs: esc(sjs.version || '?'), pkg: esc(sjs.package || '@grapecity-software/spread-sheets'),
    excel: esc(excel.version || '?'), build: esc(excel.build || '?'), culture: esc(excel.culture || '?'),
  });
  $('runLine').innerHTML = fmt(t('run'), {
    cases: DATA.corpus.caseCount, functions: DATA.corpus.functionCount,
    time: esc((DATA.generatedAt || '').replace('T', ' ').slice(0, 16)),
  });
  $('langBtn').textContent = state.lang === 'zh' ? 'English' : '中文';
  $('langBtn').onclick = () => { state.lang = state.lang === 'zh' ? 'en' : 'zh'; render(); };
}

function renderCards() {
  const mode = currentMode();
  const cards = [
    [t('cards.cases'), DATA.corpus.caseCount, ''],
    [t('cards.functions'), DATA.corpus.functionCount, ''],
    [t('cards.pass'), mode.counts.PASS, ''],
    [t('cards.fail'), mode.counts.FAIL, ''],
    [t('cards.inconclusive'), mode.counts.INCONCLUSIVE, ''],
    [t('cards.config'), Object.keys(DATA.crossMode || {}).length, ''],
  ];
  $('cards').innerHTML = cards.map(([key, value]) => '<div class="card"><div class="k">' + key + '</div><div class="v">' + value + '</div></div>').join('');
}

function renderNav() {
  const views = [['detail', t('nav.detail')], ['matrix', t('nav.matrix')], ['known', t('nav.known')]];
  $('nav').innerHTML = views.map(([id, text]) => '<button class="' + (state.view === id ? 'active' : '') + '" data-view="' + id + '">' + text + '</button>').join('');
  $('nav').querySelectorAll('button').forEach(button => button.onclick = () => { state.view = button.dataset.view; render(); });
  $('modes').innerHTML = DATA.modes.map(mode => '<button class="' + (state.mode === mode.id ? 'active' : '') + '" data-mode="' + mode.id + '">' + esc(mode.label[state.lang]) + ' · ' + mode.counts.PASS + '/' + DATA.corpus.caseCount + '</button>').join('');
  $('modes').querySelectorAll('button').forEach(button => button.onclick = () => { state.mode = button.dataset.mode; render(); });
  $('modes').classList.toggle('hidden', state.view === 'known');
}

function renderDetail() {
  const mode = currentMode();
  $('search').placeholder = t('search');
  $('search').value = state.search;
  $('status').innerHTML = '<option value="">' + t('allStatus') + '</option>' + ['PASS', 'FAIL', 'INCONCLUSIVE', 'INVALID', 'EXEC_FAIL'].map(status => '<option value="' + status + '">' + label('status', status) + '</option>').join('');
  $('status').value = state.status;
  const categoryKeys = Object.keys(DATA.corpus.categories);
  $('category').innerHTML = '<option value="">' + t('allCategory') + '</option>' + categoryKeys.map(key => '<option value="' + key + '">' + label('categories', key) + '</option>').join('');
  $('category').value = state.category;
  $('dimension').innerHTML = '<option value="">' + t('allDimension') + '</option>' + Object.keys(DATA.corpus.dimensions).map(key => '<option value="' + key + '">' + label('dimensions', key) + '</option>').join('');
  $('dimension').value = state.dimension;
  $('detailHead').innerHTML = '<tr>' + ['status', 'id', 'function', 'scenario', 'dimension', 'formula', 'diff'].map(key => '<th>' + t('cols.' + key) + '</th>').join('') + '</tr>';
  const query = state.search.trim().toLowerCase();
  const rows = mode.rows.filter(row => {
    const meta = caseMeta(row.id);
    if (state.status && row.outcome !== state.status) return false;
    if (state.category && meta.category !== state.category) return false;
    if (state.dimension && meta.dimension !== state.dimension) return false;
    if (!query) return true;
    return [row.id, meta.function, meta.formula, meta.scenario.zh, meta.scenario.en, row.classification?.code].join(' ').toLowerCase().includes(query);
  });
  $('countLine').textContent = fmt(t('showing'), { n: rows.length, total: mode.rows.length });
  $('detailBody').innerHTML = rows.map((row, index) => {
    const meta = caseMeta(row.id);
    const detailId = 'd-' + state.mode + '-' + index;
    const inputs = row.excel?.inputs || [];
    const inputHtml = inputs.length
      ? '<table style="border:0;box-shadow:none"><thead><tr><th>#</th>' + inputs[0].map((_, column) => '<th>' + column + '</th>').join('') + '</tr></thead><tbody>' + inputs.map((cells, rowNumber) => '<tr><td>' + (rowNumber + 1) + '</td>' + cells.map(cell => '<td class="mono">' + esc(valueText(cell)) + '</td>').join('') + '</tr>').join('') + '</tbody></table>'
      : '<span class="muted">' + t('noData') + '</span>';
    const diffCells = row.differences ? '<div class="panel" style="margin-top:8px"><div class="k muted">' + t('cols.diffCells') + '</div><pre>' + esc(JSON.stringify(row.differences, null, 1)) + '</pre></div>' : '';
    return '<tr class="row" data-target="' + detailId + '">' +
      '<td><span class="badge ' + STATUS_CLASS[row.outcome] + '">' + label('status', row.outcome) + '</span>' + (DATA.crossMode[row.id] ? ' <span class="badge warn">' + t('configDependent') + '</span>' : '') + '</td>' +
      '<td class="mono nowrap">' + esc(row.id) + '</td>' +
      '<td class="mono nowrap">' + esc(meta.function) + '</td>' +
      '<td class="scenario">' + esc(meta.scenario[state.lang] || meta.scenario.zh) + '</td>' +
      '<td class="nowrap">' + label('dimensions', meta.dimension) + '</td>' +
      '<td class="formula mono" title="' + esc(meta.formula) + '">' + esc(meta.formula) + '</td>' +
      '<td>' + (row.classification ? '<span class="badge info">' + esc(row.classification.code) + '</span> ' + esc(classLabel(row)) : esc(classLabel(row))) + '</td></tr>' +
      '<tr class="detail" id="' + detailId + '"><td colspan="7"><div class="inner">' +
        '<div class="panel"><h4>' + t('cols.inputs') + '</h4>' + inputHtml + '</div>' +
        '<div class="panel"><h4>Excel</h4><div class="kv"><div class="k">' + t('cols.value') + '</div><div class="mono">' + esc(valueText(row.excel?.value)) + '</div><div class="k">' + t('cols.display') + '</div><div class="mono">' + esc(row.excel?.displayText || '') + '</div><div class="k">' + t('cols.elapsed') + '</div><div>' + esc(row.excel?.elapsedMs || '') + ' ms</div></div></div>' +
        '<div class="panel"><h4>SpreadJS</h4><div class="kv"><div class="k">' + t('cols.value') + '</div><div class="mono">' + esc(valueText(row.spreadjs?.value)) + '</div><div class="k">' + t('cols.display') + '</div><div class="mono">' + esc(row.spreadjs?.displayText || '') + '</div><div class="k">' + t('cols.elapsed') + '</div><div>' + esc(row.spreadjs?.elapsedMs || '') + ' ms</div></div>' +
        (row.classification ? '<div style="margin-top:8px"><span class="badge info">' + esc(row.classification.code) + '</span> ' + esc(classLabel(row)) + '</div>' : '') + diffCells + '</div>' +
      '</div></td></tr>';
  }).join('');
  $('detailBody').querySelectorAll('tr.row').forEach(element => element.onclick = () => {
    const detail = document.getElementById(element.dataset.target);
    if (detail) detail.classList.toggle('open');
  });
  $('search').oninput = event => { state.search = event.target.value; renderDetail(); };
  $('status').onchange = event => { state.status = event.target.value; renderDetail(); };
  $('category').onchange = event => { state.category = event.target.value; renderDetail(); };
  $('dimension').onchange = event => { state.dimension = event.target.value; renderDetail(); };
}

function aggregateFunctions() {
  const mode = currentMode();
  const map = new Map();
  for (const row of mode.rows) {
    const meta = caseMeta(row.id);
    const key = meta.function || '?';
    if (!map.has(key)) map.set(key, { function: key, category: meta.category, cases: 0, PASS: 0, FAIL: 0, other: 0, codes: new Set() });
    const entry = map.get(key);
    entry.cases += 1;
    if (row.outcome === 'PASS') entry.PASS += 1;
    else if (row.outcome === 'FAIL') { entry.FAIL += 1; if (row.classification?.code) entry.codes.add(row.classification.code); }
    else entry.other += 1;
  }
  return [...map.values()].sort((a, b) => (b.FAIL - a.FAIL) || a.function.localeCompare(b.function));
}

function renderMatrix() {
  const rows = aggregateFunctions();
  const query = state.matrixSearch.trim().toLowerCase();
  const filtered = rows.filter(entry => !query || entry.function.toLowerCase().includes(query) || label('categories', entry.category).toLowerCase().includes(query));
  $('matrixSearch').placeholder = t('search');
  $('matrixSearch').value = state.matrixSearch;
  $('matrixCount').textContent = fmt(t('showing'), { n: filtered.length, total: rows.length });
  $('matrixHead').innerHTML = '<tr><th>' + t('cols.function') + '</th><th>' + t('cols.category') + '</th><th>' + t('cols.cases') + '</th><th>' + t('cols.passCol') + '</th><th>' + t('cols.failCol') + '</th><th>' + t('cols.otherCol') + '</th><th>' + t('cols.diff') + '</th></tr>';
  $('matrixBody').innerHTML = filtered.map(entry => {
    const status = entry.FAIL ? 'fail' : (entry.other ? 'warn' : 'pass');
    return '<tr><td class="mono nowrap">' + esc(entry.function) + '</td><td>' + label('categories', entry.category) + '</td><td>' + entry.cases + '</td><td>' + entry.PASS + '</td><td>' + entry.FAIL + '</td><td>' + entry.other + '</td><td>' + (entry.codes.size ? [...entry.codes].map(code => '<span class="badge ' + status + '">' + esc(code) + '</span>').join(' ') : '<span class="badge ' + status + '">' + (entry.FAIL ? t('status.FAIL') : t('status.PASS')) + '</span>') + '</td></tr>';
  }).join('');
  $('matrixSearch').oninput = event => { state.matrixSearch = event.target.value; renderMatrix(); };
}

function renderKnown() {
  $('knownNote').textContent = t('knownNote');
  $('knownHead').innerHTML = '<tr><th>#</th><th>' + t('cols.id') + '</th><th>' + t('cols.function') + '</th><th>' + t('cols.formula') + '</th><th>Excel</th><th>SpreadJS</th><th>' + t('cols.note') + '</th></tr>';
  $('knownBody').innerHTML = (DATA.knownDifferences || []).map((item, index) => '<tr><td>' + (index + 1) + '</td><td class="mono nowrap">' + esc(item.id) + '</td><td class="mono">' + esc(item.function) + '</td><td class="formula mono" title="' + esc(item.formula) + '">' + esc(item.formula) + '</td><td class="mono">' + esc(item.excel) + '</td><td class="mono">' + esc(item.spreadjs) + '</td><td class="scenario">' + esc(item[state.lang] || item.zh) + '</td></tr>').join('');

  const configIds = Object.keys(DATA.crossMode || {}).sort();
  const extraRows = configIds.map(id => {
    const meta = caseMeta(id);
    const def = rowOf('default', id);
    const comp = rowOf('compatible', id);
    const outcomeBadge = (row) => '<span class="badge ' + (STATUS_CLASS[row?.outcome] || 'warn') + '">' + label('status', row?.outcome) + '</span>';
    return '<tr><td class="mono nowrap">' + esc(id) + '</td><td class="mono">' + esc(meta.function) + '</td><td class="formula mono" title="' + esc(meta.formula) + '">' + esc(meta.formula) + '</td><td>' + outcomeBadge(def) + '</td><td>' + outcomeBadge(comp) + '</td><td class="mono">' + esc(valueText(def?.excel?.value)) + '</td><td class="mono">' + esc(valueText(def?.spreadjs?.value)) + '</td></tr>';
  }).join('');
  $('knownExtra').innerHTML = '<h2>' + t('knownConfigTitle') + ' (' + configIds.length + ')</h2>' +
    '<div class="note">' + t('knownConfigNote') + '</div>' +
    (configIds.length
      ? '<table><thead><tr><th>' + t('cols.id') + '</th><th>' + t('cols.function') + '</th><th>' + t('cols.formula') + '</th><th>' + t('cols.defaultMode') + '</th><th>' + t('cols.compatibleMode') + '</th><th>Excel</th><th>SpreadJS</th></tr></thead><tbody>' + extraRows + '</tbody></table>'
      : '<div class="muted">' + t('unknown') + '</div>');
}

function render() {
  renderHeader();
  renderCards();
  renderNav();
  $('viewDetail').classList.toggle('hidden', state.view !== 'detail');
  $('viewMatrix').classList.toggle('hidden', state.view !== 'matrix');
  $('viewKnown').classList.toggle('hidden', state.view !== 'known');
  if (state.view === 'detail') renderDetail();
  if (state.view === 'matrix') renderMatrix();
  if (state.view === 'known') renderKnown();
  $('foot1').textContent = t('foot1');
  $('foot2').textContent = t('foot2');
}

render();
</script>
</body>
</html>`;

writeFileSync(path.join(OUT, 'index.html'), html, 'utf8');
console.log(`site: site/index.html (${modes.map(mode => `${mode.id}: ${mode.counts.PASS}/${corpus.caseCount} pass, ${mode.counts.FAIL} fail`).join(' | ')})`);
