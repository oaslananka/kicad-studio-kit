# Issue 511 Codecov Coverage and Test Analytics Design

## Goal

Add Codecov coverage and failed-test analytics for the VS Code extension while preserving repository-owned Jest thresholds and the aggregate `required` CI gate as the blocking sources of truth.

## Current state

The extension matrix already runs Jest coverage on Linux, macOS, and Windows. Jest emits LCOV and a JSON summary and enforces local thresholds. The repository did not emit JUnit XML or upload either report type to Codecov.

## Architecture

### Report production

`apps/vscode-extension/jest.config.js` keeps the existing coverage thresholds and adds `jest-junit` only when `CI` is set. Reports use deterministic paths:

- `apps/vscode-extension/coverage/lcov.info`;
- `apps/vscode-extension/coverage/coverage-summary.json`;
- `apps/vscode-extension/test-results/junit.xml`.

The Ubuntu extension lane retains those files with `!cancelled()` semantics so a JUnit report created before a failed test run can still reach Test Analytics.

### Upload job

A non-required `codecov` job runs after the extension matrix. It runs for pushes, workflow dispatches, and pull requests originating from the canonical repository. Fork pull requests skip the token-backed job.

The immutable Codecov Action v7.0.0 commit is invoked twice:

1. coverage upload with the explicit LCOV file and `vscode-extension-unit` flag;
2. test-result upload with the explicit JUnit file and `report_type: test_results`.

Both calls pin Codecov CLI v11.3.1, disable report discovery, and fail their job on upload errors. Missing reports skip only the corresponding upload so the original test result remains visible.

### Repository YAML

Root `codecov.yml` defines informational project and patch statuses with `target: auto` and a 1% threshold, plus the extension-unit flag scoped to production source. Jest remains the blocking coverage authority.

## Bundle Analysis decision

Webpack Bundle Analysis was prototyped twice in PR #513. Coverage and JUnit uploads succeeded, but Codecov's bundle pre-signed URL endpoint returned `404` both with native GitHub discovery and with explicit slug, SHA, branch, and PR context. The Codecov public API showed the repository activated but no processed `main` totals.

A silently failing uploader is not acceptable. Bundle Analysis is therefore deferred to #514, which requires a processed default-branch baseline and a positive `Successfully uploaded stats` confirmation before merge. This repository does not include the bundle plugin or bundle YAML in the #511 rollout.

## Failure handling

- Existing Jest thresholds remain blocking if Codecov is unavailable.
- The `codecov` job is not listed in aggregate `required` dependencies or branch-protection contexts.
- Fork pull requests receive no Codecov secret.
- Failed test results remain uploadable via JUnit and `!cancelled()` artifact handling.
- Bundle Analysis cannot silently appear before #514 completes its live validation.

## Testing strategy

A repository policy validator and Node tests enforce exact action/CLI pins, explicit report paths, fork guards, failed-test semantics, informational statuses, root check wiring, and Bundle Analysis deferral. Final verification includes frozen install, Jest coverage/JUnit generation, workflow and docs checks, official Codecov YAML validation, GitHub CI, live upload logs, and bot/agent review inspection.
