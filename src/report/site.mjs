// Build a self-contained static compatibility report under site/.
//
// Inputs: cases, the committed Excel oracle, and one comparison.json per
// SpreadJS configuration (default / ExcelCompatibleCalcMode).
// Outputs: site/index.html, site/compatibility.json, site/compatibility.csv.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'site');
const CASES = path.join(ROOT, 'cases', 'public', 'starter.json');
const ORACLE = path.join(ROOT, 'oracle', 'excel-results.json');
const MANIFEST = path.join(ROOT, 'oracle', 'manifest.json');
const MODES = [
  { id: 'default', label: '默认模式' },
  { id: 'compatible', label: 'ExcelCompatibleCalcMode' },
];

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const pkg = readJson(path.join(ROOT, 'package.json'));
const casesDoc = readJson(CASES);
const caseMap = Object.fromEntries(casesDoc.cases.map(item => [item.id, item]));
const oracle = readJson(ORACLE);
const manifest = existsSync(MANIFEST) ? readJson(MANIFEST) : null;

const modes = MODES.map(mode => {
  const comparison = readJson(path.join(ROOT, 'out', mode.id, 'comparison.json'));
  return {
    ...mode,
    counts: comparison.counts,
    classificationCounts: comparison.classificationCounts,
    environment: comparison.environment,
    rows: comparison.rows.map(row => ({
      id: row.id,
      category: row.category,
      function: row.function,
      scenario: row.scenario,
      formula: row.formula,
      priority: row.priority,
      outcome: row.outcome,
      reason: row.reason || '',
      classification: row.classification || null,
      differences: row.differences || null,
      excel: row.excel,
      spreadjs: row.spreadjs,
    })),
  };
});

