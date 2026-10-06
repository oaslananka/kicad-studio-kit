## Summary

Fixed the security remediation for PR #718 (round 3) by addressing the root cause: **pnpm overrides were incorrectly nested under `pnpm:` in `pnpm-workspace.yaml`**, causing them to be read but not applied during resolution in pnpm 11.6.0.

### Changes Made

#### 1. `pnpm-workspace.yaml`
- Moved `overrides` from `pnpm.overrides` to root level (`overrides:`) — this is required for pnpm 11.6.0 to actually apply overrides during resolution
- Updated `uuid` override from `14.0.1` (ESM-only) to `11.1.1` (CommonJS-compatible, fixes CVE-2026-41907)
- Added scoped override `exceljs>uuid: 11.1.1` for the specific vulnerable dependency path
- Kept `@vscode/vsce>keytar: '-'` at root level to properly remove keytar
- Removed `keytar: true` from root-level `allowBuilds` (was conflicting with ignoredOptionalDependencies)

#### 2. `scripts/check-pnpm-supply-chain.mjs`
- Updated validator to read overrides from root level (`workspace.overrides`) instead of `workspace.pnpm.overrides`
- Extended `REQUIRED_SECURITY_OVERRIDES` to include:
  - `uuid: "11.1.1"`
  - `exceljs>uuid: "11.1.1"`
  - `@vscode/vsce>keytar: "-"`

#### 3. `scripts/check-pnpm-supply-chain.test.mjs`
- Updated test fixtures to mutate root-level `overrides` and `pnpm.*` settings correctly
- Updated error messages from `"pnpm-workspace.yaml pnpm.overrides must pin"` to `"pnpm-workspace.yaml overrides must pin"`
- Fixed test cases that were mutating `workspace.pnpm` settings incorrectly

#### 4. `pnpm-lock.yaml` (regenerated with pnpm 11.6.0)
- `tar@7.5.15` → `tar@7.5.22` (fixes multiple tar CVEs)
- `uuid@8.3.2` + `uuid@14.0.2` → `uuid@11.1.1` (fixes CVE-2026-41907)
- `keytar@7.9.0` → **removed entirely** (was vulnerable optional dependency)

### Verification

All required checks pass:
- ✅ `corepack pnpm install --frozen-lockfile`
- ✅ `corepack pnpm run check:supply-chain` (validator + 14 tests)
- ✅ `corepack pnpm audit --audit-level high` — **No known vulnerabilities found**
- ✅ Lockfile correctly applies all security overrides

The validator now correctly rejects the old (incorrectly nested) layout and enforces root-level overrides.