# Workspace Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, non-mutating Git workspace health check and complete the canonical validation-host recovery tracked by #525.

**Architecture:** A focused Node.js CLI will collect Git state through an injectable command runner, evaluate general and canonical workspace invariants, and emit human or JSON reports. Validation-host package scripts and contract tests will wire the check without requiring PR branches to be on `main`. The public runbook will describe safe recovery while operational backups remain private on the host.

**Tech Stack:** Node.js 24 standard library, Git CLI, `node:test`, pnpm 11, Markdown.

## Global Constraints

- The checker must never fetch, reset, prune, delete, or edit Git configuration.
- Default mode must work in ordinary branches and linked worktrees.
- `--canonical` must require a normal checkout on `main` with `HEAD == origin/main`.
- Public documentation must not include credentials, private host inventory, or machine-specific absolute paths.
- Tests must be written and observed failing before implementation.
- A normal push must run repository hooks without `HUSKY=0`.
- Bot and agent findings must be reviewed before merge.

---

### Task 1: Define workspace integrity behavior with failing tests

**Files:**

- Create: `scripts/check-workspace-integrity.test.mjs`
- Create: `scripts/check-workspace-integrity.mjs`

**Interfaces:**

- Produces: `parseWorktreePorcelain(text: string): Array<object>`
- Produces: `evaluateWorkspaceState(state: object, options?: { canonical?: boolean }): object`
- Produces: `inspectWorkspace(repoRoot: string, options?: object): object`
- Produces: `formatWorkspaceReport(report: object): string`

- [ ] **Step 1: Create a test file that imports the planned interfaces and asserts the invalid bare/worktree combination is rejected**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateWorkspaceState,
  parseWorktreePorcelain,
} from "./check-workspace-integrity.mjs";

test("rejects a bare repository with an explicit worktree (#525)", () => {
  const report = evaluateWorkspaceState({
    insideWorkTree: false,
    bare: true,
    coreWorktree: "/tmp/other-worktree",
    topLevel: "",
    gitDir: "/repo/.git",
    commonDir: "/repo/.git",
    branch: "main",
    head: "abc",
    originMain: "abc",
    statusOk: false,
    statusStderr: "core.bare and core.worktree do not make sense",
    worktrees: [],
  });
  assert.equal(report.ok, false);
  assert.match(report.errors.join("\n"), /core\.bare.*core\.worktree/u);
});
```

- [ ] **Step 2: Add tests for canonical linked-worktree rejection, stale default branch state, and prunable entries**

```js
test("canonical mode rejects linked worktrees and stale main", () => {
  const report = evaluateWorkspaceState(
    {
      insideWorkTree: true,
      bare: false,
      coreWorktree: "",
      topLevel: "/repo/worktree",
      gitDir: "/repo/.git/worktrees/task",
      commonDir: "/repo/.git",
      branch: "feature/task",
      head: "old",
      originMain: "new",
      statusOk: true,
      statusStderr: "",
      worktrees: [],
    },
    { canonical: true },
  );
  assert.equal(report.ok, false);
  assert.match(report.errors.join("\n"), /linked worktree/u);
  assert.match(report.errors.join("\n"), /branch must be main/u);
  assert.match(report.errors.join("\n"), /does not match origin\/main/u);
});

test("parses and rejects prunable worktree records", () => {
  const worktrees = parseWorktreePorcelain(
    "worktree /repo\nHEAD abc\nbranch refs/heads/main\n\nworktree /gone\nHEAD def\nprunable gitdir file points to non-existent location\n",
  );
  const report = evaluateWorkspaceState({
    insideWorkTree: true,
    bare: false,
    coreWorktree: "",
    topLevel: "/repo",
    gitDir: "/repo/.git",
    commonDir: "/repo/.git",
    branch: "main",
    head: "abc",
    originMain: "abc",
    statusOk: true,
    statusStderr: "",
    worktrees,
  });
  assert.equal(report.ok, false);
  assert.match(report.errors.join("\n"), /prunable worktree/u);
});
```

- [ ] **Step 3: Run the tests and verify RED**

Run:

```bash
bash scripts/run-validation-host.sh node --test scripts/check-workspace-integrity.test.mjs
```

Expected: FAIL because the module or exported functions do not exist.

- [ ] **Step 4: Commit the failing tests**

```bash
git add scripts/check-workspace-integrity.test.mjs
git commit -m "test(repo): define workspace integrity invariants"
```

---

### Task 2: Implement the non-mutating workspace checker

**Files:**

- Create: `scripts/check-workspace-integrity.mjs`
- Test: `scripts/check-workspace-integrity.test.mjs`

**Interfaces:**

- Consumes the interfaces defined by Task 1.
- Produces CLI flags `--canonical` and `--json`.

- [ ] **Step 1: Implement porcelain parsing and invariant evaluation**

```js
export function parseWorktreePorcelain(text) {
  return String(text)
    .trim()
    .split(/\n\s*\n/u)
    .filter(Boolean)
    .map((record) => {
      const parsed = {};
      for (const line of record.split(/\r?\n/u)) {
        const [key, ...rest] = line.split(" ");
        parsed[key] = rest.join(" ");
      }
      return parsed;
    });
}

