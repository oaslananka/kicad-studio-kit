Fixed the marketplace asset validation failure in PR #718 (round 4).

**Root Cause:** The `capture-manifest.json` source fingerprint was stale. Commit `5144092` updated `apps/vscode-extension/package.json` (dev dependency version bumps for `@vscode/vsce` and `ovsx`), which is one of the tracked source files for marketplace screenshots. This changed the source contract fingerprint from `99f9946ebc9d...` to `5bfe630c0e5d...`, causing the marketplace check to fail with "marketplace screenshots are stale: capture source fingerprint changed".

**Fix:** Updated `apps/vscode-extension/assets/screenshots/capture-manifest.json` with the current source fingerprint. The visual screenshots themselves are unchanged — only the dev dependency versions in package.json were modified, which don't affect the extension's UI appearance.

**Verification:** All checks pass:
- ✅ `corepack pnpm run check:supply-chain` (supply-chain validator + 14 tests)
- ✅ `corepack pnpm audit --audit-level high` — No known vulnerabilities found
- ✅ `corepack pnpm --filter kicadstudiokit run marketplace:check` — Marketplace check passed
- ✅ `corepack pnpm --filter kicadstudiokit run test:security` — 12 security tests pass