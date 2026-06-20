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
