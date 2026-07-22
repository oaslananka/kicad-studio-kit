# Targeted Trivy Devcontainer Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fail-closed Trivy misconfiguration gate for `.devcontainer/` without duplicating dependency, vulnerability, license, or secret scanning.

**Architecture:** Extend the existing required `Security / security` job so its status-check name remains stable. A SHA-pinned Trivy action runs the `config` scanner against `.devcontainer/`, writes SARIF, uploads review evidence, and defers the final failure until evidence upload has run. A dedicated repository policy validator locks scan scope, severity, versions, permissions, and non-duplication.

**Tech Stack:** GitHub Actions, Trivy Action v0.36.0 with Trivy v0.72.0, CodeQL SARIF upload, Node.js policy tests, Renovate custom regex management.

## Global Constraints

- Scan only `.devcontainer/` with Trivy's configuration scanner.
- Fail the existing required `security` status on HIGH or CRITICAL misconfigurations.
- Do not enable filesystem vulnerability, dependency, license, or secret scanning.
- Pin all GitHub Actions to immutable commit SHAs.
- Keep Trivy v0.72.0 explicit and Renovate-managed.
- Upload SARIF when available, including when the Trivy scan reports findings.
- Preserve fork safety and the existing required status-check name.

---

### Task 1: Policy contract

**Files:**

- Create: `scripts/check-trivy-devcontainer.mjs`
- Create: `scripts/check-trivy-devcontainer.test.mjs`
- Modify: `package.json`

**Interfaces:**

- Produces: `validateTrivyDevcontainerPolicy(root): string[]`
- Produces: `pnpm run check:trivy-devcontainer`
- Produces: `pnpm run security:trivy-devcontainer`

- [ ] Write failing tests for exact action SHA, embedded Trivy version, config scan type, `.devcontainer` scan reference, HIGH/CRITICAL severity, SARIF upload, deferred fail, fork guard, and absence of vulnerability/secret/license scanners.
- [ ] Run `node --test scripts/check-trivy-devcontainer.test.mjs` and confirm the repository contract fails because the workflow and scripts do not exist.
- [ ] Implement the minimal validator and package-script wiring.
- [ ] Re-run the focused tests and keep failures limited to the not-yet-added workflow contract.
- [ ] Commit the policy contract.

### Task 2: Required security job integration

**Files:**

- Modify: `.github/workflows/security.yml`
- Modify: `renovate.json`

**Interfaces:**

- Consumes: `validateTrivyDevcontainerPolicy(root)`
- Produces: SARIF file `trivy-devcontainer.sarif`
- Produces: code-scanning category `trivy-devcontainer`

- [ ] Add a failing workflow-fixture test proving missing SARIF upload, wrong scope, wrong severity, or direct early failure is rejected.
- [ ] Add `security-events: write` only to the existing `security` job.
- [ ] Add SHA-pinned `aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25` with `scan-type: config`, `scan-ref: .devcontainer`, `version: v0.72.0`, `limit-severities-for-sarif: true`, `severity: HIGH,CRITICAL`, `exit-code: 1`, and `continue-on-error: true`.
- [ ] Upload SARIF through the existing SHA-pinned CodeQL action only when a report exists and the token is allowed to write.
- [ ] Upload the SARIF as a retained artifact, then fail the job when the Trivy step outcome is failure.
- [ ] Add a Renovate custom regex manager for the explicit Trivy version.
- [ ] Run policy tests, actionlint, and zizmor; fix every actionable finding.
- [ ] Commit the workflow integration.

### Task 3: Local command and documentation

**Files:**

- Modify: `docs/security.md`
- Modify: `apps/vscode-extension/Taskfile.yml`

**Interfaces:**

- Consumes: `pnpm run security:trivy-devcontainer`
- Produces: documented ownership boundary for Trivy versus CodeQL, pnpm audit, dependency review, Snyk, Gitleaks, and push protection.

- [ ] Add policy-test assertions that the documented command and non-duplication statement cannot disappear.
- [ ] Add the root Trivy command to `security:local` without widening its target beyond `.devcontainer/`.
- [ ] Document the blocking threshold, SARIF category, weekly/manual execution inherited from `Security`, and scanner ownership boundaries.
- [ ] Run docs lint/links and policy tests.
- [ ] Commit the local and documentation surface.

### Task 4: Live validation and integration

**Files:**

- No production files unless validation reveals a defect.

- [ ] Download Trivy v0.72.0 from the official release and verify its published checksum.
- [ ] Run `trivy config --severity HIGH,CRITICAL --exit-code 1 .devcontainer` locally and record the exact findings.
- [ ] Run frozen install, root policy checks, actionlint, zizmor, docs checks, and the complete repository validation gate.
- [ ] Push through the normal pre-push hook.
- [ ] Open a PR closing #512 and inspect every GitHub Actions, CodeQL, Codecov, Sonar, Snyk, DeepScan, Socket, Aikido, Opire, and review-thread result.
- [ ] Resolve actionable findings, merge only after terminal required checks, and verify the signed merge commit and `main` security run.
