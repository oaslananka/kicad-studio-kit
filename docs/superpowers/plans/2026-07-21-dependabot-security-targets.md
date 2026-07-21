# Dependabot Security Targets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stale post-split Dependabot security-update target with explicit active npm and GitHub Actions roots while keeping Renovate as the routine version-update owner.

**Architecture:** Store the security-only Dependabot contract in `.github/dependabot.yml`. Add a repository validator that parses the configuration, rejects removed uv/MCP targets and nonzero version-update limits, and composes into the existing root check. Document the ownership split in the security model.

**Tech Stack:** GitHub Dependabot configuration v2, Node.js 24, YAML parser, `node:test`, pnpm 11.

## Global Constraints

- Routine dependency version updates remain owned by Renovate.
- Dependabot entries use `open-pull-requests-limit: 0` so configuration applies to security updates without creating duplicate routine version-update PRs.
- Active Dependabot ecosystems are exactly `npm` and `github-actions`, both rooted at `/`.
- No `uv`, Python, `/packages/mcp-server`, or other retired MCP source target may be present.
- Existing security labels and the `oaslananka` assignee are used for security-update pull requests.
- All commits include DCO sign-off.

---

### Task 1: Add a failing Dependabot policy contract

**Files:**

- Create: `scripts/check-dependabot-policy.mjs`
- Create: `scripts/check-dependabot-policy.test.mjs`

**Interfaces:**

- Produces: `validateDependabotPolicy(root?: string): string[]`

- [ ] **Step 1: Write tests for the accepted active-root configuration and rejected stale targets**
- [ ] **Step 2: Run `node --test scripts/check-dependabot-policy.test.mjs` and verify failure because the production configuration and validator are absent**
- [ ] **Step 3: Implement the minimal YAML-based validator**
- [ ] **Step 4: Run the focused tests and verify all cases pass**
- [ ] **Step 5: Commit the policy contract with DCO sign-off**

### Task 2: Configure security-only Dependabot targets

**Files:**

- Create: `.github/dependabot.yml`
- Modify: `package.json`

**Interfaces:**

- Consumes: `validateDependabotPolicy()` from Task 1.
- Produces: root script `check:dependabot-policy` composed into `pnpm run check`.

- [ ] **Step 1: Add a test requiring exact npm and GitHub Actions entries at `/`, zero version-update limits, security groups, labels, and assignee**
- [ ] **Step 2: Run the focused test and verify it fails against the missing configuration**
- [ ] **Step 3: Add `.github/dependabot.yml` and root script wiring**
- [ ] **Step 4: Run focused policy, YAML, formatting, and root policy checks**
- [ ] **Step 5: Commit the configuration with DCO sign-off**

### Task 3: Document dependency-update ownership

**Files:**

- Modify: `docs/security.md`
- Modify: `docs/dependency-lifecycle.md`

**Interfaces:**

- Documents: Renovate routine updates; Dependabot security-only active roots; removed MCP/uv ownership.

- [ ] **Step 1: Extend the policy test to require the ownership statement in both security documents**
- [ ] **Step 2: Run the test and verify documentation drift failure**
- [ ] **Step 3: Add the ownership and stale-target guidance**
- [ ] **Step 4: Run policy tests, docs lint, docs links, and generated docs checks**
- [ ] **Step 5: Commit documentation with DCO sign-off**

### Task 4: Verify, review, and integrate

**Files:**

- Verify all changed files.

- [ ] **Step 1: Run frozen install and the complete root `pnpm run check` in the validation host**
- [ ] **Step 2: Run `pnpm audit --audit-level high` and check the Dependabot YAML syntax**
- [ ] **Step 3: Push the branch and open a PR closing #520**
- [ ] **Step 4: Inspect all bot/agent comments, reviews, unresolved threads, and terminal CI results; fix every actionable finding**
- [ ] **Step 5: Squash merge only after required checks are green, then verify the signed main commit and default-branch workflows**
