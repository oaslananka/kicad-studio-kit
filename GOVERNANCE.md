# Governance

KiCad Studio Kit is governed through repository-local policy files, Architecture Decision Records, CODEOWNERS review, and GitHub project tracking.

## Roles and responsibilities

| Role               | Responsibility                                                                                       | Evidence                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Maintainer         | Release approval, branch protection, marketplace credentials, security triage, final merge decisions | `CODEOWNERS`, branch ruleset, release runbook |
| Code owner         | Review path-specific changes and enforce product boundaries                                          | `.github/CODEOWNERS`                          |
| Contributor        | Keep changes single-purpose, add regression coverage, follow contribution and security policy        | `CONTRIBUTING.md`, pull request template      |
| Security responder | Triage private vulnerability reports, coordinate fixes, request CVE/advisory handling when needed    | `SECURITY.md`, `docs/security.md`             |

## Decision process

Architecture, release, security, compatibility, and product-boundary decisions are recorded as ADRs under `docs/adr/`. Routine bug fixes and documentation corrections do not need an ADR unless they change policy or public compatibility.

## Access continuity

Maintainers should keep repository access, marketplace publish tokens, and release credentials limited to the minimum required people. Administrative access must use strong authentication, and token rotation should happen after maintainer changes or suspected exposure.

## Bus-factor policy

Critical release and security procedures must be documented well enough that a second maintainer can execute them from repository evidence. The release runbook, branch protection policy, and Best Practices evidence page are part of this continuity model.

## Review policy

Human changes to `main` should go through pull requests. Required checks, signed commits, and review-thread resolution remain the merge authority under the current solo-maintainer model; no independent-approval requirement should be introduced if it would deadlock maintenance.

Pull requests must follow the [review evidence policy](docs/architecture/review-evidence-policy.md). Automated-review results must be recorded truthfully, all bot and agent comments must be triaged, and unavailable reviewers require compensating evidence for medium/high-risk changes. Direct pushes to `main` should be reserved for emergency recovery and documented afterward.

## Related documents

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)
- [ROADMAP.md](ROADMAP.md)
- [docs/architecture/governance-board.md](docs/architecture/governance-board.md)
- [docs/architecture/branch-protection.md](docs/architecture/branch-protection.md)
