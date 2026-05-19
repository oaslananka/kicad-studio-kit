# Release State Machine

`scripts/release-state.mjs` reports where the repository is in the release
flow and what the next safe command is. It does not publish, create releases,
or mutate refs.

## States

- `no-release`
- `release-pr-open`
- `release-pr-green`
- `release-pr-merged`
- `tag-created`
- `dry-run-success`
- `vsix-built`
- `marketplace-dry-run-ok`
- `open-vsx-dry-run-ok`
- `vscode-marketplace-published`
- `open-vsx-published`
- `github-release-published`
- `personal-mirror-synced`
- `post-release-smoke-success`
- `complete`
- `blocked`

## Inputs Inspected

The script checks:

- `package.json` version
- `pnpm-lock.yaml` root version
- expected `v<version>` tag
- GitHub Release for the tag
- local VSIX artifact
- local `SHA256SUMS.txt`
- local `sbom.cdx.json`
- latest Release workflow runs
- canonical `main` and personal mirror `main` SHAs

Remote inspection uses `GH_TOKEN` or `GITHUB_TOKEN` when available. Without a
token, the script still reports local package state and records remote
inspection as a blocker.

## Usage

```bash
node scripts/release-state.mjs --repo oaslananka/kicad-studio --json
```

```bash
GH_TOKEN=<token> node scripts/release-state.mjs \
  --repo oaslananka/kicad-studio \
  --summary-file release-state.json
```

## Publish Safety

`safe_to_publish` is conservative. It remains false until local package state,
remote tag/release state, latest release workflow state, and VSIX artifact
state are all coherent. The state machine is an operator aid, not a publishing
authority.
