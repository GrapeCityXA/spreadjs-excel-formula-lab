English | [简体中文](../KNOWN-DIFFERENCES.md)

# Known Differences

> Source: 760 pilot cases from 2026-10 (SpreadJS 19.2.1 / Excel 365 16.0.20527).
> In 2026-11 the 892-case public corpus was re-run in this repository with SpreadJS 19.2.2; the
> 17 differences reproduce in the default mode. In the compatible mode
> (`ExcelCompatibleCalcMode = true`), ISNUMBER and SUM agree with Excel.
> Values follow `site/` and `out/<mode>/comparison.json`.

## 1. Difference List

| # | Case | Function | Formula | Excel | SpreadJS 19.2.2 | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | TC-ADDIN-001 | EUROCONVERT | `=EUROCONVERT(1,"EUR","DEM")` | `#NAME?` | `1.96` | Excel without the Euro currency tools add-in; SpreadJS implements the function |
| 2 | TC-COMPAT-229 | TINV | `=TINV(0.05,10)` | 2.22813885198627 | 2.22813884482571 | Inverse t-distribution approximation (relative difference ~3.2e-9) |
| 3 | TC-DATE-032 | DAYS | `=DAYS(DATE(1900,3,1),DATE(1900,2,28))` | 2 | 1 | Historical Excel 1900 leap-year behavior |
| 4 | TC-ENG-203 | BESSELK | `=BESSELK(1,0)` | 0.421024421083418 | 0.421024438240708 | Special-function approximation (relative difference ~4.1e-8) |
| 5 | TC-ENG-204 | BESSELY | `=BESSELY(1,0)` | 0.0882569713977081 | 0.088256964215677 | Special-function approximation (relative difference ~8.1e-8) |
| 6 | TC-ENG-216 | IMCOT | `=IMCOT("1")` | 0.642092615934331 | 0.6420926159343308 | Different text precision in a complex-number result |
| 7 | TC-ENG-217 | IMCSC | `=IMCSC("1")` | 1.18839510577812 | 1.1883951057781212 | Different text precision in a complex-number result |
| 8 | TC-ENG-218 | IMCSCH | `=IMCSCH("1")` | 0.850918128239322 | 0.8509181282393216 | Different text precision in a complex-number result |
| 9 | TC-FIN-239 | ACCRINT | Accrued interest for quarterly coupons with basis 3 | 16.7123287671233 | 16.5760869565217 | Different accrued-interest result for basis 3 |
| 10 | TC-INFO-010 | ISNUMBER | `=ISNUMBER("123")` | FALSE | TRUE | Agrees with Excel in compatible mode |
| 11 | TC-LOOKUP-211 | IMAGE | `=IMAGE("")` | `#VALUE!` | Empty value | Excel 365 IMAGE function is not comparable |
| 12 | TC-MATH-003 | SUM | `=SUM(A1:A4)` (range contains text numbers) | 5 | 10 | Agrees with Excel in compatible mode |
| 13 | TC-MATH-074 | BASE | `=BASE(255,16)` | `"FF"` | `"ff"` | Different letter case in the output |
| 14 | TC-STAT-079 | LINEST | Singular-matrix scenario | First cell agrees, R4C1 = 1.1589e+32 | R4C1 = `#NUM!` | Different R4C1 result in the singular-matrix scenario |
| 15 | TC-TEXT-204 | DOLLAR | `=DOLLAR(1234.567,2)` | `"¥1,234.57"` | `"$1,234.57"` | Different currency symbol / regional format |
| 16 | TC-TEXT-205 | DOLLAR | `=DOLLAR(-1234.5,2)` | `"¥-1,234.50"` | `"($1,234.5)"` | Different negative format, currency symbol and decimal padding |
| 17 | TC-TEXT-211 | MIDB | `=MIDB("中文文本",3,2)` | `"文"` | `#VALUE!` | Different DBCS byte-boundary result |

## 2. Observations Across Configurations

The public corpus includes direct-argument/type-coercion cases to observe `ExcelCompatibleCalcMode`:

| Case | Formula | Default mode | Compatible mode | Notes |
| --- | --- | --- | --- | --- |
| CFG-COUNT-001 | `=COUNT("2",TRUE)` | Differs (0 vs 2) | Differs (0 vs 2) | Differs in both modes |
| CFG-AVG-001 | `=AVERAGE(2,"4")` | Differs (`#VALUE!` vs 3) | Agrees | Agrees in compatible mode |
| CFG-ISNUM-001 | `=ISNUMBER("2")` | Differs (TRUE vs FALSE) | Agrees | Agrees in compatible mode |
| CFG-SUM-001 | `=SUM(1,"2")` | Agrees | Agrees | Control case |

## 3. Additional M2 Observations (2026-11-13, SpreadJS 19.2.2)

| Case | Formula | Excel | SpreadJS default | SpreadJS compatible | Notes |
| --- | --- | --- | --- | --- | --- |
| M2-STAT-002 | `=COUNT(TRUE)` | 1 | 0 | 0 | Boolean direct argument |
| M2-STAT-003 | `=COUNT("2")` | 1 | 0 | 0 | Text-number direct argument |
| M2-STAT-004 | `=MAX("2",TRUE)` | 2 | `#VALUE!` | 2 | Agrees in compatible mode |
| M2-STAT-005 | `=MIN("2",TRUE)` | 1 | `#VALUE!` | 1 | Agrees in compatible mode |
| M2-DATE-003 | `=DATE(1900,2,29)` | 60 (1900-02-29) | 61 (1900-03-01) | 61 | Historical Excel 1900 leap-year behavior |
| M2-DATE-005 | `=DAY(60)` | 29 | 28 | 28 | Same as above |
| M2-MATH-008 | `=POWER(0,0)` | `#NUM!` | `#NUM!` | `#NUM!` | Agrees |

The 26 default-mode differences break down as: the 17 pilot differences + CFG-COUNT/CFG-AVG/CFG-ISNUM +
M2-STAT-002/003/004/005 + M2-DATE-003/005. The 20 in compatible mode: of the 17, ISNUMBER and
SUM (range text coercion, TC-MATH-003) agree with Excel, plus the other difference items.

## 4. How to Use This File

- These entries are a regression baseline: re-run them on a new version and update this file if a result changes.
- Each difference should be reviewed against its case, version and environment; a single run is not enough to infer a cause.
- For the precision entries (items 2, 4 and 5), first confirm whether the comparison tolerance is appropriate.
