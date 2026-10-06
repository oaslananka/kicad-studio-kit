## Summary

Fixed the compatibility metadata to match published artifacts as required by the compatibility canary:

### Updated Versions
- **kicad-mcp-pro**: `3.35.2` → `4.0.1` (with required range updated from `>=3.5.2 <4.0.0` to `>=3.5.2 <5.0.0`)
- **boardreadyops**: `1.68.2` → `1.68.3`

### Files Modified
1. **compatibility.yaml** - Updated `supportAxes.mcpServer`, `supportAxes.boardReadyOps`, and `products.kicad-studio.compatibleMcpPro` with new versions and ranges
2. **apps/vscode-extension/src/mcp/compatibilityMatrix.ts** - Synchronized embedded extension compatibility matrix
3. **docs/support-matrix.md** - Updated Independent Support Axes section (manually maintained portion)
4. **apps/vscode-extension/README.md** - Updated MCP Compatibility documentation
5. **docs/integration.md** - Updated supported server range and tested version
6. **scripts/check-compatibility-contract.test.mjs** - Updated drift test to use new base version
7. **apps/vscode-extension/test/unit/mcpCompat.test.ts** - Updated test expectations for new range/version
8. **apps/vscode-extension/test/unit/compat.test.ts** - Updated incompatible version test (5.0.0 instead of 4.0.0)
9. **apps/vscode-extension/test/unit/mcpClient.versionGate.test.ts** - Updated incompatible version tests

### Verification
- ✅ Compatibility contract validation passes (`check:compatibility-contract` - 45 tests)
- ✅ All unit tests pass (1145 tests)
- ✅ Lint passes
- ✅ Typecheck passes
- ✅ Version consistency checks pass
- ✅ Release surface checks pass

### Known Pre-existing Issue
The release-please monorepo policy fails due to commit `2c6b5fe` ("fix: current CI/security failures on kicad PR #719") lacking a conventional commit scope. This is a pre-existing issue in PR #719 that would require amending the commit message to include a scope (e.g., `fix(kicad-studio): ...`).