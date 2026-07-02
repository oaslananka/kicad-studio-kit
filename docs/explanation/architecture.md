# Explanation: Architecture

KiCad Studio Kit is a VS Code extension repository for KiCad-focused EDA workflows. It is intentionally scoped to extension-side functionality and does not own the separate KiCad MCP server implementation.

## Product boundary

This repository owns:

- VS Code extension code under `apps/vscode-extension`;
- extension-side MCP discovery, configuration, and compatibility behavior;
- shared test fixtures and contract metadata;
- release evidence for the VS Code extension.

The MCP server implementation is released separately from `oaslananka/kicad-mcp`.

## Architectural controls

The repository uses several controls to keep the architecture maintainable:

- Architecture Decision Records under `docs/adr/`.
- Product-boundary and repository-structure docs under `docs/architecture/`.
- Compatibility metadata in `compatibility.yaml`.
- CI lane detection and targeted quality gates.
- CODEOWNERS and PR template protocol-impact sections.

## Maturity implication

The architecture is production-ready for a focused VS Code extension, but foundation-grade maturity also requires operational evidence: multiple maintainers, enforced branch protection, sustained human review, and repeated release evidence.

## Related references

- `docs/architecture/repo-structure.md`
- `docs/architecture/product-boundaries.md`
- `docs/architecture/release-model.md`
- `docs/architecture/branch-protection.md`
- `docs/repo-maturity-report.md`
