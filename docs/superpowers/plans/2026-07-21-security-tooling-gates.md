# Security Tooling Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic pre-commit, actionlint, zizmor, and repository-owned Semgrep gates without duplicating CodeQL, Gitleaks, or dependency scanners.

**Architecture:** Keep CodeQL as the broad SAST authority and GitHub push protection plus Gitleaks as the secret-scanning authority. Add a single root policy contract that pins tool versions and validates workflow/config wiring; run native actionlint, high-confidence zizmor, and narrow local Semgrep rules inside the existing required `security` job. Keep expensive scans out of the Git pre-commit hook while exposing explicit local commands.

**Tech Stack:** Node.js 24 policy tests, GitHub Actions, actionlint 1.7.12, zizmor 1.28.0, Semgrep 1.170.0, pre-commit 4.6.0 with pre-commit-hooks v6.0.0.

## Global Constraints

- CodeQL remains the primary broad SAST engine.
- Semgrep is limited to repository-owned rules for shell execution, dynamic code evaluation, and sensitive-value logging.
- GitHub push protection plus Gitleaks remain the secret-scanning authorities.
- The required `security` check remains the blocking aggregate for these new scanners.
- Every GitHub Action remains pinned to a full commit SHA.
- Pre-commit remains fast and does not run builds, full tests, CodeQL, or broad SAST.
- Generated KiCanvas assets, build outputs, coverage, and fixtures are excluded from Semgrep targeting.

---

### Task 1: Security Tooling Policy Contract

**Files:**

- Create: `scripts/check-security-tooling.mjs`
- Create: `scripts/check-security-tooling.test.mjs`
- Modify: `package.json`

**Interfaces:**

- Produces: `validateSecurityTooling(root): string[]`, returning deterministic policy errors.
- Produces: root commands `check:security-tooling`, `security:workflows`, `security:semgrep`, and `test:semgrep-rules`.

- [ ] **Step 1: Write failing policy tests**

Create fixtures copied from the repository and assert that the validator rejects missing exact versions, missing workflow invocations, Semgrep registry/broad configs, duplicate secret scanners, and root-check drift.

- [ ] **Step 2: Verify the tests fail**

Run: `node --test scripts/check-security-tooling.test.mjs`

Expected: FAIL because `check-security-tooling.mjs` and the root scripts do not exist.

- [ ] **Step 3: Implement the minimal validator and script wiring**

Pin these command forms exactly:

```json
{
  "check:security-tooling": "node scripts/check-security-tooling.mjs && node --test scripts/check-security-tooling.test.mjs",
  "security:workflows": "actionlint -config-file .github/actionlint.yaml && uvx --from zizmor==1.28.0 zizmor --config .github/zizmor.yml --offline --strict-collection --format plain --min-severity medium --min-confidence high .",
  "security:semgrep": "uvx --from semgrep==1.170.0 semgrep scan --config .semgrep/semgrep.yml --error --metrics=off apps/vscode-extension/src apps/vscode-extension/scripts packages scripts",
  "test:semgrep-rules": "uvx --from semgrep==1.170.0 semgrep --metrics=off --test --config .semgrep/semgrep.yml .semgrep/semgrep.ts"
}
```

Compose only `check:security-tooling` into the root `check`; scanner commands remain explicit/manual and CI-owned.

- [ ] **Step 4: Verify policy tests pass**

Run: `corepack pnpm run check:security-tooling`

