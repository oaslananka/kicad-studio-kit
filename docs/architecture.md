# Architecture

The repository is split by release surface:

- `apps/vscode-extension`: VS Code and Open VSX extension root.
- (removed — MCP server source now at [oaslananka/kicad-mcp-pro](https://github.com/oaslananka/kicad-mcp-pro)).

Root metadata only orchestrates workspace checks, release automation, documentation, and publish workflows.

Detailed architecture documents:

- [Repository structure](architecture/repo-structure.md)
- [Product boundaries](architecture/product-boundaries.md)
- [Release model](architecture/release-model.md)
- [Branch protection](architecture/branch-protection.md)
- [Governance board model](architecture/governance-board.md)
- [Definition of done](architecture/definition-of-done.md)
- [Testing strategy](architecture/testing-strategy.md)
- [Migration phases](architecture/migration-phases.md)
- [M0 completion audit](architecture/m0-completion-audit.md)
- [Architecture Decision Records (ADR index)](adr/README.md)
- [ADR 0006: VS Code Web compatibility](adr/0006-vscode-web-compatibility.md)
- [KiCad Studio and MCP integration](integration/kicad-studio-mcp.md)
