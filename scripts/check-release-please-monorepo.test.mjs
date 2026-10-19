import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { parse as parseYaml } from "yaml";
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
  validateRenovateCommitScopes,
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

test("#645 release workflow safely refreshes its verified signed release shadow", () => {
  const workflow = fs.readFileSync(
    path.join(REPO_ROOT, ".github/workflows/release-please.yml"),
    "utf8",
  );
  const steps = parseYaml(workflow).jobs.release.steps;
  const generator = steps.find((step) => step.id === "release");
  const resolve = steps.find((step) => step.id === "release-pr");
  const sync = steps.find(
    (step) => step.name === "Sync signed Release Please shadow PR",
  );
  const restore = steps.find(
    (step) => step.name === "Restore generator-owned release files",
  );
  const checkout = steps.find((step) =>
    step.uses?.startsWith("actions/checkout@"),
  );
  const publish = fs.readFileSync(
    path.join(REPO_ROOT, ".github/workflows/publish-extension.yml"),
    "utf8",
  );
  assert.ok(generator && resolve && sync && restore && checkout);
  assert.match(generator.with.token, /RELEASE_PLEASE_TOKEN/);
  assert.match(resolve.env.GH_TOKEN, /RELEASE_PLEASE_TOKEN/);
  assert.match(resolve.env.RELEASE_PR_JSON, /steps.release.outputs.pr/);
  assert.match(resolve.run, /gh pr list --repo "\$GITHUB_REPOSITORY"/);
  assert.match(resolve.run, /active=true/);
  assert.match(resolve.run, /active=false/);
  assert.match(sync.if, /steps.release-pr.outputs.active/);
  assert.equal(checkout.with.ref, "main");
  assert.match(restore.run, /git restore --source/);
  assert.match(restore.run, /apps\/vscode-extension\/CHANGELOG.md/);
  assert.match(restore.run, /apps\/vscode-extension\/package.json/);
  assert.match(sync.env.GITHUB_TOKEN, /RELEASE_PLEASE_TOKEN/);
  assert.match(
    sync.env.SIGNED_RELEASE_BRANCH,
    /release-please\/branches\/main\/components\/vscode-extension/,
  );
  assert.match(sync.run, /git merge-base --is-ancestor/);
  assert.match(sync.run, /GITHUB_RUN_ID/);
  assert.match(sync.run, /--create-from-base/);
  assert.match(sync.run, /--onto-head/);
  assert.match(sync.run, /commit.verification.verified/);
  assert.match(sync.run, /gh pr create/);
  assert.match(sync.run, /--add-label "autorelease: pending"/);
  assert.match(sync.run, /gh pr close/);
  assert.match(sync.run, /git\/refs\/heads\/\$RELEASE_PR_BRANCH/);
  assert.ok(
    sync.run.indexOf("trap - ERR") <
      sync.run.indexOf('gh pr close "$STALE_SIGNED_PR"'),
  );
  assert.ok(
    sync.run.indexOf('gh pr close "$STALE_SIGNED_PR"') <
      sync.run.indexOf('gh pr close "$RELEASE_PR_NUMBER"'),
  );
  assert.doesNotMatch(sync.run, /gh pr update-branch/);
  assert.doesNotMatch(sync.run, /--force|forceUpdateRef|git push/);
  assert.match(publish, /release:\n\s+types: \[published\]/);
});

test("#797 unchanged generator PR still runs reconciliation without rewriting refs", () => {
  const workflow = fs.readFileSync(
    path.join(REPO_ROOT, ".github/workflows/release-please.yml"),
    "utf8",
  );
  const steps = parseYaml(workflow).jobs.release.steps;
  const resolver = steps.find((step) => step.id === "release-pr");
  const sync = steps.find(
    (step) => step.name === "Sync signed Release Please shadow PR",
  );
  assert.ok(resolver && sync);
  assert.match(
    resolver.run,
    /generator_pr_list=[\s\S]*?gh pr list --repo "\$GITHUB_REPOSITORY"/,
  );
  assert.match(
    resolver.run,
    /gh pr view "\$RELEASE_PR_NUMBER" --repo "\$GITHUB_REPOSITORY"/,
  );
  assert.match(resolver.run, /printf[\s\S]*?generator_pr_list/);
  assert.match(resolver.run, /RELEASE_PR_JSON/);
  assert.match(sync.if, /steps.release-pr.outputs.active/);
  assert.match(sync.run, /STALE_SIGNED_HEAD/);
  assert.match(sync.run, /STALE_SIGNED_PR/);
  assert.match(sync.run, /Signed release shadow is not up to date with main/);
  assert.match(sync.run, /gh pr close/);
});

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