Expected: PASS after Tasks 2–4 complete the referenced configuration.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-security-tooling.mjs scripts/check-security-tooling.test.mjs package.json
git commit -m "test(repo): define security tooling contract (#508)"
```

### Task 2: Deterministic Workflow Security Gate

**Files:**

- Create: `.github/zizmor.yml`
- Modify: `.github/workflows/security.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/cross-repo-compatibility.yml`

**Interfaces:**

- Consumes: root commands from Task 1.
- Produces: native actionlint and high-confidence zizmor execution in the existing `security` job.

- [ ] **Step 1: Add failing policy assertions for CI wiring**

Assert that `security.yml` installs actionlint 1.7.12 from the immutable Linux archive with SHA-256 `8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8`, then runs `check:security-tooling`, `security:workflows`, `test:semgrep-rules`, and `security:semgrep`.

- [ ] **Step 2: Verify failures identify missing workflow steps**

Run: `node --test scripts/check-security-tooling.test.mjs`

Expected: FAIL with missing actionlint/zizmor/Semgrep workflow wiring.

- [ ] **Step 3: Fix existing actionlint and zizmor findings**

Use a grouped redirect to quoted `"$GITHUB_STEP_SUMMARY"`, express the required-job condition as a valid folded expression without literal text around `${{ }}`, and set `persist-credentials: false` on the cross-repository checkout.

- [ ] **Step 4: Add the CI scanner steps**

Install actionlint into `$RUNNER_TEMP/bin`, verify its checksum before execution, add that directory to `$GITHUB_PATH`, and invoke the root scanner commands from the existing required `security` job.

- [ ] **Step 5: Verify workflow scanners**

Run:

```bash
actionlint -config-file .github/actionlint.yaml
uvx --from zizmor==1.28.0 zizmor --config .github/zizmor.yml --offline --strict-collection --format plain --min-severity medium --min-confidence high .
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add .github/zizmor.yml .github/workflows/security.yml .github/workflows/ci.yml .github/workflows/cross-repo-compatibility.yml scripts/check-security-tooling.test.mjs
git commit -m "ci(repo): add workflow security scanners (#508)"
```

### Task 3: Repository-Owned Semgrep Rules

**Files:**

- Create: `.semgrep/semgrep.yml`
- Create: `.semgrepignore`
- Create: `.semgrep/semgrep.ts`
- Modify: `scripts/check-security-tooling.test.mjs`

**Interfaces:**

- Produces rule IDs `kicad.no-node-shell-exec`, `kicad.no-dynamic-code-evaluation`, and `kicad.no-sensitive-console-logging`.

- [ ] **Step 1: Write positive and negative Semgrep fixtures**

Mark unsafe `child_process.exec`/`execSync`, `eval`/`new Function`, and logging of variables named like token/secret/password/authorization/cookie/credential with `ruleid:` comments. Mark safe `spawn` with argument arrays, JSON parsing, and ordinary logging with `ok:` comments.

- [ ] **Step 2: Verify rule tests fail before rules exist**

Run: `uvx --from semgrep==1.170.0 semgrep --metrics=off --test --config .semgrep/semgrep.yml .semgrep/semgrep.ts`

Expected: FAIL because expected rule IDs do not exist.

- [ ] **Step 3: Implement minimal custom rules and exclusions**

Target JavaScript/TypeScript only. Exclude generated assets, `dist`, `out`, coverage, node_modules, test fixtures, and vendored KiCanvas content. Do not reference `p/default`, `p/security-audit`, Semgrep Registry URLs, secret rules, or dependency rules.

- [ ] **Step 4: Verify fixture and repository scans**

Run:

```bash
uvx --from semgrep==1.170.0 semgrep --metrics=off --test --config .semgrep/semgrep.yml .semgrep/semgrep.ts
uvx --from semgrep==1.170.0 semgrep scan --config .semgrep/semgrep.yml --error --metrics=off apps/vscode-extension/src apps/vscode-extension/scripts packages scripts
```

Expected: fixture tests pass and the repository scan reports zero findings.

- [ ] **Step 5: Commit**

```bash
git add .semgrep scripts/check-security-tooling.test.mjs
git commit -m "ci(repo): add custom Semgrep invariants (#508)"
```

### Task 4: Fast Pre-commit and Local Security Commands

**Files:**

- Modify: `.pre-commit-config.yaml`
- Modify: `.gitignore`
- Modify: `README.md`
- Modify: `docs/board-ready-ops.md`
- Modify: `apps/vscode-extension/scripts/local-security.sh`
- Modify: `apps/vscode-extension/scripts/local-security.ps1`
- Modify: `apps/vscode-extension/Taskfile.yml`
- Modify: `docs/security.md`
- Modify: `docs/testing-strategy.md`
- Modify: `scripts/check-security-tooling.test.mjs`

**Interfaces:**

- Consumes: root scanner commands from Task 1.
- Produces: a fast manual `pre-commit run --all-files` lane and documented heavy local scanner lane.

- [ ] **Step 1: Add failing policy assertions for hook coverage**

Require `mixed-line-ending --fix=no`, `check-toml`, `check-case-conflict`, `check-illegal-windows-names`, `check-symlinks`, and the existing whitespace/YAML/JSON/merge/large-file/private-key hooks under pre-commit-hooks v6.0.0.

- [ ] **Step 2: Verify the new hook requirements fail**

Run: `node --test scripts/check-security-tooling.test.mjs`

Expected: FAIL listing the absent hooks.

- [ ] **Step 3: Expand pre-commit and clean existing hook drift**

Add the required fast hooks. Accept only the deterministic whitespace/newline corrections produced by pre-commit in `.gitignore`, `README.md`, and `docs/board-ready-ops.md`.

- [ ] **Step 4: Align local scripts and documentation**

Run audit and Gitleaks as before, then invoke repository-root `security:workflows`, `test:semgrep-rules`, and `security:semgrep`; retain extension bundle-size validation. Document scanner ownership and exact local commands.

- [ ] **Step 5: Verify complete security tooling**

Run:

```bash
uvx --from pre-commit==4.6.0 pre-commit run --all-files
actionlint -config-file .github/actionlint.yaml
uvx --from zizmor==1.28.0 zizmor --config .github/zizmor.yml --offline --strict-collection --format plain --min-severity medium --min-confidence high .
uvx --from semgrep==1.170.0 semgrep --metrics=off --test --config .semgrep/semgrep.yml .semgrep/semgrep.ts
uvx --from semgrep==1.170.0 semgrep scan --config .semgrep/semgrep.yml --error --metrics=off apps/vscode-extension/src apps/vscode-extension/scripts packages scripts
corepack pnpm run check:security-tooling
corepack pnpm --filter kicadstudiokit run test:security
```

Expected: all commands exit 0.

- [ ] **Step 6: Run repository regression gates**

Run frozen install, format, lint, typecheck, CI lane policy, branch-protection policy, docs checks, package validation, and `pnpm audit --audit-level high` in the rootless validation host.

- [ ] **Step 7: Commit**

```bash
git add .pre-commit-config.yaml .gitignore README.md docs/board-ready-ops.md apps/vscode-extension/Taskfile.yml apps/vscode-extension/scripts/local-security.sh apps/vscode-extension/scripts/local-security.ps1 docs/security.md docs/testing-strategy.md scripts/check-security-tooling.test.mjs
git commit -m "chore(repo): align local security gates (#508)"
```
