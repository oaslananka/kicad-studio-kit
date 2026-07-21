#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const ALLOWED_SCOPES = [
  "kicad-studio",
  "kicad-mcp-pro",
  "repo",
  "deps",
  "docs",
  "superpowers",
  ".gitignore",
];
const PRODUCTS = {
  "kicad-studio": ["apps/vscode-extension"],
};
const REPO_RELEASE_GOVERNANCE_PREFIXES = [
  ".github/",
  "docs/",
  "scripts/",
  "apps/vscode-extension/docs/",
  "apps/vscode-extension/scripts/",
];
const EXPECTED_PACKAGES = {
  "apps/vscode-extension": {
    product: "kicad-studio",
    releaseType: "node",
    packageName: "kicadstudiokit",
    component: "vscode-extension",
    versionFile: "apps/vscode-extension/package.json",
  },
};
const SNAPSHOT_UPDATE_PATHS = [".release-please-manifest.json"];
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
let gitLocalEnvVarNames;

export function validateRepositoryPolicy(repoRoot = REPO_ROOT) {
  const errors = [];
  const config = readJson(repoRoot, "release-please-config.json");
  const manifest = readJson(repoRoot, ".release-please-manifest.json");
  const packagePaths = Object.keys(config.packages ?? {}).sort();
  const expectedPaths = Object.keys(EXPECTED_PACKAGES).sort();
  const changelogPaths = {};

  if (config["include-component-in-tag"] !== true) {
    errors.push(
      "release-please-config.json must set include-component-in-tag: true",
    );
  }
  if (config["separate-pull-requests"] !== true) {
    errors.push(
      "release-please-config.json must set separate-pull-requests: true",
    );
  }
  if (!sameList(packagePaths, expectedPaths)) {
    errors.push(
      `release-please package paths must be ${expectedPaths.join(", ")}, found ${packagePaths.join(", ")}`,
    );
  }

  for (const [packagePath, expected] of Object.entries(EXPECTED_PACKAGES)) {
    const packageConfig = config.packages?.[packagePath];
    if (!packageConfig) {
      continue;
    }
    if (packageConfig["release-type"] !== expected.releaseType) {
      errors.push(
        `${packagePath} release-type must be ${expected.releaseType}`,
      );
    }
    if (packageConfig["package-name"] !== expected.packageName) {
      errors.push(
        `${packagePath} package-name must be ${expected.packageName}`,
      );
    }
    if (packageConfig.component !== expected.component) {
      errors.push(`${packagePath} component must be ${expected.component}`);
    }
    if (packageConfig["changelog-path"] !== "CHANGELOG.md") {
      errors.push(`${packagePath} changelog-path must be CHANGELOG.md`);
    }

    const changelogPath = `${packagePath}/CHANGELOG.md`;
    changelogPaths[packagePath] = changelogPath;
    if (!fs.existsSync(path.join(repoRoot, changelogPath))) {
      errors.push(`${changelogPath} is required for product-scoped releases`);
    }
  }

  const manifestPaths = Object.keys(manifest).sort();
  if (!sameList(manifestPaths, expectedPaths)) {
    errors.push(
      `.release-please-manifest.json paths must be ${expectedPaths.join(", ")}, found ${manifestPaths.join(", ")}`,
    );
  }

  const versions = readProductVersions(repoRoot);
  for (const [packagePath, version] of Object.entries(versions)) {
    if (manifest[packagePath] !== version) {
      errors.push(
        `.release-please-manifest.json ${packagePath} must match ${version}, found ${manifest[packagePath]}`,
      );
    }
  }
  errors.push(...validateLinkedVersionGroups(config, manifest));

  const releaseDocs = readText(repoRoot, "docs/release.md");
  for (const scope of ALLOWED_SCOPES) {
    if (!releaseDocs.includes(`\`${scope}\``)) {
      errors.push(
        `docs/release.md must document conventional commit scope ${scope}`,
      );
    }
  }

  return {
    errors,
    productPaths: PRODUCTS,
    changelogPaths,
  };
}

export function parseConventionalSubject(subject) {
  const match = subject.match(/^([a-z]+)(?:\(([^)]+)\))?!?: (.+)$/);
  if (!match) {
    return null;
  }
  return {
    type: match[1],
    scopes: splitScopes(match[2] ?? ""),
    subject: match[3],
  };
}

export function validatePrTitle(title, options = {}) {
  if (isReleasePlease(options.headRefName, title)) {
    return [];
  }
  const parsed = parseConventionalSubject(title);
  if (!parsed) {
    return [
      `PR title must use Conventional Commits format: type(scope): subject`,
    ];
  }
  return validateScopeList(parsed.scopes, "PR title");
}

