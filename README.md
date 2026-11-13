[![ci](https://github.com/GrapeCityXA/spreadjs-excel-formula-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/GrapeCityXA/spreadjs-excel-formula-lab/actions/workflows/ci.yml)

# SpreadJS × Excel Formula Compatibility Lab

English | [简体中文](README.zh-CN.md)

**Live report:** https://grapecityxa.github.io/spreadjs-excel-formula-lab/

A reproducible lab for comparing **SpreadJS formula calculation results** with **Microsoft
Excel** results. Every case is calculated by both engines, compared cell by cell, and published
as a static bilingual report. The repository is designed to be cloned and driven by people or
by an AI coding agent: there is no server, no interactive prompt and no Excel requirement for
the default check.

> Status: **M3 release candidate** — public-ready: 892 cases (887 common + 5 edge), 498 functions,
> 13 categories, bilingual cases, two SpreadJS configurations, committed Excel baseline.

## Snapshot (SpreadJS 19.2.2, Excel 16.0 build 20527, zh-CN)

| Configuration | Common scenarios (887) | Full corpus (892) |
| --- | --- | --- |
| Default | 860 pass / 21 diff | 860 pass / 26 diff |
| `ExcelCompatibleCalcMode = true` | 866 pass / 15 diff | 866 pass / 20 diff |

Both configurations also have 6 inconclusive volatile cases. The corpus deliberately includes the
17 known differences from the 2026-10 pilot, so this is **not** a compatibility score. Five
low-frequency/edge cases are excluded from the default common-scenario view; switch the report to
“All (incl. edge)” to see them. Read the report for the per-case detail and classification.

## Quick start (no Excel required)

```powershell
npm install
npm run check
# open site/index.html
```

`npm run check` runs SpreadJS from the npm dependency, compares it with the committed Excel
baseline under `oracle/`, and regenerates `site/`. Requirements: Node.js 22+ and a local
Chrome/Edge.

## Refresh the Excel baseline (Windows + desktop Excel)

```powershell
npm run refresh
```

This opens Excel through COM, calculates all cases, saves the audit workbook
`oracle/excel-oracle-workbook.xlsx`, records the Excel version/build/culture in
`oracle/manifest.json`, then reruns SpreadJS and regenerates the report.

## Use it with an AI agent

Point your agent at [`AGENTS.md`](AGENTS.md). Typical commands:

```powershell
node src/cli.mjs list --status FAIL --json        # all differing cases as JSON
node src/cli.mjs case TC-MATH-003 --json          # one case, both configurations
node src/cli.mjs experiment '=COUNT("2",TRUE)' --json           # ad-hoc SpreadJS run
node src/cli.mjs experiment '=COUNT("2",TRUE)' --excel --json   # plus local Excel
```

The CLI is non-interactive and returns JSON; `out/<mode>/comparison.json` contains the full
machine-readable verdicts. The committed `oracle/` means an agent can evaluate SpreadJS without
having Excel installed.

## What is compared

- **SpreadJS**: `@grapecity-software/spread-sheets` (CN distribution), pinned in `package.json`.
- **Excel**: the desktop Excel on the machine that runs `npm run refresh`; environment is
  recorded in `oracle/manifest.json` and shown at the top of the report.
- **Two configurations**, always reported separately: `default` and
  `ExcelCompatibleCalcMode = true`. They are never merged into one pass rate.

## Report

`site/index.html` (bilingual, toggle EN/中文) has three views:

- **Cases** — filter by status/category/dimension, expand a row to see inputs, Excel result,
  SpreadJS result and the automatic difference classification.
- **Function matrix** — per-function case counts and pass/diff counts; the fastest way to spot
  functions with repeated differences.
- **Known differences** — the pilot difference list with measured values and short notes.

`site/compatibility.csv` and `.json` are machine-readable exports.

## Case design and Excel versions

These are the two things that matter most:

- **Case design** — one semantic point per case, twelve dimensions (baseline, boundary, type
  coercion, reference, array, error, date, text, precision, lookup, config, combination),
  explicit priority, review checklist. See [`docs/en/CASE-DESIGN.md`](docs/en/CASE-DESIGN.md) (English) or [`docs/CASE-DESIGN.md`](docs/CASE-DESIGN.md) (中文).
- **Excel version** — the committed baseline reflects one Excel environment. Users with a
  different Excel version can either use the committed baseline (`check`) or generate their own
  (`refresh`, Windows only). Results are always tied to the recorded environment; this project
  does not claim compatibility across all Excel versions or functions. See
  [`docs/en/METHODOLOGY.md`](docs/en/METHODOLOGY.md) (English) or [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) (中文).

Coverage audit: [`docs/en/COVERAGE.md`](docs/en/COVERAGE.md) / [`docs/COVERAGE.md`](docs/COVERAGE.md).

Current corpus: 892 cases (887 common + 5 edge) / 498 functions, 13 categories; dimension mix: baseline 504, reference
181, array 57, precision 40, boundary 29, error 27, type-coercion 15, date 14, lookup 10,
text 10, volatile 6, config 2, combination 1. Priority mix: P0 225, P1 489, P2 178.

Docs are bilingual: English under `docs/en/`, Chinese at `docs/*.md`. Maintainer release steps are in [`docs/RELEASE-CHECKLIST.md`](docs/RELEASE-CHECKLIST.md).

## Repository layout

```
cases/public/fragments/   bilingual case fragments, one file per category (source of truth)
cases/public/corpus.json  generated, committed corpus used by the runners
oracle/                   committed Excel baseline: manifest + results + audit workbook
src/                      CLI, runners, comparator, report generator
site/                     generated bilingual report (committed snapshot)
docs/                     methodology, case design, known differences
tests/                    comparator and schema unit tests
```

Maintainer loop: edit a fragment → `npm run build:cases` → `npm run refresh` (Excel) →
commit the updated `oracle/`, `site/` and `corpus.json`.

## License and disclaimer

Code and case data are released under the MIT License (see [`LICENSE`](LICENSE)). SpreadJS is
commercial software and is **not** redistributed here; install it under your own license.
Microsoft Excel is needed only to refresh the baseline. See [`NOTICE`](NOTICE). Results describe
the tested versions and environment and are not an official compatibility statement.

Before publishing, run `npm run release-check` to scan for local paths, secrets and oversized
files.