export function evaluateWorkspaceState(state, options = {}) {
  const errors = [];
  if (state.bare && state.coreWorktree) {
    errors.push("core.bare and core.worktree must not be configured together");
  }
  if (!state.insideWorkTree || state.bare || !state.statusOk) {
    errors.push("repository root is not a usable working tree");
  }
  for (const worktree of state.worktrees) {
    if (worktree.prunable)
      errors.push(`prunable worktree: ${worktree.worktree}`);
  }
  if (options.canonical) {
    if (state.gitDir !== state.commonDir)
      errors.push("canonical checkout must not be a linked worktree");
    if (state.coreWorktree)
      errors.push("canonical checkout must not configure core.worktree");
    if (state.branch !== "main") errors.push("canonical branch must be main");
    if (!state.originMain || state.head !== state.originMain)
      errors.push("HEAD does not match origin/main");
  }
  return {
    ok: errors.length === 0,
    canonical: Boolean(options.canonical),
    errors,
    state,
  };
}
```

- [ ] **Step 2: Implement Git collection through `spawnSync` and an injectable runner**

The collector must run `git rev-parse`, `git config`, `git status`, `git branch`, and `git worktree list --porcelain`; status code `1` from `git config --get core.worktree` means unset and is not an error.

- [ ] **Step 3: Implement human and JSON CLI output**

Human success output must include `Workspace integrity: pass`; failure output must list each invariant and set exit code `1`.

- [ ] **Step 4: Run the focused tests and verify GREEN**

```bash
bash scripts/run-validation-host.sh node --test scripts/check-workspace-integrity.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Add a temporary-repository integration test**

Create a temporary Git repository, configure user identity, create `main`, commit one file, create `refs/remotes/origin/main`, and assert `inspectWorkspace(temp, { canonical: true })` passes.

- [ ] **Step 6: Run all workspace checker tests**

```bash
bash scripts/run-validation-host.sh node --test scripts/check-workspace-integrity.test.mjs
```

Expected: PASS with no warnings.

- [ ] **Step 7: Commit implementation**

```bash
git add scripts/check-workspace-integrity.mjs scripts/check-workspace-integrity.test.mjs
git commit -m "feat(repo): add workspace integrity doctor"
```

---

### Task 3: Wire the checker into validation-host contracts

**Files:**

- Modify: `package.json`
- Modify: `scripts/check-validation-host.mjs`
- Modify: `scripts/check-validation-host.test.mjs`

**Interfaces:**

- Produces package script `validation-host:workspace`.
- Changes `validation-host:doctor` to run workspace integrity first.

- [ ] **Step 1: Add failing contract assertions**

Assert these exact scripts:

```json
{
  "validation-host:workspace": "bash scripts/run-validation-host.sh node scripts/check-workspace-integrity.mjs --canonical",
  "validation-host:doctor": "corepack pnpm run validation-host:workspace && bash scripts/run-validation-host.sh node scripts/dev-doctor.mjs --ci --strict"
}
```

Also assert the checker and its test file exist and that `check:validation-host` runs `node --test scripts/check-workspace-integrity.test.mjs`.

- [ ] **Step 2: Run the contract test and verify RED**

```bash
bash scripts/run-validation-host.sh node --test scripts/check-validation-host.test.mjs
```

Expected: FAIL because the package scripts and contract requirements are not wired.

- [ ] **Step 3: Update package scripts and validation-host contract implementation**

Set:

