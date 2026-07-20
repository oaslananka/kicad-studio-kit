# Issue 488 Documentation Link Integrity Design

## Goal

Repair the two documentation links shipped by the VS Code extension and prevent future own-repository documentation links in extension source from targeting missing files.

## Design decisions

The extension will keep using canonical GitHub `blob/main` URLs for these two actions. The MCP integration guide is extension-specific and lives at `apps/vscode-extension/docs/INTEGRATION.md`; the KiCad CLI installation guide is the root document at `docs/install.md`. Network redirects and undocumented docs-site routes will not be relied on.

A new typed `DOCUMENTATION_URLS` constant module will own both URLs. `settingsHtml.ts` and `kicadCliDetector.ts` will consume that module rather than embedding repository paths independently.

A deterministic Node repository check will scan TypeScript source under `apps/vscode-extension/src` for URLs matching this repository's `https://github.com/oaslananka/kicad-studio-kit/blob/main/<path>` form. It will decode and normalize each target, reject paths that escape the repository, and fail when the referenced path is not an existing file. The check will not make network requests.

## Error reporting

Validation failures will report the extension source file, one-based line number, and missing or unsafe repository path. Multiple failures will be reported in one run so maintainers can repair all drift together.

## Testing

Regression tests will prove that:

- the Settings panel emits the canonical MCP integration URL;
- the KiCad CLI missing-installation Help action opens the canonical install URL;
- the repository checker accepts existing targets and rejects missing targets;
- root package scripts wire the checker into `corepack pnpm run check`.

The bug-fix tests will include `#488` in their names or contract metadata, matching the repository regression policy.

## Scope boundaries

This change does not rewrite third-party URLs, convert all documentation links to the docs site, or change Settings panel external-link security policy beyond consuming the corrected constant.
