// Merge cases/public/fragments/*.json into the committed corpus.
//
//   node src/cases/build.mjs            # requires both languages
//   node src/cases/build.mjs --allow-missing-en
//
// The output is deterministic (no timestamp) so the committed corpus and the
// Excel oracle stay hash-compatible.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, validateCases } from '../validate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FRAGMENTS = path.join(ROOT, 'cases', 'public', 'fragments');
const OUTPUT = path.join(ROOT, 'cases', 'public', 'corpus.json');
const allowMissingEn = process.argv.includes('--allow-missing-en');

const files = readdirSync(FRAGMENTS).filter(name => name.endsWith('.json')).sort();
const cases = [];
const seen = new Set();
for (const file of files) {
  const doc = JSON.parse(readFileSync(path.join(FRAGMENTS, file), 'utf8'));
  for (const item of doc.cases || []) {
    if (seen.has(item.id)) throw new Error(`duplicate case id ${item.id} (fragment ${file})`);
    seen.add(item.id);
    cases.push(item);
  }
}

const errors = validateCases({ cases }, { allowMissingEn });
if (errors.length) {
  console.error(`invalid corpus (${errors.length} problem(s)):`);
  for (const error of errors.slice(0, 50)) console.error(' - ' + error);
  if (errors.length > 50) console.error(` ... and ${errors.length - 50} more`);
  process.exitCode = 1;
} else {
  const order = new Map(CATEGORIES.map((category, index) => [category, index]));
  cases.sort((a, b) => (order.get(a.category) - order.get(b.category)) || a.id.localeCompare(b.id));
  const byCategory = Object.fromEntries(CATEGORIES.map(category => [category, cases.filter(c => c.category === category).length]));
  const functions = [...new Set(cases.map(c => c.function))].sort();
  const document = {
    name: 'spreadjs-excel-formula-compatibility',
    schemaVersion: 2,
    caseCount: cases.length,
    functionCount: functions.length,
    categories: byCategory,
    functions,
    cases,
  };
  writeFileSync(OUTPUT, JSON.stringify(document, null, 2) + '\n');
  const missingEn = cases.filter(c => !c.scenario?.en || (c.note && !c.note.en)).length;
  console.log(`corpus: ${cases.length} cases, ${functions.length} functions`);
  console.log(`categories: ${JSON.stringify(byCategory)}`);
  console.log(`missing English: ${missingEn}${allowMissingEn ? ' (allowed)' : ''}`);
  console.log(`wrote ${path.relative(ROOT, OUTPUT)}`);
}
