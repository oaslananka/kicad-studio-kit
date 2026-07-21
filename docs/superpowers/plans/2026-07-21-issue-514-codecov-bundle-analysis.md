# Codecov Bundle Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate fail-closed Codecov Bundle Analysis for the production VS Code extension bundle after the processed `main` baseline.

**Architecture:** Keep bundle upload behind an explicit environment opt-in in the Webpack plugin factory and invoke it only from the existing non-required Codecov job. Pass full GitHub context, capture plugin output, and fail unless Codecov confirms the stable bundle upload.

**Tech Stack:** Node 24, pnpm 11, Webpack 5, `@codecov/webpack-plugin` 2.0.1, GitHub Actions, Codecov YAML, Node test runner.

## Global Constraints

- Processed baseline: Codecov `main` head `f4911e8eeb73b85368741dd0cd810967cde7473e`, state `complete`, coverage 75.08%.
- Bundle name: `kicad-studio-vscode-extension`.
- Plugin version: `@codecov/webpack-plugin` `2.0.1` exactly.
- Bundle upload requires `CODECOV_BUNDLE_ANALYSIS=true` and a non-empty `CODECOV_TOKEN`.
- Plugin telemetry remains disabled.
- Checkout history in the Codecov job uses `fetch-depth: 0`.
- Branch, pull request, SHA, and repository slug are passed explicitly.
- A missing success message or an upload failure message fails the Codecov job.
- Bundle status remains informational with a 5% warning threshold.
- Fork pull requests receive no Codecov secret.
- Codecov remains outside the aggregate `required` job and branch-protection contexts.

---

### Task 1: Change the repository contract from deferral to activation

**Files:**

- Modify: `scripts/check-codecov-policy.test.mjs`
- Modify: `scripts/check-codecov-policy.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: existing `validateCodecovPolicy(repoRoot?: string): string[]`.
- Produces: policy errors for missing or drifting bundle configuration and a root `check:codecov` command that includes the focused Webpack test.

- [ ] **Step 1: Write failing policy tests**

Add fixture assertions that require the exact plugin dependency, `bundle_analysis` YAML, full checkout history, explicit context variables, the stable bundle name, telemetry disablement, and fail-closed success/failure log checks. Change the deferral test into an activation contract.

- [ ] **Step 2: Run the focused policy test and verify RED**

Run: `corepack pnpm run check:codecov`

Expected: FAIL because the plugin dependency, Webpack integration, YAML, and CI bundle step do not exist.

- [ ] **Step 3: Implement the minimal policy validator changes**

Read `apps/vscode-extension/webpack.config.js` in the validator, require the exact new strings, and update `check:codecov` to execute `apps/vscode-extension/scripts/webpack-config-codecov.test.mjs`.

- [ ] **Step 4: Keep the policy test red until production configuration is added**

Run: `corepack pnpm run check:codecov`

Expected: FAIL with only missing production bundle configuration errors.

- [ ] **Step 5: Commit the contract**

```bash
git add scripts/check-codecov-policy.mjs scripts/check-codecov-policy.test.mjs package.json
git commit -s -m "test(repo): require Codecov bundle analysis (#514)"
```

### Task 2: Add opt-in Webpack bundle instrumentation

**Files:**

- Create: `apps/vscode-extension/scripts/webpack-config-codecov.test.mjs`
- Modify: `apps/vscode-extension/webpack.config.js`
- Modify: `apps/vscode-extension/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces: `createWebpackConfig.createPlugins(environment)` returning the normal plugin list plus one Codecov plugin only for explicit token-backed opt-in.

- [ ] **Step 1: Write the failing Webpack tests**

Test normal environment, explicit token-backed environment with branch/PR/SHA/slug, and opt-in without a token. Assert that the Codecov plugin appears exactly once only in the explicit valid case.

- [ ] **Step 2: Run the focused Webpack test and verify RED**

Run: `node --test apps/vscode-extension/scripts/webpack-config-codecov.test.mjs`

Expected: FAIL because `createPlugins` and the Codecov dependency do not exist.

- [ ] **Step 3: Pin the plugin and implement the minimal factory**

