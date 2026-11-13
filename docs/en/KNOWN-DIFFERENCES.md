English | [简体中文](../KNOWN-DIFFERENCES.md)

# Known Differences (Pilot Seeds)

> Source: 760 pilot cases from 2026-10 (SpreadJS 19.2.1 / Excel 365 16.0.20527).
> In 2026-11 the 888-case public corpus was re-run in this repository with SpreadJS 19.2.2: **all 17 seeds reproduce in the default mode**;
> in the compatible mode (`ExcelCompatibleCalcMode = true`), `ISNUMBER("123")` now agrees.
> Re-verified values follow `site/` and `out/<mode>/comparison.json`.

## 1. The 17 Difference Seeds

| # | Case | Function | Formula | Excel | SpreadJS 19.2.2 | Initial assessment |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | TC-ADDIN-001 | EUROCONVERT | `=EUROCONVERT(1,"EUR","DEM")` | `#NAME?` | `1.96` | Environment: European currency add-in not installed in Excel |
| 2 | TC-COMPAT-229 | TINV | `=TINV(0.05,10)` | 2.22813885198627 | 2.22813884482571 | Product: inverse-distribution approximation precision (relative 3.2e-9) |
| 3 | TC-DATE-032 | DAYS | `=DAYS(DATE(1900,3,1),DATE(1900,2,28))` | 2 | 1 | Excel legacy: 1900 leap-year bug (not a defect) |
| 4 | TC-ENG-203 | BESSELK | `=BESSELK(1,0)` | 0.421024421083418 | 0.421024438240708 | Product: special-function approximation algorithm (relative 4.1e-8) |
| 5 | TC-ENG-204 | BESSELY | `=BESSELY(1,0)` | 0.0882569713977081 | 0.088256964215677 | Product: special-function approximation algorithm (relative 8.1e-8) |
| 6 | TC-ENG-216 | IMCOT | `=IMCOT("1")` | 0.642092615934331 | 0.6420926159343308 | Product: text precision of complex-number results |
| 7 | TC-ENG-217 | IMCSC | `=IMCSC("1")` | 1.18839510577812 | 1.1883951057781212 | Product: text precision of complex-number results |
| 8 | TC-ENG-218 | IMCSCH | `=IMCSCH("1")` | 0.850918128239322 | 0.8509181282393216 | Product: text precision of complex-number results |
| 9 | TC-FIN-239 | ACCRINT | Accrued interest for quarterly coupons with basis 3 | 16.7123287671233 | 16.5760869565217 | Product: day-count handling within the coupon period |
| 10 | TC-INFO-010 | ISNUMBER | `=ISNUMBER("123")` | FALSE | TRUE | Configuration: default coercion; **agrees in compatible mode** |
| 11 | TC-LOOKUP-211 | IMAGE | `=IMAGE("")` | `#VALUE!` | Empty value | Environment/product: Excel 365 IMAGE function is not comparable |
| 12 | TC-MATH-003 | SUM | `=SUM(A1:A4)` (range contains text numbers) | 5 | 10 | Configuration: default range coercion; **agrees in compatible mode** |
| 13 | TC-MATH-074 | BASE | `=BASE(255,16)` | `"FF"` | `"ff"` | Product: letter case of the character output |
| 14 | TC-STAT-079 | LINEST | Singular-matrix scenario | First cell agrees, R4C1 = 1.1589e+32 | R4C1 = `#NUM!` | Product: numeric behaviour on a singular matrix |
| 15 | TC-TEXT-204 | DOLLAR | `=DOLLAR(1234.567,2)` | `"¥1,234.57"` | `"$1,234.57"` | Environment: currency/locale settings |
| 16 | TC-TEXT-205 | DOLLAR | `=DOLLAR(-1234.5,2)` | `"¥-1,234.50"` | `"($1,234.5)"` | Environment: currency, locale and negative-value format |
| 17 | TC-TEXT-211 | MIDB | `=MIDB("中文文本",3,2)` | `"文"` | `#VALUE!` | Product: DBCS byte-boundary handling |

## 2. Configuration-Sensitive Additions

The public corpus adds direct-argument/type-coercion cases so that `ExcelCompatibleCalcMode` can be observed:

