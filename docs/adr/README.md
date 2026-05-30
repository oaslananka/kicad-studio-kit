# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the
KiCad Studio Kit monorepo. ADRs capture important decisions about
architecture, product boundaries, MCP protocol compatibility, release
and publishing policy, and security/supply-chain posture.

## Status Values

Each ADR has one of the following statuses:

| Status     | Meaning                                                    |
| ---------- | ---------------------------------------------------------- |
| Proposed   | Under review; not yet adopted.                             |
| Accepted   | Agreed and currently in effect.                            |
| Superseded | Replaced by a later ADR. Links to the superseding ADR.     |
| Deprecated | No longer recommended but retained for historical context. |
| Rejected   | Considered and explicitly not adopted.                     |

## When an ADR Is Required

An ADR is **mandatory** before implementing any change that affects:

1. **Monorepo structure** — adding, removing, or merging product
   workspaces, changing the topology, or changing the package manager.
2. **MCP protocol or schema** — breaking tool names, parameter shapes,
   capability metadata, transport mode, or compatibility assertions.
3. **KiCad version support policy** — adding, deprecating, or removing
   a KiCad support line.
4. **Release model** — changing versioning, publish targets, artifact
   format, or release-please configuration.
5. **Product dependency boundaries** — allowing or forbidding a new
   dependency direction between workspaces.
6. **Bundling or distribution** — bundling the MCP server with the
   extension, changing how products are packaged or delivered.
7. **Security or supply-chain** — adding a new dependency with broad
   access, changing credential handling, or adopting a new vulnerability
   management process.

An ADR is **not required** for:

- Routine dependency updates (patch/minor bumps, security patches for
  existing dependencies).
- Bug fixes that do not change the documented architecture.
- Cosmetic or UI-only changes.
- CI or tooling changes that do not affect product behavior or
  compatibility.
- Test-only changes.

When in doubt, open a **Proposed** ADR. It is easier to skip an
unnecessary ADR during review than to retroactively document a decision
that was not recorded.

## Numbering and Naming Convention

- ADRs are numbered sequentially: `0001`, `0002`, ..., `NNNN`.
- File name: `NNNN-kebab-case-title.md`.
- Numbers are never reused. A superseded ADR keeps its original number.
- The next ADR number is `0009` (the first unused number as of this
  writing).

## How Superseding Works

1. The new ADR is created with status **Accepted** (or **Proposed**).
2. The new ADR body includes a "Supersedes" line referencing the old ADR.
3. The old ADR's status is updated to **Superseded by NNNN** with a link.
4. Both ADRs remain in the repository for historical traceability.

## Review and Merge Expectations

- **Proposed** ADRs are reviewed through a pull request. At least one
  maintainer (`@oaslananka`) must approve before the ADR can be Accepted.
- **Accepted** ADRs are considered binding policy. Subsequent work must
  follow the accepted decision unless a superseding ADR changes it.
- ADR-only PRs follow the same CI gates as code PRs.
- ADR changes that also change product behavior must be reviewed alongside
  the behavioral change.

## Index

| #    | Title                                                                        | Status   |
| ---- | ---------------------------------------------------------------------------- | -------- |
| 0001 | [Monorepo Two Products](0001-monorepo-two-products.md)                       | Accepted |
| 0002 | [MCP Contract-First Integration](0002-mcp-contract-first-integration.md)     | Accepted |
| 0003 | [Independent Release Model](0003-independent-release-model.md)               | Accepted |
| 0004 | [No Direct Cross-Product Imports](0004-no-direct-cross-product-imports.md)   | Accepted |
| 0005 | [KiCad Version Support Policy](0005-kicad-version-support-policy.md)         | Accepted |
| 0006 | [VS Code Web Compatibility](0006-vscode-web-compatibility.md)                | Accepted |
| 0007 | [Agent Onboarding and MCP Config Pack](0007-agent-onboarding-config-pack.md) | Accepted |
| 0008 | [MCP 2026-07-28 Protocol Upgrade](0008-mcp-2026-07-28-protocol-upgrade.md)   | Accepted |

## Creating a New ADR

```bash
cp docs/adr/0000-template.md docs/adr/$(printf '%04d' $(($(ls docs/adr/*.md | wc -l)))).md
```
