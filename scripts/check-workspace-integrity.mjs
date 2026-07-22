#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { accessSync, constants as fsConstants } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptRoot, "..");
const bootstrapGitLocalEnvVars = new Set([
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
let defaultGitExecutable;

function defaultGitCandidates(platform = process.platform, env = process.env) {
  if (platform === "win32") {
    const roots = [
      env.ProgramW6432,
      env.ProgramFiles,
      env["ProgramFiles(x86)"],
    ].filter(Boolean);
    return roots.flatMap((root) => [
      path.win32.join(root, "Git", "cmd", "git.exe"),
      path.win32.join(root, "Git", "bin", "git.exe"),
    ]);
  }
  if (platform === "darwin") {
    return ["/usr/bin/git", "/opt/homebrew/bin/git", "/usr/local/bin/git"];
  }
  return ["/usr/bin/git", "/bin/git", "/usr/local/bin/git"];
}

function isAbsoluteForPlatform(candidate, platform) {
  return platform === "win32"
    ? path.win32.isAbsolute(candidate)
    : path.posix.isAbsolute(candidate);
}

function isExecutableFile(candidate) {
  try {
    accessSync(candidate, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveGitExecutable(options = {}) {
  const platform = options.platform ?? process.platform;
  const candidates =
    options.candidates ?? defaultGitCandidates(platform, options.env);
  const isExecutable = options.isExecutable ?? isExecutableFile;
  let hasRelativeCandidate = false;

  for (const candidate of candidates) {
    if (!isAbsoluteForPlatform(candidate, platform)) {
      hasRelativeCandidate = true;
      continue;
    }
    if (isExecutable(candidate)) return candidate;
  }

  if (hasRelativeCandidate) {
    throw new Error(
      "Git executable candidates must use an absolute Git executable path",
    );
  }
  throw new Error(
    `No executable Git binary found in approved ${platform} locations`,
  );
}

function getDefaultGitExecutable() {
  defaultGitExecutable ??= resolveGitExecutable();
  return defaultGitExecutable;
}

function spawnGit(args, options) {
  // NOSONAR: resolveGitExecutable permits only executable absolute paths from fixed locations.
  return spawnSync(getDefaultGitExecutable(), args, options);
}

function commandResult(result) {
  return {
    ok: result.ok ?? result.status === 0,
    status: result.status ?? (result.ok ? 0 : 1),
    stdout: String(result.stdout ?? "").trim(),
    stderr: String(result.stderr ?? "").trim(),
    error: result.error?.message ?? result.error ?? "",
  };
}

export function createGitSubprocessEnv(baseEnv = process.env) {
  const env = { ...baseEnv };
  for (const name of getGitLocalEnvVarNames()) {
    delete env[name];
  }
  return env;
}

function getGitLocalEnvVarNames() {
  if (gitLocalEnvVarNames) return gitLocalEnvVarNames;

  const discoveryEnv = { ...process.env };
  for (const name of bootstrapGitLocalEnvVars) delete discoveryEnv[name];
  const result = spawnGit(["rev-parse", "--local-env-vars"], {
    env: discoveryEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const discovered =
    result.status === 0
      ? String(result.stdout)
          .split(/\r?\n/u)
          .map((name) => name.trim())
          .filter(Boolean)
      : [];
  gitLocalEnvVarNames = new Set([...bootstrapGitLocalEnvVars, ...discovered]);
  return gitLocalEnvVarNames;
}

function runGit(repoRoot, args, commandRunner) {
  const env = createGitSubprocessEnv();
  if (commandRunner) {
    return commandResult(commandRunner("git", args, { cwd: repoRoot, env }));
  }

  return commandResult(
    spawnGit(args, {
      cwd: repoRoot,
      env,
      encoding: "utf8",
      shell: false,
    }),
  );
}

function absoluteGitPath(repoRoot, value) {
  if (!value) return "";
  return path.resolve(repoRoot, value);
}

export function parseWorktreePorcelain(text) {
  const trimmed = String(text).trim();
  if (!trimmed) return [];

  return trimmed
    .split(/\r?\n\s*\r?\n/u)
    .filter(Boolean)
    .map((record) => {
      const parsed = {};
      for (const line of record.split(/\r?\n/u)) {
        const separator = line.indexOf(" ");
        if (separator === -1) {
          parsed[line] = true;
        } else {
          parsed[line.slice(0, separator)] = line.slice(separator + 1);
        }
      }
      return parsed;
    });
}

function generalWorkspaceErrors(state) {
  const errors = [];
  if (state.bare && state.coreWorktree) {
    errors.push("core.bare and core.worktree must not be configured together");
  }
  if (!state.insideWorkTree || state.bare || !state.statusOk) {
    errors.push("repository root is not a usable working tree");
  }
  if (
    /core\.bare.*core\.worktree|unable to set up work tree|invalid config/iu.test(
      state.statusStderr ?? "",
    )
  ) {
    errors.push("git status reported incompatible working-tree configuration");
  }
  return errors;
}

function worktreeInventoryErrors(worktrees = []) {
  return worktrees
    .filter((worktree) => worktree.prunable)
    .map(
      (worktree) =>
        `prunable worktree detected: ${worktree.worktree ?? "unknown"}`,
    );
}

function canonicalWorkspaceErrors(state) {
  const errors = [];
  const isLinkedWorktree =
    !state.gitDir || !state.commonDir || state.gitDir !== state.commonDir;
  if (isLinkedWorktree) {
    errors.push("canonical checkout must not be a linked worktree");
  }
  if (state.coreWorktree) {
    errors.push("canonical checkout must not configure core.worktree");
  }
  if (state.branch !== "main") {
    errors.push("canonical branch must be main");
  }
  if (state.statusStdout) {
    errors.push("canonical checkout must be clean");
  }
  if (!state.originMain) {
    errors.push(
      "origin/main is unavailable; fetch the remote before validation",
    );
  } else if (state.head !== state.originMain) {
    errors.push("HEAD does not match origin/main");
  }
  return errors;
}

export function evaluateWorkspaceState(state, options = {}) {
  const canonical = Boolean(options.canonical);
  const errors = [
    ...(state.commandErrors ?? []),
    ...generalWorkspaceErrors(state),
    ...worktreeInventoryErrors(state.worktrees),
    ...(canonical ? canonicalWorkspaceErrors(state) : []),
  ];

  return {
    schemaVersion: 1,
    ok: errors.length === 0,
    mode: canonical ? "canonical" : "working-tree",
    errors: [...new Set(errors)],
    state,
  };
}

export function inspectWorkspace(repoRoot = defaultRepoRoot, options = {}) {
  const commandRunner = options.commandRunner;
  const required = (label, args) => {
    const result = runGit(repoRoot, args, commandRunner);
    return { label, result };
  };

  const inside = required("inside work tree", [
    "rev-parse",
    "--is-inside-work-tree",
  ]);
  const bare = required("bare repository state", [
    "rev-parse",
    "--is-bare-repository",
  ]);
  const coreWorktree = runGit(
    repoRoot,
    ["config", "--local", "--get", "core.worktree"],
    commandRunner,
  );
  const topLevel = required("repository top level", [
    "rev-parse",
    "--show-toplevel",
  ]);
  const gitDir = required("Git directory", ["rev-parse", "--git-dir"]);
  const commonDir = required("Git common directory", [
    "rev-parse",
    "--git-common-dir",
  ]);
  const branch = required("current branch", ["branch", "--show-current"]);
  const head = required("HEAD revision", ["rev-parse", "HEAD"]);
  const originMain = runGit(
    repoRoot,
    ["rev-parse", "--verify", "refs/remotes/origin/main"],
    commandRunner,
  );
  const status = required("git status", ["status", "--porcelain=v1"]);
  const worktrees = required("worktree inventory", [
    "worktree",
    "list",
    "--porcelain",
  ]);

  const commandErrors = [
    inside,
    bare,
    topLevel,
    gitDir,
    commonDir,
    branch,
    head,
    status,
    worktrees,
  ]
    .filter(({ result }) => !result.ok)
    .map(
      ({ label, result }) =>
        `${label} failed: ${
          result.stderr ||
          result.stdout ||
          result.error ||
          `exit ${result.status}`
        }`,
    );

  if (options.canonical && !originMain.ok) {
    commandErrors.push(
      `origin/main lookup failed: ${
        originMain.stderr ||
        originMain.stdout ||
        originMain.error ||
        `exit ${originMain.status}`
      }`,
    );
  }

  const state = {
    insideWorkTree: inside.result.ok && inside.result.stdout === "true",
    bare: bare.result.ok && bare.result.stdout === "true",
    coreWorktree: coreWorktree.ok ? coreWorktree.stdout : "",
    topLevel: topLevel.result.ok
      ? absoluteGitPath(repoRoot, topLevel.result.stdout)
      : "",
    gitDir: gitDir.result.ok
      ? absoluteGitPath(repoRoot, gitDir.result.stdout)
      : "",
    commonDir: commonDir.result.ok
      ? absoluteGitPath(repoRoot, commonDir.result.stdout)
      : "",
    branch: branch.result.stdout,
    head: head.result.stdout,
    originMain: originMain.ok ? originMain.stdout : "",
    statusOk: status.result.ok,
    statusStdout: status.result.stdout,
    statusStderr: status.result.stderr,
    worktrees: worktrees.result.ok
      ? parseWorktreePorcelain(worktrees.result.stdout)
      : [],
    commandErrors,
  };

  return evaluateWorkspaceState(state, options);
}

export function formatWorkspaceReport(report) {
  const lines = [
    `Workspace integrity: ${report.ok ? "pass" : "fail"}`,
    `Mode: ${report.mode}`,
    `Branch: ${report.state.branch || "(unavailable)"}`,
    `HEAD: ${report.state.head || "(unavailable)"}`,
    `Working tree: ${report.state.statusStdout ? "dirty" : "clean"}`,
  ];

  if (!report.ok) {
    for (const error of report.errors) lines.push(`- ${error}`);
  }

  return lines.join("\n");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = new Set(process.argv.slice(2));
  const report = inspectWorkspace(defaultRepoRoot, {
    canonical: args.has("--canonical"),
  });

  if (args.has("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatWorkspaceReport(report));
  }

  if (!report.ok) process.exitCode = 1;
}
