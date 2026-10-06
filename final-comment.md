## Fix Complete: Mutation Survivors Killed in compat.ts

**Issue**: Mutation testing score 95.18% was below the 96.3% blocking threshold. `src/mcp/compat.ts` had 90% mutation score with undocumented surviving mutants #30 and #32.

**Root Cause**: Stryker only runs `mcpCompat.test.ts` for `compat.ts`, but critical `isMcpVersionSupported` negative test cases existed only in `compat.test.ts` (not run by Stryker for this file).

**Fix Applied** (`apps/vscode-extension/test/unit/mcpCompat.test.ts:32-38`):
Added test case `reports unsupported for versions below required range, above range, and missing` covering:
- `isMcpVersionSupported('3.5.1')` → `false` (below required range)
- `isMcpVersionSupported('3.0.0')` → `false` (below required range)  
- `isMcpVersionSupported('5.0.0')` → `false` (above required range)
- `isMcpVersionSupported(undefined)` → `false` (missing version)
- `isMcpVersionSupported('')` → `false` (empty string)

**Results**:
| Metric | Before | After |
|--------|--------|-------|
| Overall mutation score | 95.18% | **96.39%** ✅ |
| compat.ts mutation score | 90% | **95%** ✅ |
| Mutant #30 (ConditionalExpression→true) | Survived | **Killed** ✅ |
| Mutant #32 (LogicalOperator &&→\|\|) | Survived | **Killed** ✅ |

**Verified Checks Pass**:
- ✅ Unit tests (1146 passed)
- ✅ Lint & TypeCheck
- ✅ Format check
- ✅ Coverage ratchet
- ✅ Security tests
- ✅ `check:mutation-policy` (96.3% break threshold met)
- ✅ `test:release-please` (28 tests passed)
- ✅ Compatibility metadata preserved (kicad-mcp-pro 4.0.1, boardreadyops 1.68.3)

**Note**: Remaining 2 survivors in `compat.ts` (#23, #24) are equivalent mutants in `coerceMcpVersion` (unavoidable since `semver.coerce(undefined)` returns `null` either way). The 4 survivors in `toolCapabilityModes.ts` are unrelated to this issue.
