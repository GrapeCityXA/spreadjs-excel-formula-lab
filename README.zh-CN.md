[![ci](https://github.com/GrapeCityXA/spreadjs-excel-formula-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/GrapeCityXA/spreadjs-excel-formula-lab/actions/workflows/ci.yml)

# SpreadJS × Excel 公式兼容性实验台

[English](README.md) | 简体中文

一个可复现的对比工程：把同一批公式分别交给 **SpreadJS** 和 **Microsoft Excel** 计算，
逐格比较结果，并发布一份静态的中英双语报告。仓库设计为可以 clone 后直接交给 AI 代理执行：
不需要服务器、没有交互式提问，默认的 check 流程也不需要安装 Excel。

> 状态：**M3 发布候选** — 已可公开：888 条用例、496 个函数、13 个分类、用例中英双语、
> 两种 SpreadJS 配置、已提交 Excel 基线。

## 结果快照（SpreadJS 19.2.2，Excel 16.0 build 20527，zh-CN）

| 配置 | 通过 | 差异 | 待判定 |
| --- | --- | --- | --- |
| 默认模式 | 856 / 888（96.4%） | 26 | 6 |
| `ExcelCompatibleCalcMode = true` | 862 / 888（97.1%） | 20 | 6 |

语料**故意包含** 2026-10 试点中的 17 条已知差异种子，因此这个通过率**不是**兼容性评分。
具体差异请看报告中的逐条分类。

## 快速开始（不需要 Excel）

```powershell
npm install
npm run check
# 打开 site/index.html
```

`npm run check` 用 npm 安装的 SpreadJS 计算，对照 `oracle/` 中已提交的 Excel 基线，并重新
生成 `site/`。环境要求：Node.js 22+，本机有 Chrome/Edge。

## 重建 Excel 基线（Windows + 桌面版 Excel）

```powershell
npm run refresh
```

通过 COM 启动 Excel 计算全部用例，保存可核对的 `oracle/excel-oracle-workbook.xlsx`，
把 Excel 版本/build/区域写入 `oracle/manifest.json`，然后重跑 SpreadJS 并重新生成报告。

## 交给 AI 代理使用

把 [`AGENTS.md`](AGENTS.md) 指给你的代理即可。常用命令：

```powershell
node src/cli.mjs list --status FAIL --json        # 导出全部差异用例
node src/cli.mjs case TC-MATH-003 --json          # 单条用例的两种配置结果
node src/cli.mjs experiment '=COUNT("2",TRUE)' --json           # 临时公式，只跑 SpreadJS
node src/cli.mjs experiment '=COUNT("2",TRUE)' --excel --json   # 同时跑本机 Excel
```

CLI 无交互、输出 JSON；完整机器可读结果在 `out/<mode>/comparison.json`。由于 `oracle/`
已提交，代理没有 Excel 也能评估 SpreadJS。

## 对比范围

- **SpreadJS**：`@grapecity-software/spread-sheets`（中国区发行包），版本固定在 `package.json`。
- **Excel**：执行 `npm run refresh` 那台机器的桌面版 Excel；环境记录在
  `oracle/manifest.json`，并显示在报告顶部。
- **两种配置**始终分开报告：`default` 与 `ExcelCompatibleCalcMode = true`，不合并通过率。

## 报告

`site/index.html`（中英切换）包含三个视图：

- **用例明细**：按状态/分类/维度筛选，展开看输入、Excel 结果、SpreadJS 结果和自动差异分类。
- **函数矩阵**：每个函数的用例数、通过数、差异数，快速发现反复出问题的函数。
- **已知差异**：试点种子清单，区分环境类与产品类归因。

`site/compatibility.csv` / `.json` 是机器可读导出。

## 用例设计与 Excel 版本

这两点是项目的重点：

- **用例设计**：每条用例只验证一个语义点；12 个维度（基线、边界、类型转换、引用、数组、
  错误、日期、文本、精度、查找、配置、组合）；显式优先级与评审清单。见
  [`docs/CASE-DESIGN.md`](docs/CASE-DESIGN.md)（中文）或 [`docs/en/CASE-DESIGN.md`](docs/en/CASE-DESIGN.md)（English）。
- **Excel 版本**：提交的基线只代表一个 Excel 环境。用户 Excel 版本不同时，可以直接用
  已提交基线（`check`），也可以在自己的机器上重建基线（`refresh`，仅 Windows）。结论
  始终与环境绑定，不承诺覆盖所有 Excel 版本或全部函数。见
  [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md)（中文）或 [`docs/en/METHODOLOGY.md`](docs/en/METHODOLOGY.md)（English）。

当前语料：888 条 / 496 个函数 / 13 个分类；维度分布：基线 502、引用 181、数组 57、
精度 40、边界 28、错误 27、类型转换 14、日期 14、查找 10、文本 6、易变 6、配置 2、
组合 1。优先级：P0 224、P1 486、P2 178。

文档中英双语：英文在 `docs/en/`，中文在 `docs/*.md`；维护者发布步骤见 [`docs/RELEASE-CHECKLIST.md`](docs/RELEASE-CHECKLIST.md)。

## 仓库结构

```
cases/public/fragments/   中英双语用例片段，按分类拆分（唯一事实来源）
cases/public/corpus.json  合并生成并提交的语料
oracle/                   已提交的 Excel 基线：manifest + 结果 + 核对工作簿
src/                      CLI、双引擎 runner、比对器、报告生成
site/                     生成的中英双语报告（提交快照）
docs/                     方法学、用例设计、已知差异
tests/                    比对器与 schema 单测
```

维护流程：改片段 → `npm run build:cases` → `npm run refresh`（需要 Excel）→ 提交更新后的
`oracle/`、`site/`、`corpus.json`。

## 许可与声明

代码与用例数据采用 MIT 许可（见 [`LICENSE`](LICENSE)）。SpreadJS 是商业软件，本仓库
**不重新分发**其运行文件，请按自己的许可安装。Excel 仅用于重建基线。商标归属见
[`NOTICE`](NOTICE)。结果仅代表被测版本与环境，不构成官方兼容性声明。

发布前运行 `npm run release-check`，扫描本地路径、密钥和超大文件。
