// Pre-publication scan: look for local paths, secrets and oversized files.
// Run before publishing: node scripts/release-check.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', 'out', '.git']);
const PATTERNS = [
  { name: 'absolute Windows path', re: /[A-Za-z]:\\+Users\\/i },
  { name: 'absolute dev path', re: /[A-Za-z]:\\+DevWithAI/i },
  { name: 'internal workspace name', re: /sjs-vs-excel|product-analysis/i },
  { name: 'jira token variable', re: /JIRA_[A-Z_]*TOKEN/ },
  { name: 'secret keyword', re: /\b(password|secret|api[_-]?key|access[_-]?token)\b/i },
];
const MAX_BYTES = 5 * 1024 * 1024;
const TEXT_EXT = new Set(['.md', '.mjs', '.js', '.json', '.ps1', '.csv', '.html', '.txt', '.yml', '.yaml']);

const findings = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP.has(entry.name)) continue;
      walk(full);
      continue;
    }
    const rel = path.relative(ROOT, full).replaceAll('\\', '/');
    if (rel === 'scripts/release-check.mjs') continue; // contains the patterns themselves
    const size = statSync(full).size;
    if (size > MAX_BYTES) findings.push(`${rel}: ${(size / 1024 / 1024).toFixed(1)} MB exceeds 5 MB`);
    if (!TEXT_EXT.has(path.extname(entry.name).toLowerCase())) continue;
    const content = readFileSync(full, 'utf8');
    for (const pattern of PATTERNS) {
      const match = content.match(pattern.re);
      if (match) findings.push(`${rel}: ${pattern.name} -> "${match[0]}"`);
    }
  }
}

walk(ROOT);
if (findings.length) {
  console.error('release-check failed:');
  for (const finding of findings) console.error(' - ' + finding);
  process.exitCode = 1;
} else {
  console.log('release-check passed: no local paths, secrets or oversized files found.');
}
