# Codecov Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add non-blocking Codecov coverage, failed-test analytics, and opt-in production bundle analysis for the VS Code extension.

**Architecture:** Reuse the canonical Ubuntu Jest reports from the existing matrix, upload them from one same-repository-only Codecov job, and enable the Webpack bundle plugin only in that job. Keep Jest thresholds and the aggregate `required` check unchanged.

**Tech Stack:** GitHub Actions, pnpm 11, Node 24, Jest 30, jest-junit 17, Webpack 5, @codecov/webpack-plugin 2.0.1, Codecov Action v7.0.0, Codecov Test Results Action v1.2.1, YAML.

## Global Constraints

- Codecov statuses remain informational during initial baseline establishment.
- Codecov is not added to `.github/rulesets/main.json` or the aggregate `required` job.
- Fork pull requests receive no Codecov secret and run no token-backed upload or bundle analysis.
- Coverage source: `apps/vscode-extension/coverage/lcov.info`.
- Test-results source: `apps/vscode-extension/test-results/junit.xml`.
- Bundle name: `kicad-studio-vscode-extension`.
- Bundle plugin telemetry: `false`.
- Codecov CLI version: `v11.3.1`.
- All GitHub Actions are pinned to immutable commit SHAs.

---

### Task 1: Repository policy contract

**Files:**

- Create: `scripts/check-codecov-policy.mjs`
- Create: `scripts/check-codecov-policy.test.mjs`
- Modify: `package.json`

**Interfaces:**

- Produces: `validateCodecovPolicy(repoRoot?: string): string[]`.
- Produces: root command `check:codecov`.

- [ ] Write tests that expect exact action SHAs, report paths, fork guards, informational YAML, conditional bundle configuration, and root script composition.
- [ ] Run `node --test scripts/check-codecov-policy.test.mjs`; expect failures for missing Codecov files and dependencies.
- [ ] Implement the validator and root script wiring.
- [ ] Run `corepack pnpm run check:codecov`; expect all policy tests to pass.
- [ ] Commit with `test(repo): define Codecov observability policy (#511)`.

### Task 2: Deterministic Jest reports

**Files:**

- Modify: `apps/vscode-extension/jest.config.js`
- Modify: `apps/vscode-extension/package.json`
- Modify: `apps/vscode-extension/.gitignore`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces: CI JUnit report at `apps/vscode-extension/test-results/junit.xml`.
- Preserves: existing LCOV and coverage threshold behavior.

- [ ] Add `jest-junit` 17.0.0 and a failing policy assertion for the dependency and deterministic output path.
- [ ] Run the policy test and verify the dependency/report assertions fail.
- [ ] Configure the reporter only when `CI` is set and include file attributes plus suite-load errors.
- [ ] Run `CI=true corepack pnpm --filter kicadstudiokit run test:unit:coverage`; expect LCOV, summary JSON, and JUnit XML.
- [ ] Commit with `test(vscode): emit Codecov test reports (#511)`.

### Task 3: Coverage and Test Analytics workflow

**Files:**

- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: Ubuntu LCOV, JSON summary, and JUnit report.
- Produces: Codecov coverage flag `vscode-extension-unit` and Test Analytics result upload.

- [ ] Add a failing policy assertion for the `codecov-reports` artifact and same-repository-only job.
- [ ] Run the policy test and verify workflow assertions fail.
- [ ] Upload reports from Ubuntu with `!cancelled()` and add the non-required `codecov` job with `always()` semantics.
- [ ] Pin Codecov coverage action to `fb8b3582c8e4def4969c97caa2f19720cb33a72f` and Test Results action to `0fa95f0e1eeaafde2c782583b36b28ad0d8c77d3`.
- [ ] Run workflow lint and policy tests; expect success.
- [ ] Commit with `ci(repo): upload Codecov coverage and test analytics (#511)`.

### Task 4: Production bundle analysis

**Files:**

- Modify: `apps/vscode-extension/webpack.config.js`
- Modify: `apps/vscode-extension/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: `CODECOV_BUNDLE_ANALYSIS` and `CODECOV_TOKEN`.
- Produces: Codecov bundle `kicad-studio-vscode-extension` only when both values enable it.

- [ ] Add a failing policy test for `@codecov/webpack-plugin` 2.0.1, two-factor activation, bundle name, and telemetry opt-out.
- [ ] Run the policy test and verify bundle assertions fail.
- [ ] Add the conditional plugin after existing Webpack plugins and set opt-in environment variables only in the Codecov job.
- [ ] Run a normal production build without Codecov variables; expect a successful build with no Codecov upload attempt.
- [ ] Run the configuration-focused test with fake opt-in values; expect the Codecov plugin to be present without executing a build.
- [ ] Commit with `ci(vscode): add opt-in Codecov bundle analysis (#511)`.

### Task 5: Repository YAML and documentation

**Files:**

- Create: `codecov.yml`
- Modify: `docs/testing-strategy.md`
- Modify: `README.md`

**Interfaces:**

- Produces: informational coverage and bundle statuses plus the public Codecov badge.

- [ ] Add a failing policy assertion for informational project/patch status, the extension flag, and informational 5% bundle warning.
- [ ] Run the policy test and verify YAML assertions fail.
- [ ] Add `codecov.yml`, document report ownership and failure semantics, and add the coverage badge.
- [ ] Run `curl --fail-with-body --data-binary @codecov.yml https://codecov.io/validate`; expect HTTP 200.
- [ ] Run docs lint, links, and generated checks.
- [ ] Commit with `docs(repo): document Codecov observability (#511)`.

### Task 6: Final verification and pull request

**Files:**

- Verify all files changed for issue #511.

**Interfaces:**

- Produces: one reviewable pull request closing #511.

- [ ] Run frozen install, `check:codecov`, workflow lint, formatting, Jest coverage, Webpack build, release policy, docs checks, and `git diff --check`.
- [ ] Inspect `git diff origin/main...HEAD` for scope and secret safety.
- [ ] Push the branch and open a PR that closes #511.
- [ ] Wait for required checks to reach terminal state.
- [ ] Inspect Snyk, SonarCloud, CodeQL, Aikido, Socket, Codecov, and agent comments/threads; fix technically valid findings.
- [ ] Merge only after all required checks pass and no blocking bot/agent thread remains.
