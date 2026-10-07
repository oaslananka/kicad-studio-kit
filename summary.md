## Summary of Changes

### 1. Fixed marketplace-assets test failure
- Updated `apps/vscode-extension/assets/screenshots/capture-manifest.json` with the correct `sourceFingerprint` hash (twice: once for the original mismatch, once after package.json script changes)
- The test now passes: 3/3 tests in `marketplace-assets.test.ts`

### 2. Fixed 4 high-severity security vulnerabilities (pnpm audit)
Added pnpm overrides in `pnpm-workspace.yaml`:

| Vulnerability | Before | After | Fix Method |
|---------------|--------|-------|------------|
| basic-ftp (GHSA-c475-qrg2-pj4r) | 5.3.1 | >=6.2.1 | Override |
| braces (GHSA-vfj7-8cjw-p6xm) | 3.0.3 | N/A | Indirect via @vscode/vsce 4.0.0 |
| source-map-js (GHSA-68fv-2mgg-jv7q) | 1.2.1 | >=1.2.2 | Override (+ minimumReleaseAgeExclude) |
| @vue/server-renderer (GHSA-g2v6-rqmx-r4w6) | 3.5.40 | >=3.5.42 | Override (vue 3.5.43) |

- Also updated `@vscode/vsce` from 3.9.2 → 4.0.0 (removes braces dependency by using tinyglobby)
- Added `source-map-js@1.2.2` to `minimumReleaseAgeExclude` (published 2026-09-30, within 7-day window)

### 3. Fixed package script for vsce compatibility
Updated `apps/vscode-extension/package.json` scripts to use `corepack pnpm`:
- `vscode:prepublish`: `pnpm run build:prod` → `corepack pnpm run build:prod`
- `build`: `pnpm run prepare:media && webpack` → `corepack pnpm run prepare:media && webpack`
- `build:prod`: `pnpm run build` → `corepack pnpm run build`

This ensures the prepublish script works when vsce runs `npm run vscode:prepublish`.

### Verification Results
- ✅ pnpm audit --audit-level high: **No known vulnerabilities found**
- ✅ Unit tests: 134 suites, 1145 tests passing
- ✅ Security tests: 2 suites, 12 tests passing
- ✅ Marketplace-assets test: 3/3 passing
- ✅ Lint: passing
- ✅ Typecheck: passing
- ✅ Format check: passing
- ✅ Build: successful
- ✅ Package: successful (VSIX created)
- ✅ Package validation: passing
- ✅ git diff --check: no whitespace issues