Add `@codecov/webpack-plugin: 2.0.1`, preserve the AWS ignore plugin, and configure `enableBundleAnalysis`, stable bundle name, upload token, GitHub service, explicit overrides, and `telemetry: false`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test apps/vscode-extension/scripts/webpack-config-codecov.test.mjs`

Expected: 3 tests pass.

Run: `corepack pnpm run check:codecov`

Expected: workflow/YAML checks may still fail; Webpack and dependency checks pass.

- [ ] **Step 5: Commit the plugin boundary**

```bash
git add apps/vscode-extension/scripts/webpack-config-codecov.test.mjs apps/vscode-extension/webpack.config.js apps/vscode-extension/package.json pnpm-lock.yaml
git commit -s -m "ci(repo): add opt-in Codecov bundle plugin (#514)"
```

### Task 3: Add fail-closed CI and informational Codecov policy

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `codecov.yml`

**Interfaces:**

- Consumes: Webpack `createPlugins` environment contract.
- Produces: one dedicated bundle build that exits non-zero without Codecov upload confirmation.

- [ ] **Step 1: Add the dedicated bundle build step**

Set `fetch-depth: 0`, explicit branch/PR/SHA/slug variables, `CODECOV_BUNDLE_ANALYSIS=true`, and `CODECOV_TOKEN`. Capture build output with `tee` and `set -o pipefail`.

- [ ] **Step 2: Enforce positive and negative log checks**

Fail on `Failed to get pre-signed URL` or `Failed to upload stats`; separately fail when `Successfully uploaded stats for bundle: kicad-studio-vscode-extension` is absent.

- [ ] **Step 3: Add informational YAML settings**

Add `bundle_analysis.warning_threshold: "5%"` and `bundle_analysis.status: informational`.

- [ ] **Step 4: Run policy and official YAML validation**

Run: `corepack pnpm run check:codecov`

Expected: all policy and Webpack tests pass.

Run: `curl --fail-with-body --data-binary @codecov.yml https://codecov.io/validate`

Expected: response contains `Valid!`.

- [ ] **Step 5: Commit CI configuration**

```bash
git add .github/workflows/ci.yml codecov.yml
git commit -s -m "ci(repo): fail closed on Codecov bundle uploads (#514)"
```

### Task 4: Document activated ownership and verification

**Files:**

- Modify: `docs/testing-strategy.md`
- Modify: `docs/superpowers/specs/2026-07-21-issue-514-codecov-bundle-analysis-design.md`
- Modify: `docs/superpowers/plans/2026-07-21-issue-514-codecov-bundle-analysis.md`

- [ ] **Step 1: Replace deferral wording**

Document the dedicated job, stable bundle name, fail-closed log contract, normal-build exclusion, and informational threshold.

- [ ] **Step 2: Run documentation and policy checks**

Run: `corepack pnpm run docs:lint && corepack pnpm run docs:links && corepack pnpm run check:codecov`

Expected: all commands exit 0.

- [ ] **Step 3: Commit documentation**

```bash
git add docs/testing-strategy.md docs/superpowers/specs/2026-07-21-issue-514-codecov-bundle-analysis-design.md docs/superpowers/plans/2026-07-21-issue-514-codecov-bundle-analysis.md
git commit -s -m "docs(repo): document Codecov bundle analysis (#514)"
```

### Task 5: Verify locally and prove the live upload

- [ ] **Step 1: Run deterministic local validation**

Run frozen install, supply-chain, policy, format, lint, typecheck, normal production build with all bundle variables unset, package validation, release/version, docs, and audit checks.

Expected: all commands exit 0; normal build output contains no `[codecov]` upload lines.

- [ ] **Step 2: Push and open the pull request**

Open a PR closing #514. Keep Codecov outside `required` while requiring its own job to pass before merge.

- [ ] **Step 3: Inspect live Codecov logs**

Require the GitHub Actions log to contain `Successfully uploaded stats for bundle: kicad-studio-vscode-extension` and no pre-signed URL or stats-upload failure.

- [ ] **Step 4: Verify Codecov product state**

Confirm the bundle appears in Codecov and the pull request receives an informational bundle comparison/status.

- [ ] **Step 5: Review all automation feedback**

Inspect SonarQube Cloud, CodeQL, Snyk, Aikido, Socket, DeepScan, Codecov, and review threads. Resolve every valid blocking finding before merge.