| Case | Formula | Default mode | Compatible mode | Notes |
| --- | --- | --- | --- | --- |
| CFG-COUNT-001 | `=COUNT("2",TRUE)` | Differs (0 vs 2) | Differs (0 vs 2) | Not eliminated by configuration; candidate product issue |
| CFG-AVG-001 | `=AVERAGE(2,"4")` | Differs (`#VALUE!` vs 3) | Agrees | Configuration-related |
| CFG-ISNUM-001 | `=ISNUMBER("2")` | Differs (TRUE vs FALSE) | Agrees | Configuration-related |
| CFG-SUM-001 | `=SUM(1,"2")` | Agrees | Agrees | Control case |

## 3. New M2 Observations (2026-11-13, SpreadJS 19.2.2)

| Case | Formula | Excel | SpreadJS default | SpreadJS compatible | Classification |
| --- | --- | --- | --- | --- | --- |
| M2-STAT-002 | `=COUNT(TRUE)` | 1 | 0 | 0 | Product candidate: boolean direct argument |
| M2-STAT-003 | `=COUNT("2")` | 1 | 0 | 0 | Product candidate: text-number direct argument |
| M2-STAT-004 | `=MAX("2",TRUE)` | 2 | `#VALUE!` | 2 | Configuration-related |
| M2-STAT-005 | `=MIN("2",TRUE)` | 1 | `#VALUE!` | 1 | Configuration-related |
| M2-DATE-003 | `=DATE(1900,2,29)` | 60 (1900-02-29) | 61 (1900-03-01) | 61 | Excel legacy: 1900 leap-year bug (not a defect) |
| M2-DATE-005 | `=DAY(60)` | 29 | 28 | 28 | Excel legacy: same as above |
| M2-MATH-008 | `=POWER(0,0)` | `#NUM!` | `#NUM!` | `#NUM!` | Agrees (convention recorded only, not a difference) |

The 26 default-mode differences break down as: the 17 pilot seeds + CFG-COUNT/CFG-AVG/CFG-ISNUM + the
M2-STAT-002/003/004/005 above + M2-DATE-003/005. The 20 in compatible mode: of the 17 seeds, ISNUMBER and
SUM (range text coercion, TC-MATH-003) turn into matches, plus the configuration-related items.

## 4. Attribution Update (2026-11-13 discussion)

The following attributions were adjusted after product/engineering discussion:

- **1900 date system** (TC-DATE-032, M2-DATE-003, M2-DATE-005): Excel itself treats 1900 as a leap year. That bug is
  baked into Excel's behaviour; SpreadJS does not emulate it. It is recorded as a known difference, not a defect.
- **Type-coercion family** (TC-MATH-003, TC-INFO-010, CFG-AVG/ISNUM, M2-STAT-004/005): the default mode
  auto-converts text to numbers (documented by the API), while compatible mode agrees with Excel. Treat this as a
  configuration/design difference, not a defect. The product should clarify the role of the default mode and recommend
  `ExcelCompatibleCalcMode` for Excel-compatible results.
- **COUNT direct arguments** (CFG-COUNT, M2-STAT-002/003): still differ in compatible mode, so this is the clearest
  product-defect candidate.
- **ACCRINT basis 2/3**: an additional probe shows that basis 2 and 3 produce exactly the basis-1 result, while Excel
  applies actual/360 and actual/365 respectively. This is a day-count dispatch issue for engineering to verify.
- **MIDB**: only the `MIDB("中文文本",3,2)` byte boundary fails; LENB/LEFTB/RIGHTB/FINDB/SEARCHB all agree. It is a
  narrow issue but still worth confirming.

As a result, fewer of the 17 seeds are tracked as product defects; the 1900 and coercion entries are marked as
"Excel legacy" or "configuration-related".

## 5. How to Use This File

- These 17 entries are **seeds**, not a complete defect list. They are a regression baseline: re-run them on a new
  version, and if one of them starts to agree, it has been fixed and this file should be updated.
- Entries marked "environment" should not be filed with engineering directly; first confirm the local Excel add-ins/locale settings.
- Entries marked "configuration-related" should be compared across default/compatible mode first, not filed as defects directly.
- Entries marked "Excel legacy" record a known behavioural difference and are not treated as defects.
- Entries marked "product" still need engineering to reproduce the issue and confirm the root cause; for the `PRECISION_DIFF`
  class (items 2, 4 and 5), first assess whether the 1e-9 default tolerance is reasonable, then decide whether to file them as defects.
