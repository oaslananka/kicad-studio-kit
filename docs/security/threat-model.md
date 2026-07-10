# Threat Model

This threat model covers the KiCad Studio VS Code extension (this repository).
The MCP server is threat-modeled separately in
[oaslananka/kicad-mcp-pro](https://github.com/oaslananka/kicad-mcp-pro); here we model
only the extension-side surface and the client-side MCP integration.

Each mitigation links to the code and tests that enforce it. The
`threatModel.test.ts` suite parses the evidence column below and fails if any
referenced file is missing, so this document cannot claim coverage that does not
exist.

## Assets

- The user's KiCad project files and the workspace file tree.
- Generated manufacturing/export artifacts (Gerbers, drill, BOM, release bundles).
- Provider credentials (AI API keys, Octopart/Nexar keys) held in VS Code
  SecretStorage.
- The extension host process and its filesystem access.

## Trust Boundaries

- **Workspace trust.** An opened workspace may be untrusted (Restricted Mode).
  Project content (file names, `.kicad_*` contents, configured paths) is
  attacker-controlled input until the user trusts the workspace.
- **User-supplied paths.** Output directories and import sources come from input
  boxes and settings and must be confined to the workspace.
- **External tooling.** The configured `kicad-cli` path and the MCP endpoint are
  configuration the extension shells out to / connects to.
- **Webviews.** Custom editors and panels render untrusted project-derived
  content inside webviews.

## Threats and Mitigations

| ID | Threat | Mitigation | Evidence |
| --- | --- | --- | --- |
| T1 | Path traversal (`..`) in a user-supplied output or import path writes outside the workspace | All guarded paths are resolved and asserted inside the workspace root | `apps/vscode-extension/src/security/guardedOperations.ts`, `apps/vscode-extension/src/utils/pathUtils.ts`, `apps/vscode-extension/test/unit/guardedOperations.test.ts`, `apps/vscode-extension/test/unit/pathRegressionSuite.test.ts` |
| T2 | A symlink inside the workspace points outside it, escaping the boundary | Boundary checks compare symlink-resolved canonical paths (`fs.realpathSync.native`) | `apps/vscode-extension/src/utils/pathUtils.ts`, `apps/vscode-extension/test/unit/guardedOperations.test.ts`, `apps/vscode-extension/test/security/securityRegression.test.ts` |
| T3 | A state-changing operation runs in an untrusted (Restricted Mode) workspace | Trust gate enforced in code (not only menu visibility) before write/export/MCP operations | `apps/vscode-extension/src/security/guardedOperations.ts`, `apps/vscode-extension/src/utils/workspaceTrust.ts`, `apps/vscode-extension/test/unit/workspaceTrust.test.ts`, `apps/vscode-extension/test/unit/mcpCommandsTrust.test.ts`, `apps/vscode-extension/test/unit/pcmCommandsTrust.test.ts` |
| T4 | A malicious or mistyped manufacturing-release output folder writes a bundle outside the workspace | The wizard asserts trust and resolves the output folder through the central guard | `apps/vscode-extension/src/commands/manufacturingReleaseWizard.ts`, `apps/vscode-extension/test/unit/guardedOperations.test.ts` |
| T5 | An unsafe or spoofed `kicad-cli` path is configured and executed | CLI path is canonicalized and capability-probed before use; commands stay gated by detected support | `apps/vscode-extension/src/cli/kicadCliDetector.ts`, `apps/vscode-extension/test/unit/kicadCliSupport.test.ts` |
| T6 | The MCP endpoint fails or reports an unsafe operating mode | Connection results gate MCP context keys; restricted/disconnected states disable MCP-affecting actions | `apps/vscode-extension/src/mcp/mcpClient.ts`, `apps/vscode-extension/test/unit/mcpCommandsTrust.test.ts` |
| T7 | A webview escapes its boundary (script injection or arbitrary local resource read) | Webview HTML uses nonced CSP and restricted local resource roots; fuzz tests cover rendering of hostile content | `apps/vscode-extension/src/utils/nonce.ts`, `apps/vscode-extension/test/unit/securityFuzz.test.ts` |
| T8 | Provider credentials leak through plaintext settings | Keys are migrated to and read from VS Code SecretStorage; plaintext runtime fallback is disabled | `apps/vscode-extension/src/utils/secrets.ts`, `apps/vscode-extension/test/unit/guardedOperations.test.ts` |

## Residual Risks

- **Trusted-workspace code execution.** Once a user trusts a workspace, the
  extension shells out to `kicad-cli` with project paths. A user who trusts a
  malicious project accepts the same risk as opening it in KiCad directly. This
  is accepted; trust gating is the mitigation boundary.
- **CLI/endpoint integrity.** The extension validates the configured `kicad-cli`
  path and MCP endpoint shape but does not verify a code signature of the binary
  or authenticate the MCP server beyond its reported compatibility metadata.
- **Webview rendering depth.** CSP + nonce mitigate injection, but a future
  rendering feature that introduces `eval`-like behavior would need its own
  review. New or changed webviews must keep the accessibility and security
  fixtures current.
- **Symlink TOCTOU.** Boundary checks resolve canonical paths at validation
  time; a path that is replaced with a symlink between validation and write is
  not separately defended. Output directories are created and written inside the
  same guarded flow to minimize the window.

## Reporting

Report suspected vulnerabilities through GitHub Security Advisories as described
in `SECURITY.md`. Do not open public issues for active vulnerabilities.
