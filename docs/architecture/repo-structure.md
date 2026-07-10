# Repository Structure

KiCad Studio Kit is one GitHub repository with one local release surface and
cross-repo compatibility coverage for the external MCP server:

| Workspace                                                                        | Product role                                        | Public surface                                         |
| -------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------ |
| `apps/vscode-extension`                                                          | KiCad Studio VS Code and Open VSX extension         | `oaslananka.kicadstudiokit`                            |
| (external — see [oaslananka/kicad-mcp-pro](https://github.com/oaslananka/kicad-mcp-pro)) | KiCad MCP Pro Python server and MCP Registry source | `kicad-mcp-pro` / `io.github.oaslananka/kicad-mcp-pro` |

| `packages/test-harness` | Private shared test utilities | Not published |

The folder names intentionally preserve the package roots used by the current publish workflows:

- `apps/vscode-extension` keeps VS Code extension-root semantics for VSIX packaging.

- `packages/test-harness` is private test-only infrastructure used by product
  tests and CI gates. It is never a production dependency or release surface.

Do not introduce additional canonical repositories, mirrors, or alternate release roots. Cross-product work should flow through compatibility metadata, MCP manifests, shared fixtures, and contract tests rather than direct source imports.

## README ownership

This repository intentionally keeps two top-level user-facing README surfaces:

| File                              | Audience                                                            | Why it exists                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`                       | GitHub repository visitors, contributors, auditors, and maintainers | Explains repository scope after the MCP split, validation commands, governance, architecture, security, and contribution flow.     |
| `apps/vscode-extension/README.md` | Visual Studio Marketplace, Open VSX, and extension users            | Ships inside the VSIX and must stay product-focused: screenshots, install flow, feature summary, compatibility, and release notes. |

Do not collapse these files into one document. The Marketplace renderer reads the
extension README from the packaged VSIX, while GitHub renders the root README as
the repository landing page. Shared facts such as the extension version and
Marketplace image paths are guarded by `release:surface` and `marketplace:check`
so the two surfaces can stay intentionally different without drifting.

## Root ownership

The repository root owns orchestration only:

- workspace package manager configuration
- version and forbidden-reference preflight scripts
- release and publish workflows
- architecture, publishing, security, and integration documentation

The root package is `private: true` and is never published.

## Product ownership

Extension-only changes belong under `apps/vscode-extension` unless they update root CI, docs, or release metadata.

MCP server changes now live in [oaslananka/kicad-mcp-pro](https://github.com/oaslananka/kicad-mcp-pro);
this repository owns only the extension-side MCP integration contract. See
[ADR 0009](../adr/0009-split-kicad-mcp-pro-into-separate-repository.md) for the
split rationale.

## Shared work

Shared contracts are consumed from
[`@oaslananka/kicad-protocol-schemas`](https://www.npmjs.com/package/@oaslananka/kicad-protocol-schemas)
(published from [oaslananka/kicad-mcp-pro](https://github.com/oaslananka/kicad-mcp-pro)).
See the [schema release lifecycle](../protocol-schemas.md#release-lifecycle) for
the cross-repo release process and CI validation gates.
Shared test utilities live under
`packages/test-harness`. Shared packages must stay under `packages/` and must
not import from any product workspace.
