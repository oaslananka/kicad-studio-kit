#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_ROOT, "..");

function parseVersion(version) {
  const match = String(version).match(/v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) {
    return null;
  }
  return [match[1], match[2] ?? "0", match[3] ?? "0"].map((part) =>
    Number.parseInt(part, 10),
  );
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] > right[index]) {
      return 1;
    }
    if (left[index] < right[index]) {
      return -1;
    }
  }
  return 0;
}

export function satisfiesSimpleRange(version, range) {
  const parsedVersion = parseVersion(version);
  if (!parsedVersion) {
    return false;
  }

  return range
    .split(/\s+/u)
    .filter(Boolean)
    .every((part) => {
      const match = part.match(/^(>=|>|<=|<|=)?(.+)$/u);
      if (!match) {
        return false;
      }
      const operator = match[1] ?? "=";
      const target = parseVersion(match[2]);
      if (!target) {
        return false;
      }
      const comparison = compareVersions(parsedVersion, target);
      if (operator === ">=") {
        return comparison >= 0;
      }
      if (operator === ">") {
        return comparison > 0;
      }
      if (operator === "<=") {
        return comparison <= 0;
      }
      if (operator === "<") {
        return comparison < 0;
      }
      return comparison === 0;
    });
}

export function detectDevelopmentEnvironment(env = process.env) {
  const markers = [];
  if (env.KICAD_STUDIO_DEVCONTAINER === "1") {
    markers.push("KICAD_STUDIO_DEVCONTAINER=1");
  }
  if (env.DEVCONTAINER === "true") {
    markers.push("DEVCONTAINER=true");
  }
  if (env.CODESPACES === "true") {
    markers.push("CODESPACES=true");
  }

  return {
    isDevcontainer: markers.length > 0,
    isCodespaces: env.CODESPACES === "true",
    markers,
  };
}

function readPackageJson(repoRoot) {
  return JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? DEFAULT_REPO_ROOT,
    encoding: "utf8",
    shell: false,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
    error: result.error?.message,
  };
}

function firstLine(value) {
  return value.split(/\r?\n/u).find(Boolean) ?? "";
}

function toolCheck(id, label, command, args, options = {}) {
  const result = run(command, args, options);
  const output = firstLine(
    result.stdout || result.stderr || result.error || "",
  );
  return {
    id,
    label,
    required: options.required ?? true,
    ok: result.ok,
    detail: output || `exit ${result.status ?? "unknown"}`,
  };
}

export function createDoctorReport(
  repoRoot = DEFAULT_REPO_ROOT,
  env = process.env,
) {
  const packageJson = readPackageJson(repoRoot);
  const environment = detectDevelopmentEnvironment(env);
  const nodeRange = packageJson.engines?.node ?? ">=24.11.0 <25";
  const pnpmRange = packageJson.engines?.pnpm ?? ">=11.0.0 <12";
  const checks = [];

  checks.push({
    id: "node",
    label: `Node ${nodeRange}`,
    required: true,
    ok: satisfiesSimpleRange(process.versions.node, nodeRange),
    detail: process.version,
  });

  const pnpm = run("corepack", ["pnpm", "--version"], { cwd: repoRoot });
  checks.push({
    id: "pnpm",
    label: `pnpm ${pnpmRange}`,
    required: true,
    ok: pnpm.ok && satisfiesSimpleRange(pnpm.stdout, pnpmRange),
    detail: firstLine(pnpm.stdout || pnpm.stderr || pnpm.error || ""),
  });

  const python = run("python3", ["--version"], { cwd: repoRoot });
  checks.push({
    id: "python",
    label: "Python >=3.12",
    required: true,
    ok:
      python.ok &&
      satisfiesSimpleRange(python.stdout || python.stderr, ">=3.12"),
    detail: firstLine(python.stdout || python.stderr || python.error || ""),
  });

  checks.push(toolCheck("uv", "uv", "uv", ["--version"]));
  checks.push(toolCheck("corepack", "Corepack", "corepack", ["--version"]));
  checks.push(
    toolCheck("shellcheck", "shellcheck", "shellcheck", ["--version"]),
  );
  checks.push(
    toolCheck("actionlint", "actionlint", "actionlint", ["-version"]),
  );
  checks.push(toolCheck("gh", "GitHub CLI", "gh", ["--version"]));
  checks.push(toolCheck("xvfb", "Xvfb", "xvfb-run", ["--help"]));
  checks.push(
    toolCheck("kicad-cli", "KiCad CLI", "kicad-cli", ["version"], {
      required: false,
    }),
  );

  return {
    environment,
    checks,
  };
}

function printHuman(report) {
  const envSummary = report.environment.isDevcontainer
    ? `devcontainer detected (${report.environment.markers.join(", ")})`
    : "devcontainer marker not detected";
  console.log(`Environment: ${envSummary}`);

  for (const check of report.checks) {
    const status = check.ok ? "pass" : check.required ? "fail" : "warn";
    console.log(`[${status}] ${check.label}: ${check.detail}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = new Set(process.argv.slice(2));
  const report = createDoctorReport();
  const requireDevcontainer = args.has("--require-devcontainer");
  const strict = args.has("--strict") || report.environment.isDevcontainer;

  if (args.has("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }

  if (requireDevcontainer && !report.environment.isDevcontainer) {
    console.error("Expected a devcontainer environment marker.");
    process.exitCode = 1;
  } else if (
    strict &&
    report.checks.some((check) => check.required && !check.ok)
  ) {
    process.exitCode = 1;
  }
}
