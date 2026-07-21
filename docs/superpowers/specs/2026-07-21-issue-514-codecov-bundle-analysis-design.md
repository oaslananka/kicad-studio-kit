# Issue 514 Codecov Bundle Analysis Design

## Goal

Activate Codecov JavaScript Bundle Analysis for the VS Code extension only after a processed default-branch coverage baseline exists, and never treat a Webpack build as a successful bundle upload without positive Codecov confirmation.

## Preconditions and evidence

PR #513 merged as commit `f4911e8eeb73b85368741dd0cd810967cde7473e`. The first `main` Codecov upload completed successfully. Codecov's public branch-detail API reports:

- branch: `main`;
- head commit: `f4911e8eeb73b85368741dd0cd810967cde7473e`;
- processing state: `complete`;
- files: 104;
- lines: 7,788;
- coverage: 75.08%;
- sessions: 1.

This satisfies the onboarding dependency recorded in #514.

A controlled API diagnostic isolated the authentication failure. The same public-repository PR payload sent to `POST /upload/bundle_analysis/v1` returned `404` when the Webpack plugin attached the repository upload token, while the tokenless GitHub payload returned `202 queued` and a pre-signed upload URL. Coverage and test-result uploads continue to accept the repository token. Bundle Analysis therefore uses Codecov's documented tokenless GitHub path rather than passing the coverage token into the plugin.

## Architecture

### Webpack integration boundary

`apps/vscode-extension/webpack.config.js` exports its existing configuration factory plus a testable `createPlugins(environment)` helper. The helper always includes the existing AWS SDK ignore plugin. It adds `@codecov/webpack-plugin` only when both conditions are true:

- `CODECOV_BUNDLE_ANALYSIS=true`;
- `CODECOV_TOKEN` is a non-empty string.

The plugin uses the stable configured bundle base `kicad-studio-vscode-extension` and its Webpack CommonJS upload name `kicad-studio-vscode-extension-cjs`, disables plugin telemetry, and receives explicit GitHub branch, pull-request, SHA, and repository-slug overrides. Local builds, package builds, release builds, repeatability checks, and OS matrix builds leave the opt-in variable unset and therefore never upload bundle data.

### Dedicated CI upload lane

The existing non-required `codecov` job remains the only external observability lane. Its checkout fetches full history. LCOV and JUnit actions use the repository token; the following production bundle build uses tokenless GitHub authentication with explicit bundle context.

The build output is captured with `tee` and `pipefail`. The step fails when either condition is true:

- the plugin reports `Failed to get pre-signed URL` or `Failed to upload stats`;
- the log does not contain `[codecov] Successfully uploaded stats for bundle: kicad-studio-vscode-extension-cjs`.

This converts the plugin's non-fatal upload behavior into a fail-closed observability check without making Codecov part of the aggregate `required` branch-protection context.

### Codecov policy

`codecov.yml` adds Bundle Analysis as informational with a 5% warning threshold. Coverage project and patch statuses remain informational with `target: auto` and 1% thresholds. Jest remains the blocking coverage authority.

## Security and failure handling

- Fork pull requests skip the entire dedicated Codecov job.
- The repository token remains limited to LCOV and JUnit actions; Bundle Analysis does not pass it to the Webpack plugin.
- Plugin telemetry is disabled.
- Actions remain pinned to immutable commit SHAs and the plugin dependency is exactly pinned.
- Codecov failure does not weaken product CI; the existing aggregate `required` job remains authoritative.
- A green Webpack compilation with a failed bundle upload is explicitly rejected.

## Testing strategy

Repository policy tests verify exact dependency/configuration pins, fork guards, explicit Git context, full checkout history, fail-closed log matching, informational YAML, and exclusion from the aggregate required job. A focused Webpack test verifies normal builds exclude the plugin, explicit GitHub tokenless opt-in adds exactly one plugin, missing token does not enable upload, and telemetry/context options are present.

Final validation includes frozen install, policy tests, normal production build with bundle variables unset, package validation, official Codecov YAML validation, GitHub CI, live bundle upload logs, Codecov Bundles visibility, informational pull-request bundle status, and all bot/agent feedback.
