# Release checklist

English | [简体中文](RELEASE-CHECKLIST.zh-CN.md)

Use this list before pushing the repository or publishing a new result snapshot.

## 1. Content audit

- [ ] `npm run release-check` passes (no absolute paths, secrets or oversized files).
- [ ] `git status` is clean; `out/` is not tracked; `git log` contains no internal material.
- [ ] No customer names, internal ticket ids, internal URLs or unreleased version names.
- [ ] `cases/public/` contains only formulas and inputs that may be published.
- [ ] `oracle/` and `site/` were regenerated from the committed corpus (`npm run refresh`).
- [ ] `oracle/manifest.json` records the Excel version/build/culture used for the baseline.
- [ ] `docs/known-differences.json` and `docs/KNOWN-DIFFERENCES.md` agree with the latest run.
- [ ] Every `FAIL` in the report has a classification; environment-only differences are not
      presented as product defects.

## 2. Licensing and trademarks

- [ ] `LICENSE` (MIT) covers the repository code and case data.
- [ ] `NOTICE` states that SpreadJS is commercial software and is not redistributed.
- [ ] No SpreadJS bundle, license key or `.lic` file is committed.
- [ ] The README makes clear that results are not an official compatibility statement.
- [ ] SpreadJS version in `package.json` is an exact pin; `package-lock.json` is committed.

## 3. Reproducibility

- [ ] Clean clone: `npm ci && npm run check` works without Excel (Node 22+ and Chrome/Edge).
- [ ] `npm test` and `npm run validate` pass.
- [ ] `npm run build:cases` is deterministic (CI checks `git diff` on `corpus.json`).
- [ ] `npm run refresh` was run on a machine with desktop Excel and the resulting files committed.
- [ ] The report's environment header matches `oracle/manifest.json`.

## 4. Publication

- [ ] Confirm the public repository URL and owner; add the remote and push.
- [ ] Enable GitHub Pages from `main` / `(root)`; the root `index.html` redirects to the static report at `site/index.html`
      (the branch-folder UI only offers `/ (root)` and `/docs`).
- [ ] Confirm the CI workflow passes on the default branch.
- [ ] Tag the release (for example `v0.2.0`) and keep the result snapshot at that tag.
- [ ] Announce the scope honestly: tested versions, case count, known limitations.

## 5. After publication

- [ ] On each SpreadJS release: `npm run refresh`, review new/fixed differences, update
      `docs/KNOWN-DIFFERENCES.md`, commit the new snapshot.
- [ ] When adding cases: edit fragments, `npm run build:cases`, refresh the oracle, review
      `INVALID` / `EXEC_FAIL` rows, then commit.