export function validateCommitScopeCoverage(commits, options = {}) {
  if (isReleasePlease(options.headRefName)) {
    return [];
  }
  const errors = [];
  for (const commit of commits) {
    const parsed = parseConventionalSubject(commit.subject);
    if (!parsed) {
      if (isMergeCommitSubject(commit.subject)) {
        continue;
      }
      errors.push(
        `${shortSha(commit.sha)} subject must use Conventional Commits format`,
      );
      continue;
    }
    errors.push(
      ...validateScopeList(parsed.scopes, `${shortSha(commit.sha)} subject`),
    );

    const touchedProducts = productsForFiles(commit.files);
    if (
      touchedProducts.has("kicad-studio") &&
      touchedProducts.has("kicad-mcp-pro") &&
      (!parsed.scopes.includes("kicad-studio") ||
        !parsed.scopes.includes("kicad-mcp-pro")) &&
      !isRepoScopedReleaseGovernanceCommit(parsed, commit.files)
    ) {
      errors.push(
        `${shortSha(commit.sha)} touches both product directories; split the commit, use scope kicad-studio/kicad-mcp-pro, or keep repo-scoped commits limited to release governance paths`,
      );
    }
  }
  return errors;
}

export function validateLinkedVersionGroups(config, manifest) {
  const errors = [];
  const componentPaths = new Map(
    Object.entries(config.packages ?? {})
      .filter(([, packageConfig]) => packageConfig?.component)
      .map(([packagePath, packageConfig]) => [
        packageConfig.component,
        packagePath,
      ]),
  );

  for (const plugin of config.plugins ?? []) {
    if (plugin?.type !== "linked-versions") {
      continue;
    }

    const groupName = plugin.groupName ?? "(unnamed)";
    const components = plugin.components ?? [];
    const groupEntries = [];

    for (const component of components) {
      const packagePath = componentPaths.get(component);
      if (!packagePath) {
        errors.push(
          `linked-versions group ${groupName} component ${component} must match a configured package component`,
        );
        continue;
      }
      groupEntries.push({
        component,
        packagePath,
        version: manifest[packagePath],
      });
    }

    for (const entry of groupEntries) {
      if (entry.version === undefined) {
        errors.push(
          `linked-versions group ${groupName} component ${entry.component} package ${entry.packagePath} is missing from .release-please-manifest.json`,
        );
      }
    }

    const versionedEntries = groupEntries.filter(
      (entry) => entry.version !== undefined,
    );
    const versions = new Set(versionedEntries.map((entry) => entry.version));
    if (versions.size > 1) {
      const componentsWithVersions = versionedEntries
        .map((entry) => `${entry.component}@${entry.version}`)
        .join(", ");
      errors.push(
        `linked-versions group ${groupName} must keep ${components.join(", ")} at the same manifest version, found ${componentsWithVersions}`,
      );
    }
  }

  return errors;
}

