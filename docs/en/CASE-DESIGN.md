English | [简体中文](../CASE-DESIGN.md)

# Case design specification

> This document is the heart of the project: **the architecture is only plumbing — how much you can trust the conclusions depends on the cases and the baseline.**
> Read this first when adding cases, reviewing cases, or deciding whether a difference is a defect.

## 0. Current coverage (2026-11-13)

| Metric | Value |
| --- | --- |
| Cases | 888 |
| Functions | 496 (supported by both Excel and SpreadJS) |
| Categories | 13 |
| Priority | P0 224 / P1 486 / P2 178 |
| Dimensions | baseline 502, reference 181, array 57, precision 40, boundary 28, error 27, type coercion 14, date 14, lookup 10, text 6, volatile 6, config 2, composite 1 |

These numbers describe the coverage of the *current corpus*, not a compatibility verdict. When adding cases, fill in gaps in the dimension distribution rather than inflating the function count again.

## 1. One case verifies exactly one semantic point

Every case consists of "a set of inputs + one formula + one read range" and answers exactly one question, for example:

- How does `SUM` treat numeric text inside a range?
- How does `ROUND` round at the .5 boundary?
- When an exact-match `VLOOKUP` encounters duplicate keys, which row does it return?
- Does `DAYS` return 1 or 2 between 1900-02-28 and 1900-03-01?

Do not verify type coercion, rounding, and error propagation in a single formula — once a difference appears, you cannot attribute it.

## 2. Case dimensions

Every function gets at least one baseline case; core functions are deepened dimension by dimension. Dimensions are **the second ruler for coverage** (the first is the number of functions):

| Dimension | Description | Example |
| --- | --- | --- |
| Baseline | The most common, most intuitive input | `=SUM(A1:A4)` |
| Parameter boundaries | 0, negative numbers, extremely large/small values, omitted arguments, optional arguments | `=ROUND(2.5,0)`, `=MOD(-10,3)` |
| Type coercion | Numeric text, booleans, empty strings, error values; direct arguments vs range references | `=COUNT("2",TRUE)`, `=SUM(A1:A2)` (range containing text) |
| Reference form | Ranges, whole columns, array constants, absolute/relative references | `=SUM($A$1:$A$4)`, `=SUM({1,2;3,4})` |
| Array / spill | Dynamic arrays, CSE, broadcasting | `=UNIQUE(A1:A4)` + `readRange` |
| Error semantics | Error codes, error propagation, wrapping with `IFERROR` | `=SQRT(-1)`, `=1/0` |
| Date / time | 1900/1904, leap years, serial values, extremes | `=DAYS(DATE(1900,3,1),DATE(1900,2,28))` |
| Text / range | DBCS, case, wildcards, currency/decimal formats | `=MIDB("中文文本",3,2)`, `=DOLLAR(1234.567,2)` |
| Numeric precision | 15 significant digits, floating-point boundaries, approximation algorithms | `=TINV(0.05,10)`, `=BESSELK(1,0)` |
| Lookup matching | Exact / approximate / wildcard / duplicate keys / sort assumptions | `=VLOOKUP("b",A1:B3,2,FALSE)` |
| Configuration | Behavior of the same formula with `ExcelCompatibleCalcMode` on/off | `=AVERAGE(2,"4")` |
| Composite | Nested functions, array formulas, business-like scenarios | `=IFERROR(VLOOKUP(...),0)` |

## 3. Priority

| Priority | Definition | Usage |
| --- | --- | --- |
| `P0` | High-frequency function + common input + clear-cut conclusion | Must run in regression; fix failures first |
| `P1` | Boundaries, type coercion, configuration sensitivity, error semantics | The main source of product issues |
| `P2` | Long-tail functions, extreme inputs, approximation algorithms | Coverage completeness; conclusions need human review |

Do not pass off "the number of functions" as "the depth of coverage". The report shows all of these together: function coverage count, dimension distribution, and P0 pass rate.

## 4. Field specification

```json
{
  "id": "PUB-MATH-003",
  "category": "Math & Trig",
  "function": "SUM",
  "scenario": "Whether numeric text mixed into a range takes part in the sum",
  "formula": "=SUM(A1:A4)",
  "data": [[1], ["2"], [3], [4]],
  "formulaCell": "H1",
  "readRange": "H1:H1",
  "priority": "P1",
  "source": "m2-design",
  "note": "Verify whether text coming from a reference is coerced"
}
```

Rules:

1. `id` is globally unique and is never reused once appended; when you change a case's meaning, create a new ID and keep the old one (so regressions stay traceable).
2. `data` may contain only number / string / boolean / null; it starts at A1, and formulas reference real coordinates.
3. Formulas start with `=`, and arguments are separated only by `,` (except inside array constants).
4. `formulaCell` defaults to `H1` and must not overlap the data area; for array results, declare the area with `readRange`.
5. Expected values are not hard-coded: the actual Excel result is the baseline. A case is only responsible for "supplying a valid set of inputs".
6. Cases that are expected to return an error are marked `expectError: true`; otherwise an Excel error result is judged `INVALID`.
7. Volatile functions are marked `volatile: true` and are excluded from numeric assertions.
8. For iterative/approximation functions you may relax `tolerance`, but you must state the reason in `note`.

## 5. Excel version policy

- The baseline is pinned to **the desktop Excel on the machine that ran `npm run refresh`**; the version, build, locale, and date system are written to `oracle/manifest.json` and shown at the top of the report.
- The cases themselves do not assume an Excel version. If a function exists only in Excel 365 (for example dynamic arrays, `IMAGE`, or the `EUROCONVERT` add-in), say so in `note`; the report then classifies `#NAME?`-style differences as environment issues rather than judging them defects outright.
- When the user's Excel version differs:
  - `check` only: the baseline committed to the repository applies, and the conclusion carries the baseline environment fingerprint;
  - `refresh`: generate your own baseline; the results belong to that user's environment and are never mixed with the repository baseline.
- Never mix multiple Excel versions in one report. If a multi-version matrix is needed in the future, split directories and reports by version.

## 6. Review checklist (mandatory for every new case)

- [ ] The scenario states in one sentence "what the input is and what is being verified"
- [ ] Only one semantic point is tested, so failures are attributable
- [ ] The input data can be written losslessly by both sides (text is not treated as numbers, empty strings are not swallowed)
- [ ] The formula parses in both Excel and SpreadJS and does not depend on external references, defined names, or cross-sheet links
- [ ] The result is deterministic (not volatile) and identical across two runs
- [ ] `expectError` / `volatile` / `readRange` / `tolerance` match reality
- [ ] The report confirms the case is not `INVALID` / `EXEC_FAIL`

## 7. Result snapshot

A browsable test result is committed under `site/` (including the `compatibility.csv` / `.json` exports), and the Excel baseline that produced it is committed under `oracle/`. That way users can reproduce the current conclusions without installing Excel; when switching machines or versions, use `refresh` to generate a new baseline and re-issue the report.