```json
{
  "validation-host:workspace": "bash scripts/run-validation-host.sh node scripts/check-workspace-integrity.mjs --canonical",
  "validation-host:doctor": "corepack pnpm run validation-host:workspace && bash scripts/run-validation-host.sh node scripts/dev-doctor.mjs --ci --strict",
  "check:validation-host": "node scripts/check-validation-host.mjs && node --test scripts/check-validation-host.test.mjs scripts/check-workspace-integrity.test.mjs"
}
```

- [ ] **Step 4: Run focused contract and checker tests**

```bash
bash scripts/run-validation-host.sh corepack pnpm run check:validation-host
```

Expected: PASS.

- [ ] **Step 5: Commit integration**

```bash
git add package.json scripts/check-validation-host.mjs scripts/check-validation-host.test.mjs
git commit -m "ci(repo): gate validation host workspace integrity"
```

---

### Task 4: Document canonical topology, recovery, and rollback

**Files:**

- Modify: `docs/validation-host.md`
- Modify: `scripts/check-validation-host.mjs`
- Test: `scripts/check-validation-host.test.mjs`

- [ ] **Step 1: Add a failing documentation-contract assertion**

Require these public phrases in `docs/validation-host.md`:

- `validation-host:workspace`
- `git worktree list --porcelain`
- `core.bare`
- `core.worktree`
- `private backup`
- `fast-forward`
- `rollback`

- [ ] **Step 2: Run the contract test and verify RED**

```bash
bash scripts/run-validation-host.sh node --test scripts/check-validation-host.test.mjs
```

Expected: FAIL because the runbook is incomplete.

- [ ] **Step 3: Add the documented topology and non-destructive procedure**

Document that the supported canonical topology is a normal non-bare checkout on `main`, while task work occurs in linked worktrees. Require private backups, clean-status checks, PR association before removal, `git worktree prune` only after inventory, fast-forward synchronization, the workspace checker, full validation, and rollback from the private config backup.

- [ ] **Step 4: Run documentation and validation-host checks**

```bash
bash scripts/run-validation-host.sh corepack pnpm run check:validation-host
bash scripts/run-validation-host.sh corepack pnpm run check:docs-site
```

Expected: PASS.

- [ ] **Step 5: Commit documentation**

```bash
git add docs/validation-host.md scripts/check-validation-host.mjs scripts/check-validation-host.test.mjs
git commit -m "docs(repo): add validation workspace recovery runbook"
```

---

### Task 5: Verify host recovery and repository-wide behavior

**Files:**

- No public source changes expected.

- [ ] **Step 1: Verify the repaired canonical host**

```bash
git status --short --branch
git rev-parse HEAD refs/remotes/origin/main
git worktree list --porcelain
corepack pnpm run validation-host:workspace
```

Expected: clean `main`, equal revisions, only expected worktrees, workspace integrity pass.

- [ ] **Step 2: Run formatting and focused tests**

```bash
bash scripts/run-validation-host.sh corepack pnpm exec prettier --check scripts/check-workspace-integrity.mjs scripts/check-workspace-integrity.test.mjs scripts/check-validation-host.mjs scripts/check-validation-host.test.mjs docs/validation-host.md docs/superpowers/specs/2026-07-22-issue-525-workspace-integrity-design.md docs/superpowers/plans/2026-07-22-issue-525-workspace-integrity.md
bash scripts/run-validation-host.sh corepack pnpm run check:validation-host
```

Expected: PASS.

- [ ] **Step 3: Run the complete pinned validation-host check**

```bash
bash scripts/run-validation-host.sh corepack pnpm run check
```

Expected: PASS.

- [ ] **Step 4: Verify hook environment selection and push normally**

The pre-push hook must prefer `scripts/run-validation-host.sh` when the pinned
host is bootstrapped and fall back to `corepack pnpm run check` elsewhere.
Neither path may use `HUSKY=0`.

```bash
git push --set-upstream origin fix/525-workspace-integrity
```

Expected: the pinned environment is selected on the validation host and the
push succeeds through the complete Husky check without bypasses.

- [ ] **Step 5: Open a pull request referencing #525**

The PR body must summarize the operational recovery separately from public source changes, list validation evidence, state that no credentials or host-specific paths were committed, and include `Closes #525`.

- [ ] **Step 6: Inspect all bot and agent comments before merge**

Review checks, issue comments, PR reviews, and inline comments. A quota or unavailable-review message is not review evidence; perform a manual compensating review when needed.
