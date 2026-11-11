# SpreadJS × Excel Formula Compatibility Lab

A small, reproducible lab for comparing **SpreadJS formula calculation results** with
**Microsoft Excel** results. Each case is calculated by both engines, the two results are
compared cell by cell, and a static HTML report shows where they agree and where they differ.

This repository is intended as **evaluation material for the SpreadJS ecosystem**: users can
inspect the published result snapshot, run the same cases on their own machine, add cases, and
see exactly how a difference was produced.

> Status: **M1 walking skeleton**. The committed corpus is a starter set (29 cases / 25
> functions) that deliberately includes the known-difference seeds from a 2026-10 pilot, so the
> headline pass rate is **not** a compatibility score. Full corpus work is tracked separately.

## Quick start (no Excel required)

```powershell
npm install
npm run check
# open site/index.html
```

`npm run check` calculates every case with the installed SpreadJS package and compares it
against the **committed Excel oracle** (`oracle/`). It needs Node.js 22+ and a local
Chrome/Edge; it does not need Excel.

## Refresh the Excel baseline (Windows + desktop Excel)

```powershell
npm run refresh
```

This starts Excel through COM, calculates every case, saves the machine-readable oracle and
an auditable workbook (`oracle/excel-oracle-workbook.xlsx`), then re-runs SpreadJS in both
configuration modes and regenerates the report.

## What is compared

- **SpreadJS**: `@grapecity-software/spread-sheets` (CN distribution), pinned in `package.json`.
- **Excel**: the desktop Excel installed on the machine that runs `npm run refresh`; version,
  build, culture and date system are recorded in `oracle/manifest.json`.
- **Two SpreadJS configurations** are always reported separately:
  `default` and `ExcelCompatibleCalcMode = true`. Results from different modes are never merged.

## How to read the report

| Status | Meaning |
| --- | --- |
| `PASS` | Both engines agree within the comparison rules |
| `FAIL` | Results differ; see the automatic classification and check the raw values |
| `INVALID` | Excel's own result contradicts the case's declared `expectError` — fix the case |
| `EXEC_FAIL` | A run was missing a result or its input snapshot did not match the case |
| `INCONCLUSIVE` | A volatile formula cannot be asserted reliably |

Every diff also gets a **hint** such as `EXCEL_FUNCTION_UNAVAILABLE` (probably an Excel
add-in/version gap), `LOCALE_DIFF` (currency/culture), `PRECISION_DIFF`, `VALUE_DIFF`,
`SPREADJS_ERROR`, etc. Hints are triage aids, not root-cause verdicts.

## Repository layout

```
cases/public/     committed, public-safe cases
oracle/           committed Excel baseline (manifest + results + audit workbook)
src/              CLI, SpreadJS runner, Excel runner, comparator, report generator
site/             generated static report (index.html + machine-readable exports)
docs/             methodology, case design, known differences, release checklist
tests/            unit tests for the comparator and case validation
```

## Case design and Excel versions

Case design and the Excel baseline are the two things that matter most:

- Case design rules, dimensions, priority and review checklist: [`docs/CASE-DESIGN.md`](docs/CASE-DESIGN.md)
- Judgement rules, tolerances and known limitations: [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md)
- Known differences carried over from the pilot: [`docs/KNOWN-DIFFERENCES.md`](docs/KNOWN-DIFFERENCES.md)

The committed oracle reflects **one** Excel environment. Users with a different Excel version
can either use the committed baseline (`npm run check`) or generate their own (`npm run
refresh`, Windows only). Results are always tied to the recorded environment; this project
does not claim compatibility across all Excel versions or all functions.

## License and disclaimer

Repository code and case data are released under the MIT License (see [`LICENSE`](LICENSE)).
SpreadJS itself is commercial software and is **not** redistributed here; install it under your
own license. Microsoft Excel is required only to refresh the baseline. Trademarks belong to
their owners; see [`NOTICE`](NOTICE). Results describe the tested versions and environment and
are not an official compatibility statement.
