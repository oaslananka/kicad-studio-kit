import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createGitSubprocessEnv,
  listCommits,
  listCommitsForPullRequest,
  parseConventionalSubject,
  resolveExecutable,
  runSyntheticReleasePleaseDryRun,
  validateCommitScopeCoverage,
  validateLinkedVersionGroups,
  validatePrTitle,
  validateRepositoryPolicy,
} from "./check-release-please-monorepo.mjs";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

test("release-please manifest mode is product-scoped and version aligned", () => {
  const result = validateRepositoryPolicy(REPO_ROOT);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.productPaths, {
    "kicad-studio": ["apps/vscode-extension"],
  });
  assert.deepEqual(result.changelogPaths, {
    "apps/vscode-extension": "apps/vscode-extension/CHANGELOG.md",
  });
});

test("PR title lint accepts only documented product release scopes", () => {
  assert.deepEqual(validatePrTitle("ci(repo): enforce release split"), []);
  assert.deepEqual(
    validatePrTitle("feat(kicad-studio): add viewer export"),
    [],
  );
  assert.deepEqual(
    validatePrTitle("fix(kicad-mcp-pro): harden server info"),
    [],
  );
  assert.deepEqual(validatePrTitle("chore(deps): update release tools"), []);
  assert.deepEqual(
    validatePrTitle("feat(kicad-studio/kicad-mcp-pro): update handshake"),
    [],
  );

  assert.match(
    validatePrTitle("feat(studio): add viewer export").join("\n"),
    /scope "studio" is not allowed/,
  );
  assert.match(
    validatePrTitle("fix: missing scope").join("\n"),
    /must include a scope/,
  );
});

test("commit scope gate rejects a single-scope commit that changes multiple products", () => {
  const errors = validateCommitScopeCoverage([
    {
      sha: "abc1234",
      subject: "feat(kicad-studio): update viewer export and UX",
      files: [
        "apps/vscode-extension/src/viewer/export.ts",
        "apps/vscode-extension/src/webview/controls.ts",
      ],
    },
  ]);

  assert.equal(errors.length, 0);
});

test("commit scope gate allows repo-scoped release governance across products", () => {
  assert.deepEqual(
    validateCommitScopeCoverage([
      {
        sha: "24e4414",
        subject: "ci(repo): add supply-chain release evidence",
        files: [
          ".github/workflows/publish-extension.yml",
          ".github/workflows/security.yml",
          "apps/vscode-extension/scripts/lint-workflows.js",
          "docs/release.md",
          "docs/security.md",
          "apps/vscode-extension/scripts/lint-workflows.js",
        ],
      },
    ]),
    [],
  );

  assert.deepEqual(
    validateCommitScopeCoverage([
      {
        sha: "9876543",
        subject: "ci(repo): update product runtime behavior",
        files: ["apps/vscode-extension/src/mcp/client.ts"],
      },
    ]),
    [],
  );
});

test("commit scope gate ignores normal merge commit subjects", () => {
  assert.deepEqual(
    validateCommitScopeCoverage([
      {
        sha: "1234567",
        subject:
          "Merge branch 'main' into codex/OASLANA-113-release-please-validation",
        files: ["apps/vscode-extension/src/extension.ts"],
      },
    ]),
    [],
  );
});

test("conventional subject parser supports multiple scopes", () => {
  assert.deepEqual(parseConventionalSubject("feat(kicad-studio): add tree"), {
    type: "feat",
    scopes: ["kicad-studio"],
    subject: "add tree",
  });
  assert.deepEqual(
    parseConventionalSubject("feat(kicad-studio,kicad-mcp-pro): add handshake"),
    {
      type: "feat",
      scopes: ["kicad-studio", "kicad-mcp-pro"],
      subject: "add handshake",
    },
  );
});

test("linked version groups validate all configured component versions", () => {
  const errors = validateLinkedVersionGroups(
    {
      packages: {
        "packages/a": { component: "component-a" },
        "packages/b": { component: "component-b" },
        "packages/c": { component: "component-c" },
      },
      plugins: [
        {
          type: "linked-versions",
          groupName: "suite",
          components: ["component-a", "component-b"],
        },
      ],
    },
    {
      "packages/a": "1.2.3",
      "packages/b": "1.2.4",
      "packages/c": "9.9.9",
    },
  );

  assert.equal(errors.length, 1);
  assert.match(
    errors[0],
    /linked-versions group suite must keep component-a, component-b at the same manifest version/,
  );
});

test("commit range discovery fails explicitly when git log cannot read the range", () => {
  assert.throws(
    () => listCommits(REPO_ROOT, "missing-ref-for-release-policy..HEAD"),
    /git log --format=%H%x00%s missing-ref-for-release-policy\.\.HEAD failed/,
  );
});

