# Security

Report vulnerabilities through GitHub Security Advisories for the canonical repository:

https://github.com/oaslananka/kicad-studio-kit/security/advisories/new

Do not open public issues for active vulnerabilities. Include the affected package, version, reproduction details, and any known exploitability constraints.

## Threat Model

The extension's assets, trust boundaries, modeled threats with their code/test
evidence, and accepted residual risks are documented in
[docs/security/threat-model.md](docs/security/threat-model.md). The guarded
operation layer (`apps/vscode-extension/src/security/guardedOperations.ts`)
centralizes workspace-trust, path-canonicalization, and boundary enforcement for
write, export, import, and MCP operations.

## Security assurance documents

- [Threat model](docs/security/threat-model.md)
- [Release integrity](docs/security/release-integrity.md)
- [Input validation](docs/security/input-validation.md)
- [Assurance case](docs/security/assurance-case.md)

## Private vulnerability handling

Use the GitHub Security Advisory flow for private reports. The project aims to acknowledge active vulnerability reports within 7 calendar days and provide a coordinated fix plan, mitigation, or status update within 14 calendar days when the report is reproducible and in scope.

Security reports should include:

- affected version or commit;
- operating system and VS Code/KiCad versions when relevant;
- reproduction steps or proof of concept;
- expected impact and exploitability constraints;
- whether public credit is requested after disclosure.

The project will coordinate public disclosure after a fix, mitigation, or maintainer-approved advisory is ready. Reporter credit is supported when requested and when disclosure is coordinated responsibly.

## GitHub Actions permissions

Repository workflow tokens default to read-only, GitHub Actions cannot approve pull-request reviews, and platform SHA pinning is required. Workflow-specific write permissions are job-scoped and validated by `corepack pnpm run check:actions-permissions`. See [GitHub Actions permissions](docs/architecture/actions-permissions.md).
