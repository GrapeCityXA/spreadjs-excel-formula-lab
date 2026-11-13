// Case schema v2 (bilingual corpus).
//
// A case is one formula + one input block + one read area. `scenario` and
// `note` are bilingual; the public corpus expects both languages, while the
// build step can temporarily allow a missing English translation.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseCell, parseRange } from './shared/common.mjs';

export const CATEGORIES = [
  'math', 'statistical', 'text', 'date', 'logical', 'lookup', 'information',
  'financial', 'engineering', 'database', 'compatibility', 'web', 'addin',
];
export const DIMENSIONS = [
  'baseline', 'boundary', 'type-coercion', 'reference', 'array', 'error',
  'date', 'text', 'precision', 'lookup', 'config', 'combination', 'volatile',
];
export const PRIORITIES = ['P0', 'P1', 'P2'];
export const INPUT_ERRORS = ['#N/A', '#DIV/0!', '#VALUE!', '#NUM!'];

function validInput(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 2 && value.type === 'error' && INPUT_ERRORS.includes(value.value);
}

function isText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateCases(document, options = {}) {
  const errors = [];
  const { allowMissingEn = false } = options;
  if (!document || !Array.isArray(document.cases) || !document.cases.length) return ['cases must be a non-empty array'];
  const ids = new Set();
  for (const [index, item] of document.cases.entries()) {
    const label = item?.id || `#${index + 1}`;
    const error = message => errors.push(`${label}: ${message}`);
    if (!item || typeof item !== 'object' || Array.isArray(item)) { error('case must be an object'); continue; }
    if (typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(item.id)) error('id must contain 1-40 letters, digits, underscores or hyphens');
    if (ids.has(item.id)) error('duplicate id');
    ids.add(item.id);
    if (!CATEGORIES.includes(item.category)) error(`category must be one of ${CATEGORIES.join(', ')}`);
    if (typeof item.function !== 'string' || !item.function.trim()) error('function is required');
    if (!item.scenario || typeof item.scenario !== 'object' || Array.isArray(item.scenario)) {
      error('scenario must be an object {zh, en}');
    } else {
      if (!isText(item.scenario.zh)) error('scenario.zh is required');
      if (typeof item.scenario.en !== 'string' || (!allowMissingEn && !isText(item.scenario.en))) error('scenario.en is required');
    }
    if (item.dimension !== undefined && !DIMENSIONS.includes(item.dimension)) error(`dimension must be one of ${DIMENSIONS.join(', ')}`);
    if (item.priority !== undefined && !PRIORITIES.includes(item.priority)) error('priority must be P0, P1 or P2');
    if (item.note !== undefined) {
      if (!item.note || typeof item.note !== 'object' || Array.isArray(item.note) || !isText(item.note.zh)) error('note must be an object {zh, en}');
      else if (typeof item.note.en !== 'string' || (!allowMissingEn && !isText(item.note.en))) error('note.en is required');
    }
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
