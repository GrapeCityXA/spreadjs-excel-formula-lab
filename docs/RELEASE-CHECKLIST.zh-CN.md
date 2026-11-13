# 发布检查清单

[English](RELEASE-CHECKLIST.md) | 简体中文

推送仓库或发布新的结果快照前，请逐项确认。

## 1. 内容审查

- [ ] `npm run release-check` 通过（无绝对路径、密钥、超大文件）。
- [ ] `git status` 干净；`out/` 未被跟踪；`git log` 中没有内部材料。
- [ ] 无客户名称、内部工单号、内网链接或未发布版本名。
- [ ] `cases/public/` 中只有可公开的公式与输入。
- [ ] `oracle/` 与 `site/` 由已提交语料重新生成（`npm run refresh`）。
- [ ] `oracle/manifest.json` 记录了基线使用的 Excel 版本/build/区域。
- [ ] `docs/known-differences.json` 与 `docs/KNOWN-DIFFERENCES.md` 和最新运行一致。
- [ ] 报告中的每个 `FAIL` 都有分类和说明，结论与实测值一致。

## 2. 许可与商标

- [ ] `LICENSE`（MIT）覆盖仓库代码与用例数据。
- [ ] `NOTICE` 声明 SpreadJS 为商业软件、未被重新分发。
- [ ] 未提交 SpreadJS 运行包、license key 或 `.lic` 文件。
- [ ] README 明确说明结果不是官方兼容性声明。
- [ ] `package.json` 固定了精确的 SpreadJS 版本；`package-lock.json` 已提交。

## 3. 可复现性

- [ ] 干净 clone：`npm ci && npm run check` 在没有 Excel 的机器上可运行（Node 22+ 与 Chrome/Edge）。
- [ ] `npm test` 与 `npm run validate` 通过。
- [ ] `npm run build:cases` 是确定性的（CI 会检查 `corpus.json` 的 diff）。
- [ ] 在装有桌面版 Excel 的机器上执行过 `npm run refresh`，并提交了结果文件。
- [ ] 报告顶部的环境信息与 `oracle/manifest.json` 一致。

## 4. 发布

- [ ] 确认公开仓库地址与所有者；添加 remote 并推送。
- [ ] 从 `main` / `(root)` 启用 GitHub Pages；根目录的 `index.html` 会跳转到静态报告 `site/index.html`
      （分支目录选项只有 `/ (root)` 和 `/docs`）。
- [ ] 确认 CI 在默认分支通过。
- [ ] 打 tag（例如 `v0.2.0`），在该 tag 上保留结果快照。
- [ ] 如实说明范围：被测版本、用例数量、已知限制。

## 5. 发布之后

- [ ] 每个 SpreadJS 版本发布后：`npm run refresh`，复核新增/修复的差异，更新
      `docs/KNOWN-DIFFERENCES.md`，提交新快照。
- [ ] 新增用例时：改片段 → `npm run build:cases` → 重建基线 → 复核 `INVALID` / `EXEC_FAIL`
      → 提交。
