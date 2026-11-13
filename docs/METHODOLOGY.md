[English](en/METHODOLOGY.md) | 简体中文

# 方法与判定口径

## 1. 流水线

```
cases/public/*.json
   ├─ SpreadJS runner（Node + 本地 Chrome/Edge）
   │    以真实的 <script src> 加载 @grapecity-software/spread-sheets
   │    逐条写输入 → 写公式 → 读 value / displayText / inputs / readRange
   │
   ├─ Excel runner（Windows + PowerShell + Excel COM，可选）
   │    每条用例一张 sheet（sheet 名 = 用例 ID）→ 写输入 → 写公式 → 读 Value2 / Text
   │    保存 oracle/excel-oracle-workbook.xlsx 作为可审计现场
   │
   └─ compare.mjs
        校验引擎自检、用例文件 SHA-256、用例数量、两侧输入快照
        → 逐条判定 PASS / FAIL / INVALID / EXEC_FAIL / INCONCLUSIVE
        → 对 FAIL 给出结构化分类（环境 / 产品 / 待定）
```

`npm run check` 使用仓库中已提交的 Excel 基线，因此只需要 Node + 浏览器；`npm run
refresh` 才会调用本机 Excel 重新生成基线。

## 2. 判定规则

| 维度 | 规则 |
| --- | --- |
| 数值 | 绝对容差或相对容差 `1e-9`，满足其一即一致；用例可用 `tolerance` 显式放宽 |
| 文本 / 布尔 / 错误码 | 精确比较（大小写敏感） |
| 日期 | 统一换算为 Excel 1900 日期系统序列值，含 1900 闰年补偿 |
| 多单元格结果 | 按 `readRange` 逐格比较，行列数也必须一致 |
| 易变函数 | 标记 `volatile`，当前判为 `INCONCLUSIVE`，不当作通过 |
| 动态数组 | 默认按 CSE 数组公式读取声明区域；`arrayMode: native` 时比较实际溢出区域 |
| 输入保真 | 两侧都保存写入后的输入快照；与用例声明不一致时判 `EXEC_FAIL` |

## 3. 可复现性约束

- 每次运行记录引擎版本、用例文件 SHA-256、自检结果（`=1+1` 必须为 2）、时间戳。
- 比对前校验两侧结果数量与用例数一致、两侧输入快照一致；不满足直接终止。
- Excel 基线固定提交在 `oracle/`，包含 `manifest.json`（Excel 版本 / build / 区域 /
  日期系统）与可打开核对的 `excel-oracle-workbook.xlsx`。
- 运行产物（`out/`）不提交；提交的是 `oracle/` 和 `site/` 中的结果快照。

## 4. 差异分类（自动初判）

| 分类 | 常见原因 | 默认归因 |
| --- | --- | --- |
| `EXCEL_FUNCTION_UNAVAILABLE` | Excel 未安装加载项、Excel 版本没有该函数 | 环境 |
| `EXCEL_ERROR_ONLY` | Excel 报错而 SpreadJS 正常（也可能是函数支持差异） | 环境（需复核） |
| `LOCALE_DIFF` | 货币符号、区域格式、DBCS 设置 | 环境 |
| `SPREADJS_ERROR` | SpreadJS 返回错误而 Excel 正常 | 产品 |
| `ERROR_CODE_DIFF` | 两侧都报错但错误码不同 | 产品 |
| `TYPE_DIFF` | 结果类型不同（number/date/text/bool/error） | 产品 |
| `VALUE_DIFF` | 数值不同且相对误差 > 1e-6 | 产品 |
| `PRECISION_DIFF` | 数值差在 1e-9 ~ 1e-6 相对量级 | 产品（可能可接受） |
| `TEXT_DIFF` / `BOOLEAN_DIFF` | 文本 / 布尔结果不同 | 产品 |
| `ARRAY_VALUE_DIFF` | 区域结果有单元格不同 | 产品 |
| `ARRAY_SHAPE_DIFF` | 动态数组实际溢出区域不同 | 产品 |

分类只是提示，不能替代人工归因。归因时依次排除：用例写错 → 环境/加载项 → 配置
（`ExcelCompatibleCalcMode`、culture）→ 最后才是产品缺陷。

## 5. 已知限制

1. **Excel 版本**：基线只代表执行 `npm run refresh` 的那台机器的 Excel。不同版本/语言/加载项
   会得到不同结果，报告必须带上环境指纹。
2. **数组**：默认 CSE 模式不能证明原生溢出行为；`arrayMode: native` 也尚未覆盖阻塞溢出、
   空结果、重算后区域变化等场景。
3. **易变函数**：TODAY / NOW / RAND 等目前只做类型判定，不做数值断言。
4. **区域设置**：SpreadJS 默认 `zh-CN` 以对齐本基线；Excel 侧记录 PowerShell 当前区域，
   不保证覆盖 Excel 的所有区域/格式选项。
5. **空串与错误输入**：Excel 侧空串用公式 `=""` 模拟，错误输入用公式生成，不等同于手工输入常量。
6. **单表范围**：用例只使用单个工作表的 A1:AZ200，不含跨表引用、定义名称、表格结构化引用。
7. **性能**：只作为参考记录，不作为结论。

## 6. 配置维度

同一批用例固定跑两种 SpreadJS 配置，报告分栏展示、绝不合并统计：

- `default`：SpreadJS 默认计算行为。
- `compatible`：`GC.Spread.CalcEngine.ExcelCompatibleCalcMode = true`。

同一用例在两种模式下 PASS/FAIL 不一致时，说明结论对配置敏感，应在报告中单独标注，不能
简单算作产品缺陷。