test("PR commit discovery fails closed when PR SHAs cannot be fetched", () => {
  assert.throws(
    () =>
      listCommitsForPullRequest(REPO_ROOT, {
        number: 999999,
        base: {
          sha: "0000000000000000000000000000000000000001",
        },
        head: {
          sha: "0000000000000000000000000000000000000002",
        },
      }),
    /Unable to fetch pull request commit 0000000/,
  );
});

test("#519 Git subprocess environment removes local variables only", () => {
  const env = createGitSubprocessEnv({
    PATH: "/test/bin",
    KICAD_TEST_SENTINEL: "preserved",
    GIT_DIR: "/caller/.git",
    GIT_WORK_TREE: "/caller",
    GIT_INDEX_FILE: "/caller/.git/index",
  });

  assert.equal(env.PATH, "/test/bin");
  assert.equal(env.KICAD_TEST_SENTINEL, "preserved");
  assert.equal(env.GIT_DIR, undefined);
  assert.equal(env.GIT_WORK_TREE, undefined);
  assert.equal(env.GIT_INDEX_FILE, undefined);
});

test("Windows command resolution only appends .cmd for package manager shims", () => {
  assert.equal(resolveExecutable("pnpm", "win32"), "pnpm.cmd");
  assert.equal(resolveExecutable("npm", "win32"), "npm.cmd");
  assert.equal(resolveExecutable("git", "win32"), "git");
  assert.equal(resolveExecutable("gh", "win32"), "gh");
  assert.equal(resolveExecutable("pnpm", "linux"), "pnpm");
});

const EXTENSION_ONLY_RELEASE_PLEASE_FIXTURE = `
Would open 1 pull requests
title: chore(main): release vscode-extension
<summary>vscode-extension:
  .release-please-manifest.json: [class ReleasePleaseManifest]
  apps/vscode-extension/package.json: [class PackageJson]
  apps/vscode-extension/CHANGELOG.md: [class Changelog]
`;

const ROOT_ONLY_RELEASE_PLEASE_FIXTURE = `
Would open 0 pull requests
`;

test("release-please dry-run snapshot handles extension-only release", async () => {
  const calls = [];
  const snapshot = await runSyntheticReleasePleaseDryRun(REPO_ROOT, {
    token: "test-token",
    spawnReleasePlease: (command, args) => {
      calls.push({ command, args });
      return {
        status: 0,
        stdout: EXTENSION_ONLY_RELEASE_PLEASE_FIXTURE,
        stderr: "",
      };
    },
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].command, /pnpm(?:\.cmd)?$/);
  assert.deepEqual(calls[0].args.slice(0, 4), [
    "--filter",
    "kicadstudiokit",
    "exec",
    "release-please",
  ]);
  assert.equal(snapshot.pullRequestCount, 1);
  assert.deepEqual(snapshot.titles, ["chore(main): release vscode-extension"]);
  assert.equal(snapshot.includesVsCodeExtensionRelease, true);
  assert.equal(snapshot.includesRootOnlyRelease, false);
  assert.deepEqual(snapshot.updatedPaths, [".release-please-manifest.json"]);
});

test("#519 synthetic repositories ignore hook-local Git environment", async () => {
  const gitDirResult = spawnSync("git", ["rev-parse", "--absolute-git-dir"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.equal(gitDirResult.status, 0, gitDirResult.stderr);

  const previous = {
    GIT_DIR: process.env.GIT_DIR,
    GIT_WORK_TREE: process.env.GIT_WORK_TREE,
  };
  process.env.GIT_DIR = gitDirResult.stdout.trim();
  process.env.GIT_WORK_TREE = REPO_ROOT;
  try {
    const snapshot = await runSyntheticReleasePleaseDryRun(REPO_ROOT, {
      token: "test-token",
      spawnReleasePlease: (_command, _args, options) => {
        assert.equal(options.env.GIT_DIR, undefined);
        assert.equal(options.env.GIT_WORK_TREE, undefined);
        return {
          status: 0,
          stdout: ROOT_ONLY_RELEASE_PLEASE_FIXTURE,
          stderr: "",
        };
      },
    });
    assert.equal(snapshot.pullRequestCount, 0);
  } finally {
    restoreEnv("GIT_DIR", previous.GIT_DIR);
    restoreEnv("GIT_WORK_TREE", previous.GIT_WORK_TREE);
  }
});

test("release-please dry-run snapshot ignores root-only changes", async () => {
  const snapshot = await runSyntheticReleasePleaseDryRun(REPO_ROOT, {
    scenario: "root-only",
    token: "test-token",
    spawnReleasePlease: () => ({
      status: 0,
      stdout: ROOT_ONLY_RELEASE_PLEASE_FIXTURE,
      stderr: "",
    }),
  });

  assert.equal(snapshot.pullRequestCount, 0);
  assert.deepEqual(snapshot.titles, []);
  assert.equal(snapshot.includesVsCodeExtensionRelease, false);
  assert.equal(snapshot.includesRootOnlyRelease, false);
  assert.deepEqual(snapshot.updatedPaths, []);
});
