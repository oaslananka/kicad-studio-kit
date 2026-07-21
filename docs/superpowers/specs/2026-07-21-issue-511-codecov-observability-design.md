# Issue 511 Codecov Observability Design

## Goal

Add Codecov coverage, Test Analytics, and JavaScript Bundle Analysis for the VS Code extension while preserving the repository's existing local Jest thresholds and aggregate `required` CI gate as the blocking sources of truth.

## Current state

The `vscode-extension` matrix already runs Jest coverage on Linux, macOS, and Windows. Jest emits LCOV and a JSON summary, enforces repository-owned thresholds, and the Ubuntu pull-request lane publishes the JSON summary for the existing coverage comment. The extension is bundled with Webpack 5, but the repository does not emit JUnit XML or upload coverage, test results, or bundle metadata to Codecov.

## Considered approaches

### Upload from every matrix lane

This maximizes OS-specific data but repeats equivalent TypeScript coverage uploads, makes flags and carry-forward behavior harder to reason about, and increases external-service traffic. It is rejected for the initial rollout.

### Run a separate full Codecov workflow

This cleanly isolates the service but duplicates the complete unit-test run and dependency installation. It is unnecessary because the existing Ubuntu lane already generates the canonical coverage report.

### Reuse Ubuntu reports and add one observability job

This is the selected approach. The Ubuntu matrix lane uploads LCOV, the JSON summary, and JUnit XML as one artifact even when tests fail without cancellation. A separate `codecov` job downloads available reports, uploads coverage and failed-test data, and performs one production Webpack build with Bundle Analysis explicitly enabled.

## Architecture

### Report production

`apps/vscode-extension/jest.config.js` keeps existing coverage thresholds and adds `jest-junit` only when `CI` is set. The report path is deterministic: `apps/vscode-extension/test-results/junit.xml`.

The Ubuntu matrix lane publishes:

- `apps/vscode-extension/coverage/lcov.info`;
- `apps/vscode-extension/coverage/coverage-summary.json`;
- `apps/vscode-extension/test-results/junit.xml`.

The artifact step uses `!cancelled()` so reports produced before a failed Jest run remain available.

### Coverage and test-result upload

A non-required `codecov` job runs after the extension lane with `always()` semantics. It runs only when the extension lane was selected and the event is a push, workflow dispatch, or a pull request whose head repository is the canonical repository. Fork pull requests never receive `CODECOV_TOKEN` and skip the job.

Coverage uses the immutable Codecov Action v7.0.0 commit and an explicit LCOV file. Test Analytics uses the same immutable Codecov Action v7.0.0 commit with `report_type: test_results` and the explicit JUnit file. Both pin Codecov CLI v11.3.1, disable report auto-discovery, and fail their own job if an attempted upload is invalid. Missing reports skip the matching upload rather than hiding the original test failure.

### Bundle Analysis

`@codecov/webpack-plugin` is present as a dev dependency but is added to the Webpack plugin list only when both conditions hold:

- `CODECOV_BUNDLE_ANALYSIS=true`;
- `CODECOV_TOKEN` is non-empty.

The dedicated Codecov job is the only workflow step that sets this opt-in. Normal local builds, matrix builds, package builds, release builds, and repeatability checks do not upload bundle data. The bundle is named `kicad-studio-vscode-extension`, uses GitHub metadata, and disables plugin telemetry.

### Repository YAML

Root `codecov.yml` defines:

- informational project and patch statuses during baseline establishment;
- the `vscode-extension-unit` flag scoped to extension production sources;
- a pull-request comment containing coverage diff, flags, files, and bundle changes;
- informational Bundle Analysis with a 5% warning threshold;
- ignored test, generated, and vendored paths.

The file is validated locally for repository policy and remotely with Codecov's official validator.

## Failure handling

- Existing Jest coverage thresholds remain blocking even if Codecov is unavailable.
- The `codecov` job is not listed in the aggregate `required` job dependencies or branch-protection contexts.
- Upload actions use `fail_ci_if_error: true`, making Codecov failures visible without weakening product CI.
- Fork pull requests do not run token-backed uploads or bundle builds.
- A failed unit test can still produce and upload JUnit data because artifact and Test Analytics steps use non-cancelled/always semantics.

## Testing strategy

A repository policy validator and Node test suite will enforce:

- exact action commit SHAs and Codecov CLI version;
- explicit LCOV and JUnit paths;
- same-repository pull-request guard;
- `always()`/`!cancelled()` failed-test behavior;
- Codecov exclusion from the aggregate required gate;
- informational YAML statuses and flag scope;
- conditional bundle plugin activation and telemetry opt-out;
- exact dependency versions and root script wiring.

Focused tests follow red-green TDD. Final verification includes frozen-lockfile install, policy checks, Jest coverage/JUnit generation, a normal production build proving no upload opt-in, a dry-run plugin configuration test, workflow lint, docs checks, Codecov YAML validation, and GitHub CI/bot review inspection.

## Non-goals

- Replacing Jest thresholds, SonarCloud, or the existing coverage-summary comment.
- Uploading duplicate coverage from every operating system.
- Making Codecov a required merge check before a stable default-branch baseline exists.
- Enabling bundle uploads in local, packaging, release, or repeatability workflows.
