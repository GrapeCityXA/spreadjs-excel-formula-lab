# Agent guide

This repository is designed to be cloned and driven by an AI coding agent. Everything is
deterministic, non-interactive and machine-readable; no server or GUI is required.

## What this repository does

It calculates a corpus of formulas twice — once with Microsoft Excel (a committed baseline
under `oracle/`) and once with SpreadJS (`@grapecity-software/spread-sheets`, CN distribution)
— then compares the values cell by cell and publishes a static report under `site/`.

## First commands

```powershell
npm install
npm run check          # runs SpreadJS + comparator; does NOT need Excel
```

Outputs:

- `out/default/comparison.json` and `out/compatible/comparison.json` — per-case verdicts
- `site/index.html` — bilingual report (also `site/compatibility.json` / `.csv`)
- `git status` should stay clean: generated run data is under `out/` (ignored) and `site/` (committed)

`npm run check` needs Node.js 22+ and a local Chrome/Edge. `npm run refresh` additionally
needs Windows with desktop Excel and rewrites the committed baseline.

## Commands an agent will usually want

```powershell
# all failing cases in the default configuration, as JSON
node src/cli.mjs list --status FAIL --json

# one case across both SpreadJS configurations
node src/cli.mjs case TC-MATH-003 --json

# ad-hoc formula against the installed SpreadJS build (about 3 seconds)
node src/cli.mjs experiment "=COUNT(\"2\",TRUE)" --json

# ad-hoc formula against SpreadJS and this machine's Excel (Windows + Excel)
node src/cli.mjs experiment "=COUNT(\"2\",TRUE)" --excel --json
```

Exit codes: `0` success, `2` differences were produced by a comparison step, `1` execution or
input error. `list`/`case` are read-only and never open Excel.

## How to read a result

- `PASS` — both engines agree within the rules in `docs/METHODOLOGY.md`.
- `FAIL` — values differ. Check `classification.code` first:
  `EXCEL_FUNCTION_UNAVAILABLE`, `EXCEL_ERROR_ONLY`, `LOCALE_DIFF` are usually environment
  differences; `VALUE_DIFF`, `TYPE_DIFF`, `SPREADJS_ERROR`, `PRECISION_DIFF` are candidate
  product differences and still need human review.
- `INVALID` — Excel contradicts the case's `expectError`; fix the case.
- `EXEC_FAIL` — a runner produced no result or the input snapshot differed; investigate the
  run log under `out/`.
- `INCONCLUSIVE` — volatile formulas, not asserted.

## Adding or changing cases

1. Edit a fragment in `cases/public/fragments/<category>.json` (schema v2: bilingual
   `scenario {zh, en}`, optional `note`, `dimension`, `priority`).
2. Run `npm run build:cases` to regenerate `cases/public/corpus.json`.
3. On Windows with Excel: `npm run refresh` to regenerate the oracle and report.
   Without Excel, only a maintainer can refresh the baseline; do not hand-edit `oracle/`.
4. Never change a case's meaning under an existing id; add a new id and keep the old one.

See `docs/CASE-DESIGN.md` for the design rules and `docs/METHODOLOGY.md` for judgement rules.

## Rules

- Do not commit `out/`, secrets, absolute paths or internal documents.
- SpreadJS is commercial software: install it as an npm dependency and do not redistribute its
  files. Excel is used only to refresh the baseline.
- A FAIL is not automatically a product defect. Triage environment and configuration first.
- Run `npm test` and `npm run release-check` before proposing a commit.
