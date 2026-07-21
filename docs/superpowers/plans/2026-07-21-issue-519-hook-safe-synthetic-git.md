# Hook-safe Synthetic Git Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Release Please's synthetic Git tests from inheriting repository-local hook variables while preserving the full pre-push validation gate.

**Architecture:** Add one environment-sanitization boundary in `check-release-please-monorepo.mjs`. Every nested Git subprocess and the local Release Please subprocess will receive a copy of the process environment with Git repository-local variables removed; tests will simulate a real hook environment and prove synthetic repository isolation.

**Tech Stack:** Node.js 24, `node:test`, `spawnSync`, Git, Husky 9, pnpm 11.

## Global Constraints

- The Husky `pre-push` hook remains `pnpm run check`; no validation bypass is introduced.
- Non-Git environment variables, PATH, proxy settings, and toolchain configuration remain available to subprocesses.
- Repository-local variable names come from `git rev-parse --local-env-vars`, with a fail-closed bootstrap fallback.
- The final branch push must run normally without `HUSKY=0`.
- Bot and agent comments, reviews, and unresolved threads must be inspected before merge.

---

### Task 1: Reproduce Hook Environment Leakage

**Files:**

- Modify: `scripts/check-release-please-monorepo.test.mjs`

**Interfaces:**

- Consumes: `runSyntheticReleasePleaseDryRun(repoRoot, options)`.
- Produces: regression coverage for inherited `GIT_DIR` and `GIT_WORK_TREE`.

- [ ] **Step 1: Add the failing regression test**

Add a test that resolves the caller repository's Git directory with `git rev-parse --absolute-git-dir`, saves the current `GIT_DIR` and `GIT_WORK_TREE`, sets both variables to the caller repository, invokes `runSyntheticReleasePleaseDryRun` with a stubbed successful Release Please subprocess, and restores the environment in `finally`.

```js
test("#519 synthetic repositories ignore hook-local Git environment", async () => {
  const gitDir = spawnSync("git", ["rev-parse", "--absolute-git-dir"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  }).stdout.trim();
  const previous = {
    GIT_DIR: process.env.GIT_DIR,
    GIT_WORK_TREE: process.env.GIT_WORK_TREE,
  };
  process.env.GIT_DIR = gitDir;
  process.env.GIT_WORK_TREE = REPO_ROOT;
  try {
    const snapshot = await runSyntheticReleasePleaseDryRun(REPO_ROOT, {
      token: "test-token",
      spawnReleasePlease: () => ({
        status: 0,
        stdout: ROOT_ONLY_RELEASE_PLEASE_FIXTURE,
        stderr: "",
      }),
    });
    assert.equal(snapshot.pullRequestCount, 0);
  } finally {
    restoreEnv("GIT_DIR", previous.GIT_DIR);
    restoreEnv("GIT_WORK_TREE", previous.GIT_WORK_TREE);
  }
});
```

Add a local `restoreEnv(name, value)` helper that deletes an originally absent variable and restores an originally present value.

- [ ] **Step 2: Run the targeted test and verify RED**

Run:

```bash
node --test --test-name-pattern "hook-local Git environment" scripts/check-release-please-monorepo.test.mjs
```

Expected: FAIL during synthetic repository creation with `remote origin already exists` or another result showing that nested Git commands resolved against the caller repository.

- [ ] **Step 3: Commit the failing regression**

```bash
git add scripts/check-release-please-monorepo.test.mjs
git commit -s -m "test(repo): reproduce hook Git environment leak (#519)"
```

### Task 2: Sanitize Nested Git Subprocesses

**Files:**

- Modify: `scripts/check-release-please-monorepo.mjs`
- Modify: `scripts/check-release-please-monorepo.test.mjs`

**Interfaces:**

- Produces: `createGitSubprocessEnv(baseEnv = process.env): NodeJS.ProcessEnv`.
- `runGit(cwd, args)` consumes the sanitized environment.
- `runSyntheticReleasePleaseDryRun(...)` consumes the sanitized environment and adds `GITHUB_TOKEN`/`GH_TOKEN`.

- [ ] **Step 1: Export a minimal environment builder**

Add a bootstrap set containing Git's standard local variables:

