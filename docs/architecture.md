# Architecture

The repository is split by release surface:

- `apps/vscode-extension`: VS Code and Open VSX extension root.
- `packages/mcp-server`: Python package and MCP Registry source of truth.
- `packages/mcp-npm`: npm wrapper that launches the Python package through `uvx`.

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
- [ADR 0006: VS Code Web compatibility](adr/0006-vscode-web-compatibility.md)
- [KiCad Studio and MCP integration](integration/kicad-studio-mcp.md)
