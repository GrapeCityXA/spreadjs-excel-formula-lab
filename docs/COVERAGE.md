[English](en/COVERAGE.md) | 简体中文

# 覆盖率审计

审计日期：2026-11-13。目标：确认公开语料确实覆盖了 **SpreadJS 与 Excel 共同支持**的当前函数集合，而不是沿用旧目录的数字。

## 1. 口径

| 项 | 数值 | 说明 |
| --- | --- | --- |
| SpreadJS 运行时注册函数 | 583 | 19.2.2 中 `GC.Spread.CalcEngine.Functions.findGlobalFunctions()` 的结果，含 SpreadJS 专有函数与别名 |
| Excel 函数清单 | 521 | 基于 v19.2 功能清单的 Excel 函数名（不含 SpreadJS 专有函数） |
| 双方共同支持 | 498 | 上述两个集合的交集 |
| 公共语料 | 892 条用例 / 498 个函数 | 每个共同函数至少 1 条用例 |
| 分层 | 887 条常见场景 + 5 条低频/边缘用例 | 默认报告只统计常见场景；边缘用例可在“全部”视图查看 |

说明：583 个运行时名称中包含 SpreadJS 专有函数/别名；Excel 专有函数（如 CUBE 系列、WEBSERVICE 等）不在比对范围内。因此“共同支持”= 498，而不是 583 或 521。

## 2. 审计结果

| 指标 | 结果 |
| --- | --- |
| 交集函数数 | 498 |
| 语料覆盖函数数 | 498 |
| 缺口 | **0** |
| 语料中超出交集的函数 | 0 |

## 3. 本次修正

旧语料基于 2026-10 的 496 个函数清单；19.2.2 运行时与 Excel 清单的交集实际为 **498**，多出：

- `ARRAYTOTEXT`
- `VALUETOTEXT`

已补充 4 条用例（2 个函数 × 2 个场景），重新生成 Excel 基线并重跑比对。当前结果：892 条用例、498 个函数、覆盖 498/498。

## 4. 复跑方式

审计使用仓库内的语料和一次 SpreadJS 运行结果：

```powershell
npm run check
# out/default/spreadjs-results.json -> meta.registeredFunctions
# 与 Excel 函数清单求交集，再与 cases/public/corpus.json 的 functions 比较
```

Excel 函数清单来自维护者侧的 v19.2 目录；如果该目录更新，需要重新审计并补充用例。
