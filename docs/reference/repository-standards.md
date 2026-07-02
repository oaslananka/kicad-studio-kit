# Reference: Repository Standards

This reference summarizes the repository standards that contributors and maintainers should apply.

## Maturity classification

| Level                       | Current status                                              |
| --------------------------- | ----------------------------------------------------------- |
| Experimental / Sandbox-like | Not current target.                                         |
| Incubating-like             | Some community and governance gaps remain.                  |
| Production-ready            | Current practical level for the released VS Code extension. |
| Foundation-grade candidate  | Gap-tracked only; not claimed.                              |

## Required repository files

| File                 | Purpose                                                    |
| -------------------- | ---------------------------------------------------------- |
| `README.md`          | Project overview, install, validation, product boundaries. |
| `LICENSE`            | MIT license.                                               |
| `CONTRIBUTING.md`    | Contribution process, DCO, ADR expectations.               |
| `CODE_OF_CONDUCT.md` | Contributor behavior standards.                            |
| `SECURITY.md`        | Private vulnerability reporting.                           |
| `SUPPORT.md`         | Support channels and response goals.                       |
| `GOVERNANCE.md`      | Roles, decision process, review policy.                    |
| `MAINTAINERS.md`     | Current maintainer list and continuity model.              |
| `ROADMAP.md`         | Public direction and priorities.                           |
| `.github/CODEOWNERS` | Path ownership and review routing.                         |

## Required change process

1. Open a branch and pull request.
2. Keep the PR single-purpose.
3. Complete the PR template.
4. Include tests or explain why not applicable.
5. Use Conventional Commits and DCO sign-off for non-trivial work.
6. Use ADRs for architecture, release, security, compatibility, and product-boundary changes.

## Status vocabulary

Use these classifications in maturity reports:

- `Passed`
- `Partial`
- `Missing`
- `Not applicable`
- `Needs human confirmation`
