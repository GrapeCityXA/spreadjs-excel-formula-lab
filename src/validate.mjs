import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseCell, parseRange } from './shared/common.mjs';

export const INPUT_ERRORS = ['#N/A', '#DIV/0!', '#VALUE!', '#NUM!'];

function validInput(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 2 && value.type === 'error' && INPUT_ERRORS.includes(value.value);
}

export function validateCases(document) {
  const errors = [];
  if (!document || !Array.isArray(document.cases) || !document.cases.length) return ['cases must be a non-empty array'];
  const ids = new Set();
  for (const [index, item] of document.cases.entries()) {
    const label = item?.id || `#${index + 1}`;
    const error = (message) => errors.push(`${label}: ${message}`);
    if (!item || typeof item !== 'object' || Array.isArray(item)) { error('case must be an object'); continue; }
    if (typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,31}$/.test(item.id)) error('id must contain 1-31 letters, digits, underscores or hyphens');
    if (ids.has(item.id)) error('duplicate id');
    ids.add(item.id);
    for (const field of ['category', 'function', 'scenario']) if (typeof item[field] !== 'string' || !item[field].trim()) error(`${field} is required`);
    if (typeof item.formula !== 'string' || !item.formula.startsWith('=') || item.formula.length < 2) error('formula must begin with =');
    const cell = parseCell(item.formulaCell || 'H1');
    if (!cell || cell.r < 0 || cell.c < 0 || cell.r >= 200 || cell.c >= 26) error('formulaCell must be within A1:Z200');
    const data = item.data ?? [];
    if (!Array.isArray(data) || data.length > 200 || data.some(row => !Array.isArray(row) || row.length > 26 || row.some(value => !validInput(value)))) error('data must contain valid scalars or supported error inputs within A1:Z200');
    else if (cell && cell.r < data.length && data.some(row => row.length > cell.c)) error('formulaCell overlaps data');
    if (item.readRange) {
      const range = parseRange(item.readRange);
      if (!range || !cell || range.r1 !== cell.r || range.c1 !== cell.c || range.r2 >= 200 || range.c2 >= 26) error('readRange must start at formulaCell and fit in A1:Z200');
    }
    if (item.arrayMode !== undefined && (item.arrayMode !== 'native' || !item.readRange)) error('arrayMode must be native and requires readRange');
    for (const field of ['expectError', 'volatile']) if (item[field] !== undefined && typeof item[field] !== 'boolean') error(`${field} must be boolean`);
    if (item.tolerance != null && (typeof item.tolerance !== 'object' || Array.isArray(item.tolerance) || Object.entries(item.tolerance).some(([key, value]) => !['abs', 'rel'].includes(key) || typeof value !== 'number' || !Number.isFinite(value) || value < 0))) error('invalid tolerance');
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const file = process.argv[2];
    if (!file) throw new Error('Usage: node src/validate.mjs <cases.json>');
    const document = JSON.parse(readFileSync(file, 'utf8'));
    const errors = validateCases(document);
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(`Validated ${document.cases.length} cases: ${file}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