test("Renovate semantic commit scopes stay inside the repository contract", () => {
  assert.deepEqual(
    validateRenovateCommitScopes({
      packageRules: [
        { semanticCommitScope: "deps" },
        { semanticCommitScope: "repo" },
        { matchManagers: ["dockerfile"] },
      ],
    }),
    [],
  );
  assert.deepEqual(
    validateRenovateCommitScopes({
      packageRules: [
        { semanticCommitScope: "node-runtime" },
        { semanticCommitScope: "root-tooling" },
      ],
    }),
    [
      'renovate.json packageRules[0] semanticCommitScope "node-runtime" is not allowed; use kicad-studio, kicad-mcp-pro, repo, deps, docs, superpowers, .gitignore',
      'renovate.json packageRules[1] semanticCommitScope "root-tooling" is not allowed; use kicad-studio, kicad-mcp-pro, repo, deps, docs, superpowers, .gitignore',
    ],
  );
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

test("squash-only PR metadata accepts legacy intermediate commit subjects", () => {
  assert.deepEqual(
    validatePrTitle("chore(repo): converge dependency automation with Mergify"),
    [],
  );
  assert.deepEqual(
    validateCommitScopeCoverage(
      [
        {
          sha: "abcdef1",
          subject: "chore: converge dependency automation with Mergify",
          files: ["renovate.json"],
        },
      ],
      { validateSubjects: false },
    ),
    [],
  );
});

test("default-branch commit subject validation remains strict", () => {
  assert.deepEqual(
    validateCommitScopeCoverage([
      {
        sha: "abcdef2",
        subject: "chore: missing durable scope",
        files: ["renovate.json"],
      },
    ]),
    [
      "abcdef2 subject must include a scope: kicad-studio, kicad-mcp-pro, repo, deps, docs, superpowers, .gitignore",
    ],
  );
});

test("Release Please generated PR title exemption remains unchanged", () => {
  assert.deepEqual(
    validatePrTitle("chore(main): release vscode-extension", {
      headRefName:
        "release-please--branches--main--components--vscode-extension",
    }),
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

test("#784 temporary Release Please generator cannot trigger premature CI validation", () => {
  const sourceBranch =
    "release-please--branches--main--components--vscode-extension";
  const ci = parseYaml(fs.readFileSync(".github/workflows/ci.yml", "utf8"));
  const sonar = parseYaml(
    fs.readFileSync(".github/workflows/sonarcloud.yml", "utf8"),
  );
  const guarded = [
    ["ci.yml", "ci-lanes", ci],
    [
      "docs.yml",
      "build",
      parseYaml(fs.readFileSync(".github/workflows/docs.yml", "utf8")),
    ],
    [
      "release.yml",
      "release-readiness",
      parseYaml(fs.readFileSync(".github/workflows/release.yml", "utf8")),
    ],
    [
      "cross-repo-compatibility.yml",
      "canary",
      parseYaml(
        fs.readFileSync(
          ".github/workflows/cross-repo-compatibility.yml",
          "utf8",
        ),
      ),
    ],
    ["sonarcloud.yml", "sonarcloud", sonar],
  ];
  for (const [workflow, job, parsed] of guarded) {
    const expression = parsed.jobs[job]?.if;
    assert.equal(typeof expression, "string", workflow + ":" + job);
    assert.ok(
      expression.includes("github.event_name != 'pull_request'"),
      workflow,
    );
    assert.ok(
      expression.includes("github.head_ref != '" + sourceBranch + "'"),
      workflow,
    );
    assert.ok(
      expression.includes(
        "github.event.pull_request.head.repo.full_name != github.repository",
      ),
      workflow,
    );
    assert.ok(
      expression.includes(
        "github.event.pull_request.user.login != 'oaslananka'",
      ),
      workflow,
    );
    assert.ok(
      !expression.includes("github.head_ref != 'release-please/branches/"),
      workflow,
    );
  }
  assert.equal(
    ci.jobs.required.if,
    "${{ !cancelled() }}",
    "protected aggregate required must always report",
  );
  assert.ok(
    sonar.jobs.sonarcloud.if.includes(
      "github.event.pull_request.head.repo.full_name == github.repository",
    ),
    "Sonar fork secret guard remains active",
  );
  // The trusted transient head is NOT the independently protected signed PR.
  assert.notEqual(
    sourceBranch,
    "release-please/branches/main/components/vscode-extension",
  );
});

test("#801 merged -r signed shadow fallback cannot publish arbitrary PRs", () => {
  const workflow = fs.readFileSync(
    path.join(REPO_ROOT, ".github/workflows/release-please.yml"),
    "utf8",
  );
  const steps = parseYaml(workflow).jobs.release.steps;
  const recovery = steps.find((step) => step.id === "recover-signed-shadow");
  const publication = steps.find(
    (step) => step.name === "Publish validated signed shadow release",
  );
  assert.ok(recovery && publication);
  assert.match(recovery.if, /steps.release.outputs.releases_created != 'true'/);
  assert.match(recovery.if, /startsWith\(github.event.head_commit.message/);
  assert.match(
    recovery.run,
    /gh api "repos\/\$GITHUB_REPOSITORY\/commits\/\$RELEASE_SHA\/pulls"/,
  );
  assert.match(recovery.run, /scripts\/check-signed-shadow-release.mjs/);
  assert.match(publication.if, /steps.recover-signed-shadow.outputs.tag/);
  assert.match(publication.run, /commit.verification.verified/);
  assert.match(publication.run, /Release tag .*points to a different commit/);
  assert.match(publication.run, /gh release create/);
  assert.match(publication.run, /gh release view/);
  assert.match(publication.run, /--target "\$RELEASE_SHA"/);
  assert.match(publication.env.GH_TOKEN, /RELEASE_PLEASE_TOKEN/);
});