export async function runSyntheticReleasePleaseDryRun(
  repoRoot = REPO_ROOT,
  options = {},
) {
  const token = options.token ?? readGitHubToken();
  const spawnReleasePlease = options.spawnReleasePlease ?? spawnSync;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kicad-rp-dry-run-"));
  try {
    createSyntheticReleaseRepo(repoRoot, tempRoot);
    const baselineSha = git(tempRoot, ["rev-parse", "HEAD"]);

    fs.mkdirSync(path.join(tempRoot, "docs", "architecture"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tempRoot, "docs", "architecture", "release-model.md"),
      "# Release model\n\nRoot-only governance update.\n",
      "utf8",
    );
    git(tempRoot, ["add", "docs/architecture/release-model.md"]);
    git(tempRoot, [
      "-c",
      "user.name=Release Test",
      "-c",
      "user.email=release-test@example.com",
      "commit",
      "-m",
      "docs(repo): update release governance",
    ]);

    const result = spawnReleasePlease(
      resolveExecutable("pnpm"),
      [
        "--filter",
        "kicadstudiokit",
        "exec",
        "release-please",
        "release-pr",
        "--token",
        token,
        "--dry-run",
        "--local",
        "--local-path",
        tempRoot,
        "--repo-url",
        "oaslananka/kicad-studio-kit",
        "--target-branch",
        "main",
        "--config-file",
        "release-please-config.json",
        "--manifest-file",
        ".release-please-manifest.json",
        "--latest-tag-name",
        "mcp-server-v1.0.0",
        "--latest-tag-sha",
        baselineSha,
        "--latest-tag-version",
        "1.0.0",
      ],
      {
        cwd: repoRoot,
        env: {
          ...createGitSubprocessEnv(),
          GITHUB_TOKEN: token,
          GH_TOKEN: token,
        },
        encoding: "utf8",
      },
    );

    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    if (result.status !== 0) {
      throw new Error(
        `release-please dry-run failed with exit code ${result.status}:\n${redactSecrets(output)}`,
      );
    }
    return parseReleasePleaseDryRun(output);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

export function parseReleasePleaseDryRun(output) {
  const pullRequestCount = Number(
    output.match(/Would open (\d+) pull requests/)?.[1] ?? 0,
  );
  const titles = [...output.matchAll(/^title: (.+)$/gm)].map(
    (match) => match[1],
  );
  const updatedPaths = [
    ...new Set(
      [...output.matchAll(/^\s{2}([^:\n]+):\s+\[class /gm)]
        .map((match) => match[1])
        .filter((file) => SNAPSHOT_UPDATE_PATHS.includes(file)),
    ),
  ].sort();

  return {
    pullRequestCount,
    titles,
    includesVsCodeExtensionRelease: /<summary>vscode-extension:/.test(output),
    includesRootOnlyRelease: /<summary>repo:|release repo/.test(output),
    updatedPaths,
  };
}

function main() {
  const errors = [];
  errors.push(...validateRepositoryPolicy(REPO_ROOT).errors);

  const pullRequest = readPullRequestEvent();
  if (pullRequest) {
    const headRefName =
      pullRequest.head?.ref ?? process.env.GITHUB_HEAD_REF ?? "";
    errors.push(...validatePrTitle(pullRequest.title ?? "", { headRefName }));
    const commits = listCommitsForPullRequest(REPO_ROOT, pullRequest);
    errors.push(...validateCommitScopeCoverage(commits, { headRefName }));
  } else {
    const commits = listLocalBranchCommits(REPO_ROOT);
    errors.push(...validateCommitScopeCoverage(commits));
  }

  if (errors.length > 0) {
    console.error("Release Please monorepo policy failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log("Release Please monorepo policy is valid.");
}

function validateScopeList(scopes, label) {
  if (scopes.length === 0) {
    return [`${label} must include a scope: ${ALLOWED_SCOPES.join(", ")}`];
  }
  return scopes
    .filter((scope) => !ALLOWED_SCOPES.includes(scope))
    .map(
      (scope) =>
        `${label} scope "${scope}" is not allowed; use ${ALLOWED_SCOPES.join(", ")}`,
    );
}

function splitScopes(rawScope) {
  return rawScope
    .split(/[\\/,]/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function productsForFiles(files) {
  const products = new Set();
  for (const file of files) {
    if (file.startsWith("apps/vscode-extension/")) {
      products.add("kicad-studio");
    }
  }
  return products;
}

function isRepoScopedReleaseGovernanceCommit(parsed, files) {
  return (
    parsed.scopes.includes("repo") && files.every(isRepoReleaseGovernancePath)
  );
}

function isRepoReleaseGovernancePath(file) {
  return REPO_RELEASE_GOVERNANCE_PREFIXES.some((prefix) =>
    file.startsWith(prefix),
  );
}

function readProductVersions(repoRoot) {
  const extension = readJson(repoRoot, "apps/vscode-extension/package.json");
  return {
    "apps/vscode-extension": extension.version,
  };
}

function createSyntheticReleaseRepo(repoRoot, tempRoot) {
  const files = [
    "release-please-config.json",
    ".release-please-manifest.json",
    "apps/vscode-extension/package.json",
    "apps/vscode-extension/CHANGELOG.md",
  ];

  git(tempRoot, ["init", "-q", "-b", "main"]);
  git(tempRoot, ["remote", "add", "origin", tempRoot]);
  for (const file of files) {
    copyFile(repoRoot, tempRoot, file);
  }
  git(tempRoot, ["add", "."]);
  git(tempRoot, [
    "-c",
    "user.name=Release Test",
    "-c",
    "user.email=release-test@example.com",
    "commit",
    "-q",
    "-m",
    "chore(repo): baseline",
  ]);
  git(tempRoot, ["tag", "vscode-extension-v1.0.0"]);
}

export function listCommitsForPullRequest(repoRoot, pullRequest) {
  const baseSha = pullRequest.base?.sha;
  const headSha = pullRequest.head?.sha;
  if (!baseSha || !headSha) {
    return [];
  }
  ensurePullRequestCommit(repoRoot, baseSha, {
    number: pullRequest.number,
    side: "base",
  });
  ensurePullRequestCommit(repoRoot, headSha, {
    number: pullRequest.number,
    side: "head",
  });
  return listCommits(repoRoot, `${baseSha}..${headSha}`);
}

function ensurePullRequestCommit(repoRoot, sha, { number, side }) {
  if (gitCommitExists(repoRoot, sha)) {
    return;
  }

  const refs = [sha];
  if (side === "head" && number) {
    refs.push(`pull/${number}/head`);
  }

  const errors = [];
  for (const ref of refs) {
    const result = runGit(repoRoot, [
      "fetch",
      "--no-tags",
      "--depth=200",
      "origin",
      ref,
    ]);
    if (result.status === 0 && gitCommitExists(repoRoot, sha)) {
      return;
    }
    errors.push(`git fetch origin ${ref}: ${result.stderr.trim()}`);
  }

  throw new Error(
    `Unable to fetch pull request commit ${shortSha(sha)} (${side}) from origin:\n${errors.join("\n")}`,
  );
}

function gitCommitExists(repoRoot, sha) {
  return runGit(repoRoot, ["cat-file", "-e", `${sha}^{commit}`]).status === 0;
}

function listLocalBranchCommits(repoRoot) {
  const mergeBase = git(repoRoot, ["merge-base", "HEAD", "origin/main"], {
    allowFailure: true,
  });
  if (!mergeBase) {
    return [];
  }
  return listCommits(repoRoot, `${mergeBase.trim()}..HEAD`);
}

export function listCommits(repoRoot, range) {
  const lines = git(repoRoot, ["log", "--format=%H%x00%s", range])
    .split("\n")
    .filter(Boolean);
  return lines.map((line) => {
    const [sha, subject] = line.split("\0");
    return {
      sha,
      subject,
      files: git(repoRoot, [
        "diff-tree",
        "--no-commit-id",
        "--name-only",
        "-r",
        sha,
      ])
        .split("\n")
        .filter(Boolean),
    };
  });
}

function readPullRequestEvent() {
  if (!process.env.GITHUB_EVENT_PATH) {
    return null;
  }
  if (!process.env.GITHUB_EVENT_NAME?.startsWith("pull_request")) {
    return null;
  }
  const event = JSON.parse(
    fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"),
  );
  return event.pull_request ?? null;
}

function readGitHubToken() {
  const envToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (envToken) {
    return envToken;
  }
  const result = spawnSync(resolveExecutable("gh"), ["auth", "token"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status === 0 && result.stdout.trim()) {
    return result.stdout.trim();
  }
  throw new Error(
    "GITHUB_TOKEN, GH_TOKEN, or gh auth token is required for release-please dry-run",
  );
}

function copyFile(sourceRoot, targetRoot, file) {
  const source = path.join(sourceRoot, file);
  const target = path.join(targetRoot, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function readJson(repoRoot, file) {
  return JSON.parse(readText(repoRoot, file));
}

function readText(repoRoot, file) {
  return fs.readFileSync(path.join(repoRoot, file), "utf8");
}

function sameList(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function git(cwd, args, options = {}) {
  const result = runGit(cwd, args);
  if (result.status !== 0) {
    if (options.allowFailure) {
      return "";
    }
    throw new Error(`git ${args.join(" ")} failed:\n${result.stderr}`);
  }
  return result.stdout.trim();
}

export function createGitSubprocessEnv(baseEnv = process.env) {
  const env = { ...baseEnv };
  for (const name of getGitLocalEnvVarNames()) {
    delete env[name];
  }
  return env;
}

function getGitLocalEnvVarNames() {
  if (gitLocalEnvVarNames) {
    return gitLocalEnvVarNames;
  }

  const discoveryEnv = { ...process.env };
  for (const name of BOOTSTRAP_GIT_LOCAL_ENV_VARS) {
    delete discoveryEnv[name];
  }
  const result = spawnSync(
    resolveExecutable("git"),
    ["rev-parse", "--local-env-vars"],
    {
      env: discoveryEnv,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const discovered =
    result.status === 0
      ? result.stdout
          .split("\n")
          .map((name) => name.trim())
          .filter(Boolean)
      : [];
  gitLocalEnvVarNames = new Set([
    ...BOOTSTRAP_GIT_LOCAL_ENV_VARS,
    ...discovered,
  ]);
  return gitLocalEnvVarNames;
}

function runGit(cwd, args) {
  return spawnSync(resolveExecutable("git"), args, {
    cwd,
    env: createGitSubprocessEnv(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function resolveExecutable(command, platform = process.platform) {
  if (platform !== "win32") {
    return command;
  }
  return ["npm", "pnpm"].includes(command) ? `${command}.cmd` : command;
}

function shortSha(sha) {
  return String(sha).slice(0, 7);
}

function isReleasePlease(headRefName = "", title = "") {
  return (
    headRefName.startsWith("release-please--") ||
    /^chore\(main\): release /.test(title)
  );
}

function isMergeCommitSubject(subject) {
  return /^Merge (branch|remote-tracking branch|pull request) /.test(subject);
}

function redactSecrets(output) {
  return output
    .replace(/gh[oprsu]_[A-Za-z0-9_]+/g, "[REDACTED]")
    .replace(/token=([A-Za-z0-9_.-]+)/gi, "token=[REDACTED]")
    .replace(
      /Authorization: Bearer [A-Za-z0-9_.-]+/gi,
      "Authorization: Bearer [REDACTED]",
    );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