const functions = [...new Set(casesDoc.cases.map(item => item.function))].sort((a, b) => a.localeCompare(b));
const categories = [...new Set(casesDoc.cases.map(item => item.category))];
const data = {
  generatedAt: new Date().toISOString(),
  product: { name: pkg.name, version: pkg.version },
  spreadjs: manifest?.spreadjs || { package: '@grapecity-software/spread-sheets', version: modes[0]?.environment?.spreadjs?.version },
  excel: manifest?.excel || { version: oracle.meta?.excelVersion, build: oracle.meta?.excelBuild, culture: oracle.meta?.culture },
  caseCount: casesDoc.cases.length,
  functionCount: functions.length,
  categories,
  cases: casesDoc.cases,
  modes,
};

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const csvRows = [['id', 'mode', 'category', 'function', 'scenario', 'formula', 'outcome', 'classification', 'attribution', 'excel_type', 'excel_value', 'spreadjs_type', 'spreadjs_value']];
for (const mode of modes) {
  for (const row of mode.rows) {
    const ex = row.excel?.value || {};
    const sp = row.spreadjs?.value || {};
    csvRows.push([
      row.id, mode.id, row.category, row.function, row.scenario, row.formula, row.outcome,
      row.classification?.code || '', row.classification?.attribution || '',
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
<title>SpreadJS × Excel 公式兼容性实验台</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#18212f;--muted:#667085;--line:#e4e7ec;--brand:#0b5bd3;--pass:#087443;--pass-bg:#e7f6ee;--fail:#b42318;--fail-bg:#fdeceb;--warn:#b54708;--warn-bg:#fef3e6;--info:#175cd3;--info-bg:#eaf1fd;--shadow:0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.1)}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:28px 20px 60px}
header.hero{display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;align-items:flex-end;padding:22px 24px;border-radius:14px;background:linear-gradient(135deg,#0b2b5b,#0b5bd3);color:#fff;box-shadow:var(--shadow)}
h1{margin:0;font-size:24px;letter-spacing:.2px}h2{font-size:17px;margin:28px 0 10px}
.hero .env{font-size:12.5px;opacity:.92;line-height:1.7}.hero .env b{font-weight:600}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;box-shadow:var(--shadow)}
.card .k{font-size:12px;color:var(--muted)}.card .v{font-size:24px;font-weight:650;margin-top:2px}.card .u{font-size:12px;color:var(--muted);margin-left:2px}
.tabs{display:flex;gap:8px;margin:22px 0 12px;flex-wrap:wrap}
.tab{border:1px solid var(--line);background:#fff;color:var(--ink);padding:8px 14px;border-radius:999px;cursor:pointer;font-size:13px}
.tab.active{background:var(--ink);color:#fff;border-color:var(--ink)}
.toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:12px 0}
.toolbar input,.toolbar select{padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:#fff;font-size:13px;color:var(--ink)}
.toolbar input{min-width:240px;flex:1;max-width:420px}
.toolbar .hint{color:var(--muted);font-size:12px}
table{width:100%;border-collapse:separate;border-spacing:0;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;box-shadow:var(--shadow)}
th,td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top;font-size:13px}
th{background:#f8fafc;color:var(--muted);font-weight:600;white-space:nowrap}
tr.row{cursor:pointer}tr.row:hover td{background:#fafbff}
tr.row:last-child td{border-bottom:1px solid var(--line)}
.badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap}
.pass{color:var(--pass);background:var(--pass-bg)}.fail{color:var(--fail);background:var(--fail-bg)}.warn{color:var(--warn);background:var(--warn-bg)}.info{color:var(--info);background:var(--info-bg)}
.mono{font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;font-size:12.5px}
.formula{max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#344054}
.scenario{max-width:260px;color:var(--muted)}
.detail{display:none;background:#fbfcfe}.detail.open{display:table-row}
.detail .inner{padding:4px 14px 18px;display:grid;grid-template-columns:1.1fr 1fr 1fr;gap:12px}
.detail h4{margin:12px 0 6px;font-size:13px}
.panel{background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 12px;min-width:0}
.panel .kv{display:grid;grid-template-columns:110px 1fr;gap:4px 10px;font-size:12.5px}
.panel .kv .k{color:var(--muted)}
pre{white-space:pre-wrap;word-break:break-word;margin:0;font-size:12px;line-height:1.5;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
.note{background:#fffaeb;border:1px solid #fedf89;color:#7a2e0e;padding:10px 12px;border-radius:10px;font-size:13px;margin:14px 0}
footer{margin-top:26px;color:var(--muted);font-size:12px;line-height:1.7}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin-top:6px}
@media (max-width:900px){.detail .inner{grid-template-columns:1fr}.formula{max-width:200px}}
</style>
</head>
<body>
<div class="wrap">
<header class="hero">
  <div>
    <h1>SpreadJS × Excel 公式兼容性实验台</h1>
    <div class="env" id="envLine"></div>
  </div>
  <div class="env" id="runLine"></div>
</header>

<div class="cards" id="cards"></div>

<div class="tabs" id="tabs"></div>
<div class="toolbar">
  <input id="search" placeholder="搜索函数、ID、公式、场景…">
  <select id="status"><option value="">全部状态</option><option value="PASS">通过</option><option value="FAIL">差异</option><option value="INCONCLUSIVE">待判定</option><option value="INVALID">无效用例</option><option value="EXEC_FAIL">执行失败</option></select>
  <select id="category"><option value="">全部分类</option></select>
  <span class="hint" id="countLine"></span>
</div>
<table>
  <thead><tr><th>状态</th><th>用例</th><th>函数</th><th>场景</th><th>公式</th><th>差异分类</th></tr></thead>
  <tbody id="tbody"></tbody>
</table>

<div class="note" id="classNote"></div>

<footer>
  <div>判定口径：数值默认容差 1e-9；文本、布尔、错误码精确比较；日期按 Excel 1900 序列值比较；数组按 readRange 逐格比较。差异分类是自动初判，仍需人工复核。</div>
  <div>环境与实际结果绑定，本页数据由 <span class="mono">npm run refresh</span> / <span class="mono">npm run check</span> 生成，不构成对所有 Excel 版本或全部函数的行为承诺。</div>
  <div>下载：<a href="compatibility.csv">compatibility.csv</a> · <a href="compatibility.json">compatibility.json</a></div>
</footer>
</div>
<script>
const DATA = ${embedded};
const STATUS_CLASS = {PASS:'pass', FAIL:'fail', INCONCLUSIVE:'warn', INVALID:'warn', EXEC_FAIL:'warn'};
const STATUS_LABEL = {PASS:'通过', FAIL:'差异', INCONCLUSIVE:'待判定', INVALID:'无效用例', EXEC_FAIL:'执行失败'};
let activeMode = DATA.modes[0]?.id || 'default';

function esc(v){return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
function fmtValue(v){
  if (!v) return '—';
  if (v.type === 'empty') return '（空）';
  if (v.type === 'number') return String(v.value);
  if (v.type === 'bool') return v.value ? 'TRUE' : 'FALSE';
  if (v.type === 'text') return JSON.stringify(v.value);
  if (v.type === 'error') return String(v.value);
  if (v.type === 'date') return 'serial ' + v.value;
  return JSON.stringify(v);
}
function envText(){
  const s = DATA.spreadjs || {}, e = DATA.excel || {};
  document.getElementById('envLine').innerHTML =
    '被测：<b>SpreadJS ' + esc(s.version || '?') + '</b>（' + esc(s.package || '@grapecity-software/spread-sheets') + '）' +
    ' · 基线：<b>Microsoft Excel ' + esc(e.version || '?') + '</b> build ' + esc(e.build || '?') +
    ' · 区域 ' + esc(e.culture || '?') + ' · 1900 日期系统';
  document.getElementById('runLine').innerHTML =
    '用例 ' + DATA.caseCount + ' 条 · 函数 ' + DATA.functionCount + ' 个<br>生成于 ' + esc(DATA.generatedAt.replace('T',' ').slice(0,19)) + ' UTC';
}
function currentMode(){return DATA.modes.find(m => m.id === activeMode) || DATA.modes[0];}
function renderTabs(){
  document.getElementById('tabs').innerHTML = DATA.modes.map(m =>
    '<button class="tab ' + (m.id === activeMode ? 'active' : '') + '" data-mode="' + m.id + '">' + esc(m.label) +
    ' · ' + m.counts.PASS + '/' + DATA.caseCount + ' 通过</button>').join('');
  document.querySelectorAll('.tab').forEach(el => el.addEventListener('click', () => { activeMode = el.dataset.mode; renderTabs(); renderCards(); renderTable(); }));
}
function renderCards(){
  const m = currentMode();
  const cards = [
    ['用例总数', DATA.caseCount, ''],
    ['通过', m.counts.PASS, ''],
    ['差异', m.counts.FAIL, ''],
    ['待判定', m.counts.INCONCLUSIVE, ''],
    ['覆盖函数', DATA.functionCount, '个'],
    ['环境差异', Object.entries(m.classificationCounts || {}).filter(([k]) => ['EXCEL_FUNCTION_UNAVAILABLE','EXCEL_ERROR_ONLY','LOCALE_DIFF'].includes(k)).reduce((n,[,v]) => n+v, 0), '条'],
  ];
  document.getElementById('cards').innerHTML = cards.map(([k,v,u]) =>
    '<div class="card"><div class="k">' + k + '</div><div class="v">' + v + '<span class="u">' + (u||'') + '</span></div></div>').join('');
  const cls = m.classificationCounts || {};
  document.getElementById('classNote').innerHTML =
    '<b>差异分类（自动初判）</b>：' + (Object.keys(cls).length ? Object.entries(cls).map(([k,v]) => '<span class="badge info">' + esc(k) + ' × ' + v + '</span>').join(' ') : '无差异') +
    '<br><span style="font-size:12px">environment 类差异通常是 Excel 加载项/版本/区域设置造成，不应直接当作 SpreadJS 缺陷；product 类差异需研发复核。</span>';
}
function renderTable(){
  const m = currentMode();
  const q = document.getElementById('search').value.trim().toLowerCase();
  const st = document.getElementById('status').value;
  const cat = document.getElementById('category').value;
  document.getElementById('category').innerHTML = '<option value="">全部分类</option>' +
    DATA.categories.map(c => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');
  document.getElementById('category').value = cat;
  const rows = m.rows.filter(r => {
    if (st && r.outcome !== st) return false;
    if (cat && r.category !== cat) return false;
    if (!q) return true;
    return [r.id, r.function, r.formula, r.scenario, r.classification?.code].join(' ').toLowerCase().includes(q);
  });
  document.getElementById('countLine').textContent = '显示 ' + rows.length + ' / ' + m.rows.length + ' 条';
  document.getElementById('tbody').innerHTML = rows.map((r, i) => {
    const cls = STATUS_CLASS[r.outcome] || 'warn';
    const detailId = 'd-' + activeMode + '-' + i;
    const inputs = (r.excel?.inputs || []);
    const inputHtml = inputs.length
      ? '<table style="border:0;box-shadow:none"><thead><tr><th>#</th>' + inputs[0].map((_, ci) => '<th>列 ' + (ci+1) + '</th>').join('') + '</tr></thead><tbody>' +
        inputs.map((row, ri) => '<tr><td>' + (ri+1) + '</td>' + row.map(cell => '<td class="mono">' + esc(fmtValue(cell)) + '</td>').join('') + '</tr>').join('') + '</tbody></table>'
      : '<span style="color:#667085">（该用例没有数据区）</span>';
    const diffRows = r.differences ? '<div class="panel" style="margin-top:8px"><div class="k" style="color:#667085">区域差异单元格</div><pre>' + esc(JSON.stringify(r.differences, null, 1)) + '</pre></div>' : '';
    return '<tr class="row" data-target="' + detailId + '">' +
      '<td><span class="badge ' + cls + '">' + (STATUS_LABEL[r.outcome] || r.outcome) + '</span></td>' +
      '<td class="mono">' + esc(r.id) + '</td><td class="mono">' + esc(r.function) + '</td>' +
      '<td class="scenario">' + esc(r.scenario) + '</td><td class="formula mono" title="' + esc(r.formula) + '">' + esc(r.formula) + '</td>' +
      '<td>' + (r.classification ? '<span class="badge info">' + esc(r.classification.code) + '</span> ' + esc(r.classification.label) : (r.reason ? esc(r.reason) : '—')) + '</td></tr>' +
      '<tr class="detail" id="' + detailId + '"><td colspan="6"><div class="inner">' +
        '<div class="panel"><h4>输入数据</h4>' + inputHtml + '</div>' +
        '<div class="panel"><h4>Excel 结果</h4><div class="kv"><div class="k">状态</div><div>' + esc(r.excel?.status) + '</div><div class="k">值</div><div class="mono">' + esc(fmtValue(r.excel?.value)) + '</div><div class="k">显示文本</div><div class="mono">' + esc(r.excel?.displayText ?? '') + '</div><div class="k">耗时</div><div>' + esc(r.excel?.elapsedMs) + ' ms</div></div></div>' +
        '<div class="panel"><h4>SpreadJS 结果</h4><div class="kv"><div class="k">状态</div><div>' + esc(r.spreadjs?.status) + '</div><div class="k">值</div><div class="mono">' + esc(fmtValue(r.spreadjs?.value)) + '</div><div class="k">显示文本</div><div class="mono">' + esc(r.spreadjs?.displayText ?? '') + '</div><div class="k">耗时</div><div>' + esc(r.spreadjs?.elapsedMs) + ' ms</div></div>' +
        (r.classification ? '<div style="margin-top:8px"><span class="badge info">' + esc(r.classification.code) + '</span> ' + esc(r.classification.label) + '</div>' : '') +
        '<div style="margin-top:8px;color:#667085;font-size:12px">复现：<span class="mono">双击站点无法运行公式；请在仓库中执行 npm run check</span></div>' + diffRows + '</div>' +
      '</div></td></tr>';
  }).join('');
  document.querySelectorAll('tr.row').forEach(el => el.addEventListener('click', () => {
    const target = document.getElementById(el.dataset.target);
    if (target) target.classList.toggle('open');
  }));
}
document.getElementById('search').addEventListener('input', renderTable);
document.getElementById('status').addEventListener('change', renderTable);
document.getElementById('category').addEventListener('change', renderTable);
envText(); renderTabs(); renderCards(); renderTable();
</script>
</body>
</html>`;

writeFileSync(path.join(OUT, 'index.html'), html, 'utf8');
console.log(`site: site/index.html (${modes.map(m => `${m.id}: ${m.counts.PASS}/${data.caseCount} pass, ${m.counts.FAIL} fail`).join(' | ')})`);
