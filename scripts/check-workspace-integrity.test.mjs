#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  createGitSubprocessEnv,
  evaluateWorkspaceState,
  formatWorkspaceReport,
  inspectWorkspace,
  parseWorktreePorcelain,
  resolveGitExecutable,
} from "./check-workspace-integrity.mjs";

function healthyState(overrides = {}) {
  return {
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
    statusStdout: "",
    statusStderr: "",
    worktrees: [],
    ...overrides,
  };
}

function runGit(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    env: createGitSubprocessEnv(),
    encoding: "utf8",
    shell: false,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("resolves Git from fixed absolute executable locations (#525)", () => {
  const executable = resolveGitExecutable({
    platform: "linux",
    candidates: ["/untrusted/git", "/usr/bin/git"],
    isExecutable: (candidate) => candidate === "/usr/bin/git",
  });

  assert.equal(executable, "/usr/bin/git");
});

test("rejects relative Git executable candidates (#525)", () => {
  assert.throws(
    () =>
      resolveGitExecutable({
        platform: "linux",
        candidates: ["git"],
        isExecutable: () => true,
      }),
    /absolute Git executable/u,
  );
});

test("rejects a bare repository with an explicit worktree (#525)", () => {
  const report = evaluateWorkspaceState(
    healthyState({
      insideWorkTree: false,
      bare: true,
      coreWorktree: "/tmp/other-worktree",
      statusOk: false,
      statusStderr: "core.bare and core.worktree do not make sense",
    }),
  );

  assert.equal(report.ok, false);
  assert.match(report.errors.join("\n"), /core\.bare.*core\.worktree/u);
  assert.match(report.errors.join("\n"), /usable working tree/u);
});

test("canonical mode rejects linked worktrees and stale main (#525)", () => {
  const report = evaluateWorkspaceState(
    healthyState({
      topLevel: "/repo/worktree",
      gitDir: "/repo/.git/worktrees/task",
      commonDir: "/repo/.git",
      branch: "feature/task",
      head: "old",
      originMain: "new",
    }),
    { canonical: true },
  );

  assert.equal(report.ok, false);
  assert.match(report.errors.join("\n"), /linked worktree/u);
  assert.match(report.errors.join("\n"), /branch must be main/u);
  assert.match(report.errors.join("\n"), /does not match origin\/main/u);
});

test("canonical mode rejects an uncommitted working tree (#525)", () => {
  const report = evaluateWorkspaceState(
    healthyState({ statusStdout: " M docs/validation-host.md" }),
    { canonical: true },
  );

  assert.equal(report.ok, false);
  assert.match(report.errors.join("\n"), /canonical checkout must be clean/u);
});

test("parses and rejects prunable worktree records (#525)", () => {
  const worktrees = parseWorktreePorcelain(
    [
      "worktree /repo",
      "HEAD abc",
      "branch refs/heads/main",
      "",
      "worktree /gone",
      "HEAD def",
      "prunable gitdir file points to non-existent location",
      "",
    ].join("\n"),
  );

  assert.deepEqual(worktrees, [
    {
      worktree: "/repo",
      HEAD: "abc",
      branch: "refs/heads/main",
    },
    {
      worktree: "/gone",
      HEAD: "def",
      prunable: "gitdir file points to non-existent location",
    },
  ]);

  const report = evaluateWorkspaceState(healthyState({ worktrees }));
  assert.equal(report.ok, false);
  assert.match(report.errors.join("\n"), /prunable worktree.*\/gone/u);
});

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

test("synthetic repositories ignore hook-local Git environment (#525)", () => {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), "workspace-hook-env-"));
  const previous = {
    GIT_DIR: process.env.GIT_DIR,
    GIT_WORK_TREE: process.env.GIT_WORK_TREE,
  };
  try {
    runGit(repoRoot, ["init", "--initial-branch=main"]);
    runGit(repoRoot, ["config", "user.name", "Workspace Test"]);
    runGit(repoRoot, ["config", "user.email", "workspace@example.invalid"]);
    writeFileSync(path.join(repoRoot, "README.md"), "workspace test\n");
    runGit(repoRoot, ["add", "README.md"]);
    runGit(repoRoot, ["commit", "-m", "test: initialize repository"]);
    const head = runGit(repoRoot, ["rev-parse", "HEAD"]);
    runGit(repoRoot, ["update-ref", "refs/remotes/origin/main", head]);

    process.env.GIT_DIR = path.join(process.cwd(), ".git");
    process.env.GIT_WORK_TREE = process.cwd();

    const report = inspectWorkspace(repoRoot, { canonical: true });
    assert.equal(report.ok, true, formatWorkspaceReport(report));
    assert.equal(report.state.topLevel, repoRoot);
  } finally {
    restoreEnv("GIT_DIR", previous.GIT_DIR);
    restoreEnv("GIT_WORK_TREE", previous.GIT_WORK_TREE);
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("canonical mode accepts a synchronized normal repository (#525)", () => {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), "workspace-integrity-"));
  try {
    runGit(repoRoot, ["init", "--initial-branch=main"]);
    runGit(repoRoot, ["config", "user.name", "Workspace Test"]);
    runGit(repoRoot, ["config", "user.email", "workspace@example.invalid"]);
    writeFileSync(path.join(repoRoot, "README.md"), "workspace test\n");
    runGit(repoRoot, ["add", "README.md"]);
    runGit(repoRoot, ["commit", "-m", "test: initialize repository"]);
    const head = runGit(repoRoot, ["rev-parse", "HEAD"]);
    runGit(repoRoot, ["update-ref", "refs/remotes/origin/main", head]);

    const report = inspectWorkspace(repoRoot, { canonical: true });

    assert.equal(report.ok, true, formatWorkspaceReport(report));
    assert.equal(report.state.branch, "main");
    assert.equal(report.state.head, report.state.originMain);
    assert.match(formatWorkspaceReport(report), /Workspace integrity: pass/u);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});