```js
const BOOTSTRAP_GIT_LOCAL_ENV_VARS = new Set([
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_CONFIG",
  "GIT_CONFIG_COUNT",
  "GIT_CONFIG_PARAMETERS",
  "GIT_DIR",
  "GIT_GRAFT_FILE",
  "GIT_IMPLICIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_NO_REPLACE_OBJECTS",
  "GIT_OBJECT_DIRECTORY",
  "GIT_PREFIX",
  "GIT_REPLACE_REF_BASE",
  "GIT_SHALLOW_FILE",
  "GIT_WORK_TREE",
]);
```

Implement `createGitSubprocessEnv(baseEnv = process.env)` by copying `baseEnv`, deleting the bootstrap variables, invoking `git rev-parse --local-env-vars` with that bootstrap-clean environment, deleting every returned variable from the copy, and returning the copy. If discovery fails, retain the bootstrap-clean copy.

- [ ] **Step 2: Route Git and Release Please through the sanitized environment**

Update `runGit`:

```js
function runGit(cwd, args) {
  return spawnSync(resolveExecutable("git"), args, {
    cwd,
    env: createGitSubprocessEnv(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}
```

Update the Release Please subprocess environment:

```js
env: {
  ...createGitSubprocessEnv(),
  GITHUB_TOKEN: token,
  GH_TOKEN: token,
},
```

- [ ] **Step 3: Add direct unit assertions for environment behavior**

Import `createGitSubprocessEnv` in the test file and assert that it removes `GIT_DIR`, `GIT_WORK_TREE`, and `GIT_INDEX_FILE` while retaining `PATH` and an arbitrary `KICAD_TEST_SENTINEL` value.

- [ ] **Step 4: Run targeted tests and verify GREEN**

Run:

```bash
node --test --test-name-pattern "Git environment|hook-local Git environment" scripts/check-release-please-monorepo.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Run the complete Release Please test lane**

Run:

```bash
corepack pnpm run test:release-please
corepack pnpm run check:release-please
```

Expected: all Release Please policy and synthetic dry-run tests pass.

- [ ] **Step 6: Commit the implementation**

```bash
git add scripts/check-release-please-monorepo.mjs scripts/check-release-please-monorepo.test.mjs
git commit -s -m "fix(repo): isolate synthetic Git subprocesses (#519)"
```

### Task 3: Document and Prove the Hook-safe Contract

**Files:**

- Create: `docs/superpowers/specs/2026-07-21-issue-519-hook-safe-synthetic-git-design.md`
- Create: `docs/superpowers/plans/2026-07-21-issue-519-hook-safe-synthetic-git.md`
- Modify: `docs/development/release-process.md`

**Interfaces:**

- Documents that synthetic Git helpers must clear repository-local Git variables.
- Produces final proof from an unmodified Husky pre-push hook.

- [ ] **Step 1: Add the operational note**

In `docs/development/release-process.md`, state that Release Please's temporary repositories clear variables reported by `git rev-parse --local-env-vars`, so direct validation and hook validation exercise the same synthetic repository.

- [ ] **Step 2: Run focused repository checks**

Run:

```bash
corepack pnpm run check:release-please
corepack pnpm run check:version
corepack pnpm run docs:lint
corepack pnpm run docs:links
git diff --check
```

Expected: all commands pass.

- [ ] **Step 3: Commit documentation and planning evidence**

```bash
git add docs/development/release-process.md docs/superpowers/specs/2026-07-21-issue-519-hook-safe-synthetic-git-design.md docs/superpowers/plans/2026-07-21-issue-519-hook-safe-synthetic-git.md
git commit -s -m "docs(repo): document hook-safe synthetic Git (#519)"
```

- [ ] **Step 4: Run the full root validation**

Run:

```bash
bash scripts/bootstrap-validation-host.sh
bash scripts/run-validation-host.sh corepack pnpm install --frozen-lockfile
bash scripts/run-validation-host.sh corepack pnpm run check
```

Expected: PASS without Release Please synthetic repository errors.

- [ ] **Step 5: Push normally through Husky**

Run:

```bash
git push -u origin fix/519-hook-git-env
```

Expected: Husky runs `pnpm run check`, the Release Please synthetic tests pass under the hook environment, and the push completes. Do not set `HUSKY=0`.

- [ ] **Step 6: Open and validate the PR**

Open `fix(repo): isolate synthetic Git tests from hook environment`, include `Closes #519`, wait for all checks, inspect bot/agent comments, reviews, and unresolved threads, fix actionable findings, then squash-merge only after terminal green evidence.
