// 共享工具：A1 坐标解析、值类型归一化、Excel 错误常量。
export const EXCEL_ERRORS = [
  '#NULL!', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A',
  '#GETTING_DATA', '#SPILL!', '#CALC!', '#FIELD!', '#BLOCKED!', '#CONNECT!', '#BUSY!', '#UNKNOWN!',
];

export function isErrorText(s) {
  return typeof s === 'string' && EXCEL_ERRORS.includes(s.toUpperCase());
}

// "H1" / "$H$1" -> {r: 0-based row, c: 0-based col}
export function parseCell(ref) {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,4})$/.exec(String(ref || '').trim());
  if (!m) return null;
  const col = m[1].toUpperCase().split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
  return { r: Number(m[2]) - 1, c: col };
}

export function cellName(r, c) {
  let n = c + 1;
  let s = '';
  while (n > 0) { const rem = (n - 1) % 26; s = String.fromCharCode(65 + rem) + s; n = Math.floor((n - 1) / 26); }
  return s + (r + 1);
}

// "H1:J3" -> {r1,c1,r2,c2}
export function parseRange(ref) {
  const parts = String(ref || '').trim().split(':');
  if (parts.length === 1) {
    const p = parseCell(parts[0]);
    return p ? { r1: p.r, c1: p.c, r2: p.r, c2: p.c } : null;
  }
  if (parts.length !== 2) return null;
  const a = parseCell(parts[0]);
  const b = parseCell(parts[1]);
  if (!a || !b) return null;
  return { r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c), r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c) };
}

export function rangeContainsCell(range, cell) {
  return cell.r >= range.r1 && cell.r <= range.r2 && cell.c >= range.c1 && cell.c <= range.c2;
}

export function rangeName(range) {
  return `${cellName(range.r1, range.c1)}:${cellName(range.r2, range.c2)}`;
}

// Excel 1900 日期系统序列值 <-> JS Date（本地时间语义）
export function dateToExcelSerial(date) {
  // 以本地年月日时分秒构造 UTC 时间，得到与 Excel 一致的序列值
  const ms = Date.UTC(
    date.getFullYear(), date.getMonth(), date.getDate(),
    date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds(),
  );
  const days = ms / 86400000;
  let serial = days + 25569; // 1970-01-01 -> 25569
  if (serial < 61) serial -= 1; // Excel 1900 闰年 bug：1900-01-01~1900-02-28 序列值比实际天数小 1
  return serial;
}

export function excelSerialToDate(serial) {
  const days = serial - 25569;
  const ms = Math.round(days * 86400000);
  return new Date(Date.UTC(1970, 0, 1) + ms);
}

export function caseDataExtent(data) {
  if (!Array.isArray(data) || data.length === 0) return { rows: 0, cols: 0 };
  const cols = Math.max(...data.map((r) => (Array.isArray(r) ? r.length : 0)));
  return { rows: data.length, cols };
}

