# Release Process

Releases are created from the canonical `oaslananka/kicad-studio-kit`
repository. There is no secondary release authority.

## Source Of Truth

- release-please manifest mode controls version selection.
- Conventional Commit history determines SemVer bumps.
- `.release-please-manifest.json` records the current release state.
- `release-please-config.json` defines the package metadata and changelog path.
- Maintainers do not enter release versions manually.

## Workflow

1. A qualifying commit lands on `main`.
2. `.github/workflows/release-please.yml` runs release-please.
3. If a release PR is needed, release-please opens or updates it.
4. After the release PR is merged, release-please creates the GitHub Release.
5. Asset jobs build the VSIX from a clean runner checkout.
6. The workflow generates `SHA256SUMS.txt`, `sbom.cdx.json`, and provenance.
7. Assets are attached to the GitHub Release and verified.
8. Registry publishing runs from the release tag when release outputs indicate a
   release was created.

Manual workflow dispatch is available for diagnostics only and accepts no
version input.

## Package Validation

The VSIX content gate is `corepack pnpm --filter kicadstudiokit run
package:validate`. Run it after `corepack pnpm --filter kicadstudiokit run
package` so the check can compare `vsce ls --no-dependencies` output, required
viewer media, KiCanvas assets, Marketplace assets, contribution registrations,
schema and grammar JSON, bundle sizes, and forbidden file patterns.

The packaged file allowlist lives in
`apps/vscode-extension/scripts/package-allowlist.json`. Update it only when a
new runtime file is intentionally shipped. Before changing the allowlist, run:

```bash
corepack pnpm --filter kicadstudiokit run build
corepack pnpm --filter kicadstudiokit run package
corepack pnpm --filter kicadstudiokit exec vsce ls --no-dependencies
corepack pnpm --filter kicadstudiokit run package:validate
```

Review every new `vsce ls` path before adding it to `allowedFiles` or
`allowedGlobs`. Never allow `.env`, logs, source trees, node caches, test
artifacts, output folders, maps, VSIX files, checksums, SBOMs, or generated
temporary files into the VSIX.

Required secrets:

- `VSCE_PAT`
- `OVSX_PAT`

Supporting secrets:

- `CODECOV_TOKEN` for coverage upload only
- `SENTRY_AUTH_TOKEN` only when source maps are uploaded

Before release triage, inspect the state machine:

```bash
GH_TOKEN=<token> node scripts/release-state.mjs --repo oaslananka/kicad-studio-kit --json
```

`safe_to_publish` is advisory and conservative. Publishing authority remains in
the publish workflows and their GitHub environment approvals.
