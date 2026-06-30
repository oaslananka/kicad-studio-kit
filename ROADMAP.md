# Roadmap

KiCad Studio Kit is the VS Code extension surface for KiCad-focused EDA workflows. The roadmap is intentionally evidence-driven: every milestone should leave tests, documentation, release evidence, or governance records that can be audited later.

## Current priorities

1. **Repository trust hardening** — activate the versioned branch ruleset, complete the OpenSSF Best Practices questionnaire, and clear stale Scorecard alerts after the next scan.
2. **Release evidence maturity** — keep VSIX checksums, SBOM, provenance, and GitHub artifact attestations attached to every marketplace release.
3. **Compatibility reliability** — keep KiCad, VS Code, Node, Python, MCP integration, and protocol-schema compatibility documented and tested.
4. **Premium user experience** — continue reducing viewer, diagnostics, status, and workflow friction with regression tests for every fixed user-facing bug.

## Milestones

| Milestone | Theme                                        | Exit evidence                                                                                     |
| --------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| M0        | Repository foundation and product boundaries | ADRs, product-boundary docs, compatibility matrix, branch policy                                  |
| M1        | Test foundation                              | Unit, fixture, contract, accessibility, visual, integration, and package validation gates         |
| M2        | MCP compatibility                            | Versioned compatibility metadata, real-pair tests, tool and transport docs                        |
| M3        | Premium UI/UX reliability                    | Viewer, diagnostics, sidebar, status, and workflow regressions covered by tests                   |
| M4        | Release, security, and lifecycle hardening   | SBOM/provenance, release runbooks, dependency lifecycle, security policy, Best Practices evidence |

The detailed execution board is documented in [docs/architecture/governance-board.md](docs/architecture/governance-board.md). Release readiness is tracked in [docs/ga-readiness.md](docs/ga-readiness.md), and beta workflow maturity is tracked in [docs/beta-program.md](docs/beta-program.md).

## Update policy

Roadmap changes should be made through reviewed pull requests. Any roadmap item that changes the release model, product boundary, security policy, or compatibility contract must also update the matching ADR, policy document, or test gate.
