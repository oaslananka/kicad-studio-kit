# Repository Structure

KiCad Studio Kit is one GitHub repository with three independently validated release surfaces:

| Workspace               | Product role                                        | Public surface                                         |
| ----------------------- | --------------------------------------------------- | ------------------------------------------------------ |
| `apps/vscode-extension` | KiCad Studio VS Code and Open VSX extension         | `oaslananka.kicadstudiokit`                            |
| `packages/mcp-server`   | KiCad MCP Pro Python server and MCP Registry source | `kicad-mcp-pro` / `io.github.oaslananka/kicad-mcp-pro` |
| `packages/mcp-npm`      | Thin npm launcher for the Python server             | `kicad-mcp-pro`                                        |
| `packages/test-harness` | Private shared test utilities                       | Not published                                          |

The folder names intentionally preserve the package roots used by the current publish workflows:

- `apps/vscode-extension` keeps VS Code extension-root semantics for VSIX packaging.
- `packages/mcp-server` keeps the Python package, Docker, docs, and MCP Registry metadata together.
- `packages/mcp-npm` remains a separate npm wrapper so npm publishing does not mix with Python packaging.
- `packages/test-harness` is private test-only infrastructure used by product
  tests and CI gates. It is never a production dependency or release surface.

Do not introduce additional canonical repositories, mirrors, or alternate release roots. Cross-product work should flow through compatibility metadata, MCP manifests, shared fixtures, and contract tests rather than direct source imports.

## Root ownership

The repository root owns orchestration only:

- workspace package manager configuration
- version and forbidden-reference preflight scripts
- release and publish workflows
- architecture, publishing, security, and integration documentation

The root package is `private: true` and is never published.

## Product ownership

Extension-only changes belong under `apps/vscode-extension` unless they update root CI, docs, or release metadata.

MCP server changes belong under `packages/mcp-server` unless they update the npm wrapper, root CI, docs, or compatibility metadata.

npm launcher changes belong under `packages/mcp-npm` unless they update Python package version coordination or release metadata.

## Shared work

Shared contracts are consumed from
[`@oaslananka/kicad-protocol-schemas`](https://www.npmjs.com/package/@oaslananka/kicad-protocol-schemas)
(published from [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp)).
The local `packages/protocol-schemas/` directory is a migration remnant and will
be removed after the npm-based consumption is validated in CI. Shared test
utilities live under
`packages/test-harness`. Shared packages must stay under `packages/` and must
not import from any product workspace.
