# ADR 0004: No Direct Cross-Product Imports

Status: Accepted

Date: 2026-05-30

## Context

The monorepo contains multiple product workspaces that must stay decoupled
at source level while interoperating at runtime. Before this ADR, the
dependency boundaries were documented in `docs/architecture/product-boundaries.md`
but were not captured as a formal architecture decision.

Allowing direct imports between products would create tight coupling,
making independent releases (ADR 0003) impossible and breaking the
contract-first integration model (ADR 0002).

## Decision

Adopt strict product dependency boundaries as binding policy:

| From                                   | May depend on                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `apps/vscode-extension`                | npm deps, VS Code APIs, KiCad CLI process calls, MCP protocol data, test harness in tests only |
| (removed — see `oaslananka/kicad-mcp`) | Python deps, KiCad Python/CLI integrations, MCP protocol data                                  |
| `packages/test-harness`                | Node stdlib and shared packages only                                                           |
| Future shared packages                 | External deps and other shared packages only                                                   |

Explicitly forbidden:

- The extension must not import Python server modules (`kicad_mcp.*`).
- The MCP server must not import VS Code extension source.
- No product may use relative imports into another product workspace.
- Production source must not import `@oaslananka/kicad-test-harness` or
  path-reference `packages/test-harness`.
- Shared packages (`packages/*`) must not depend on `apps/*`.

Integration happens through MCP protocol and compatibility metadata only.
The boundary checker (`corepack pnpm run check:boundaries`) enforces these
rules in CI.

## Consequences

- Positive: Products can be developed, tested, and released independently.
- Positive: CI catches boundary violations before merge.
- Positive: Clear ownership — each team (or contributor) can work on their
  product without worrying about breaking another product's imports.
- Negative: Shared logic must be duplicated or extracted to a shared
  package, which requires an ADR (see "When an ADR Is Required").
- Negative: Cross-product debugging requires reading compatibility metadata
  and MCP protocol traces rather than following import chains.

## Alternatives Considered

- **Shared internal package for all cross-product code**: Rejected. Would
  create a coupling point that undermines independence. A shared package
  requires an ADR and must be narrowly scoped.
- **No import restrictions (free-for-all)**: Rejected. Would make
  independent releases impossible and create circular dependency risk.

## Related

- Enforced by `corepack pnpm run check:boundaries`.
- Documented in `docs/architecture/product-boundaries.md`.
- Ownership declared in `.github/CODEOWNERS`.
- Issue #67.
