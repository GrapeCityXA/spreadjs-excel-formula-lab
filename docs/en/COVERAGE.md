English | [简体中文](../COVERAGE.md)

# Coverage Audit

Audit date: 2026-11-13. Goal: verify that the public corpus really covers the current set of
functions **supported by both SpreadJS and Excel**, instead of carrying over an old count.

## 1. Scope

| Item | Value | Notes |
| --- | --- | --- |
| SpreadJS runtime functions | 583 | `GC.Spread.CalcEngine.Functions.findGlobalFunctions()` in 19.2.2, including SpreadJS-proprietary functions and aliases |
| Excel function catalog | 521 | Excel function names from the v19.2 feature catalog (excluding SpreadJS-proprietary functions) |
| Supported by both | 498 | Intersection of the two sets |
| Public corpus | 892 cases / 498 functions | At least one case per shared function |
| Tiers | 887 common + 5 low-frequency/edge cases | The default report counts common scenarios only; edge cases are visible under “All” |

The 583 runtime names include SpreadJS-proprietary functions and aliases; Excel-only functions
(CUBE, WEBSERVICE, etc.) are out of scope. Hence "supported by both" is 498, not 583 or 521.

## 2. Result

| Metric | Result |
| --- | --- |
| Intersection size | 498 |
| Functions covered by the corpus | 498 |
| Missing | **0** |
| Corpus functions outside the intersection | 0 |

## 3. What changed

The previous corpus was based on a 2026-10 list of 496 functions. The current intersection of the
19.2.2 runtime and the Excel catalog is **498**; the two missing functions were:

- `ARRAYTOTEXT`
- `VALUETOTEXT`

Four cases were added (two functions × two scenarios), the Excel baseline was regenerated, and the
comparison was re-run. The current snapshot is 892 cases / 498 functions, covering 498/498.

## 4. Reproducing the audit

The audit uses the corpus and one SpreadJS run:

```powershell
npm run check
# out/default/spreadjs-results.json -> meta.registeredFunctions
# intersect with the Excel function catalog, then compare with cases/public/corpus.json
```

The Excel function catalog comes from the maintainer-side v19.2 list. If that list changes, re-run
the audit and add cases for any new shared functions.
