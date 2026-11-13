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

test("#645 one canonical Release Please PR owns signed derived release surfaces", () => {
  const workflow = fs.readFileSync(
    path.join(REPO_ROOT, ".github/workflows/release-please.yml"),
    "utf8",
  );
  const steps = parseYaml(workflow).jobs.release.steps;
  const generator = steps.find((step) => step.id === "release");
  const resolve = steps.find((step) => step.id === "release-pr");
  const verify = steps.find(
    (step) => step.name === "Verify canonical release PR head and ancestry",
  );
  const append = steps.find(
    (step) =>
      step.name === "Append verified generated files to the same release PR",
  );
  const checkout = steps.find((step) =>
    step.uses?.startsWith("actions/checkout@"),
  );
  assert.ok(generator && resolve && verify && append && checkout);
  assert.match(generator.with.token, /RELEASE_PLEASE_TOKEN/u);
  assert.match(resolve.env.GH_TOKEN, /RELEASE_PLEASE_TOKEN/u);
  assert.match(resolve.env.RELEASE_PR_JSON, /steps.release.outputs.pr/u);
  assert.match(resolve.run, /gh pr list --repo "\$GITHUB_REPOSITORY"/u);
  assert.equal(checkout.with.ref, "$" + "{{ steps.release-pr.outputs.head }}");
  assert.match(verify.run, /git merge-base --is-ancestor origin\/main/u);
  assert.match(verify.run, /RELEASE_PR_HEAD/u);
  assert.match(append.run, /--onto-head "\$RELEASE_PR_HEAD"/u);
  assert.match(append.run, /git status --porcelain=v1 --untracked-files=all/u);
  assert.match(append.run, /already has synchronized generated files/u);
  assert.match(append.run, /git\/ref\/heads\/\$RELEASE_PR_BRANCH/u);
  assert.match(append.run, /commit.verification.verified/u);
  assert.match(append.env.GITHUB_TOKEN, /RELEASE_PLEASE_TOKEN/u);
  assert.doesNotMatch(workflow, /gh pr create|gh pr close|gh release create/u);
  assert.doesNotMatch(workflow, /recover-signed-shadow|--create-from-base/u);
  assert.doesNotMatch(workflow, /forceUpdateRef|git push --force/u);
  const publish = fs.readFileSync(
    path.join(REPO_ROOT, ".github/workflows/publish-extension.yml"),
    "utf8",
  );
  assert.match(publish, /release:\n\s+types: \[published\]/u);
});

test("#797 unchanged release PR reuses its identity and rejects stale heads", () => {
  const workflow = fs.readFileSync(
    path.join(REPO_ROOT, ".github/workflows/release-please.yml"),
    "utf8",
  );
  const steps = parseYaml(workflow).jobs.release.steps;
  const resolve = steps.find((step) => step.id === "release-pr");
  const verify = steps.find(
    (step) => step.name === "Verify canonical release PR head and ancestry",
  );
  const append = steps.find(
    (step) =>
      step.name === "Append verified generated files to the same release PR",
  );
  assert.ok(resolve && verify && append);
  assert.match(resolve.run, /generator_pr_list=/u);
  assert.match(resolve.run, /active=false/u);
  assert.match(resolve.run, /active=true/u);
  assert.match(resolve.run, /RELEASE_PR_JSON/u);
  assert.match(
    resolve.env.RELEASE_PRS_CREATED,
    /steps\.release\.outputs\.prs_created/u,
  );
  // An unchanged release proposal remains open on root-only pushes.
  // No upstream PR output must skip enrichment, not disable the ancestry gate.
  assert.match(
    resolve.run,
    /Expected at most one open Release Please generator PR/u,
  );
  const noopGuard = resolve.run.indexOf('if [[ -z "$RELEASE_PR_JSON" ]]');
  const openPrHeadRead = resolve.run.indexOf('RELEASE_PR_HEAD="$(gh pr view');
  assert.ok(noopGuard >= 0 && noopGuard < openPrHeadRead);
  assert.match(
    resolve.run,
    /if \[\[ "\$RELEASE_PRS_CREATED" == "true" \]\]; then[\s\S]*?exit 1/u,
  );
  assert.match(
    resolve.run,
    /Release Please did not update a proposal; existing PR preserved[\s\S]*?active=false[\s\S]*?exit 0/u,
  );
  assert.match(resolve.run, /if \[\[ -n "\$RELEASE_PR_JSON" \]\]; then/u);
  assert.match(verify.run, /refusing stale generated surfaces/u);
  assert.match(append.run, /gh pr view "\$RELEASE_PR_NUMBER"/u);
  assert.match(append.run, /--onto-head/u);
  assert.doesNotMatch(append.run, /gh pr create|gh pr close|git push/u);
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

test("#784 canonical release PR runs the same mandatory CI lanes as ordinary PRs", () => {
  const ci = parseYaml(fs.readFileSync(".github/workflows/ci.yml", "utf8"));
  const docs = parseYaml(fs.readFileSync(".github/workflows/docs.yml", "utf8"));
  const readiness = parseYaml(
    fs.readFileSync(".github/workflows/release.yml", "utf8"),
  );
  const compat = parseYaml(
    fs.readFileSync(".github/workflows/cross-repo-compatibility.yml", "utf8"),
  );
  const sonar = parseYaml(
    fs.readFileSync(".github/workflows/sonarcloud.yml", "utf8"),
  );
  for (const [name, job] of [
    ["ci", ci.jobs["ci-lanes"]],
    ["docs", docs.jobs.build],
    ["readiness", readiness.jobs["release-readiness"]],
    ["compatibility", compat.jobs.canary],
  ]) {
    assert.equal(
      job.if,
      undefined,
      name + " must not skip canonical release PR",
    );
  }
  assert.equal(ci.jobs.required.if, "$" + "{{ !cancelled() }}");
  assert.match(
    sonar.jobs.sonarcloud.if,
    /head.repo.full_name == github.repository/u,
  );
  assert.doesNotMatch(sonar.jobs.sonarcloud.if, /github.head_ref/u);
});

test("#801 upstream Release Please retains exclusive tag and publication ownership", () => {
  const workflow = fs.readFileSync(
    path.join(REPO_ROOT, ".github/workflows/release-please.yml"),
    "utf8",
  );
  const steps = parseYaml(workflow).jobs.release.steps;
  assert.ok(steps.some((step) => step.id === "release"));
  assert.ok(
    steps.some(
      (step) =>
        step.name === "Append verified generated files to the same release PR",
    ),
  );
  assert.ok(!steps.some((step) => step.id === "recover-signed-shadow"));
  assert.doesNotMatch(workflow, /gh release create|gh pr close|gh pr create/u);
  assert.match(workflow, /steps.release.outputs.releases_created/u);
  assert.match(workflow, /secrets.DOPPLER_TOKEN/u);
});
