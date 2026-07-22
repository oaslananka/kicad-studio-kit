# Architecture

KiCad Studio Kit is the VS Code extension repository for KiCad Studio. It owns the
extension (`apps/vscode-extension`), private shared test infrastructure, examples,
governance docs, and the extension-side MCP integration contract. The KiCad MCP Pro
server is developed and released separately in
[KiCad MCP Pro](https://oaslananka.github.io/kicad-mcp-pro/) — see
[ADR 0009](../adr/0009-split-kicad-mcp-pro-into-separate-repository.md).

## Core Architecture Docs

- [Repository structure](repo-structure.md)
- [Product boundaries](product-boundaries.md)
- [Release model](release-model.md)
- [Branch protection](branch-protection.md)
- [Definition of done](definition-of-done.md)
- [Protocol change checklist](protocol-change-checklist.md)
- [Review evidence policy](review-evidence-policy.md)
- [Governance board model](governance-board.md)
- [M0 completion audit](m0-completion-audit.md)
- [Testing strategy](testing-strategy.md)

## Cross-Product References

- [KiCad Studio and MCP integration](../integration/kicad-studio-mcp.md)
- [Support matrix](../support-matrix.md)
- [Threat model](../security/threat-model.md)
- [Reusable workflows](../reusable-workflows.md)
- [Dependency lifecycle](../dependency-lifecycle.md)
