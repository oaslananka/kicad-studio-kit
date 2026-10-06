## Remediation Complete

Fixed the pnpm-workspace.yaml structure to nest configuration under a top-level `pnpm` key as required by pnpm and flagged by Codacy.

### Changes Made

1. **pnpm-workspace.yaml** - Restructured:
   - `packages` remains at top level
   - All pnpm settings (`minimumReleaseAge`, `trustPolicy`, `allowBuilds`, `overrides`, etc.) moved under `pnpm:` key
   - Removed unallowed `source-map-js@1.2.2` from `minimumReleaseAgeExclude`

2. **scripts/check-pnpm-supply-chain.mjs** - Updated validation to read from `workspace.pnpm`

3. **scripts/check-pnpm-supply-chain.test.mjs** - Updated tests for new structure and error messages

4. **pnpm-lock.yaml** - Regenerated

### Verification

- ✅ All 14 supply-chain tests pass
- ✅ `pnpm supply-chain check` passes
- ✅ Repository governance, branch protection, actions permissions checks pass
- ✅ pnpm correctly reads config from `pnpm` key (verified via `corepack pnpm config get pnpm.*`)

The Codacy HIGH RISK finding should now be resolved.