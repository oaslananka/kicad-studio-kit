# Security Model

The repository uses GitHub Actions, protected environments, trusted publishing for package registries, and preflight checks for version consistency and forbidden repository references.

Secrets are limited to marketplace publishing where OIDC is not available:

- `VSCE_PAT`
- `OVSX_PAT`
