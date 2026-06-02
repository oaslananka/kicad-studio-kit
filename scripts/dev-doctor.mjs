#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import net from "node:net";
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

function firstLine(value) {
  return String(value).split(/\r?\n/u).find(Boolean) ?? "";
}

export function selectWindowsCommand(command, whereOutput) {
  const candidates = String(whereOutput)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const executable = candidates.find((candidate) =>
    [".exe", ".cmd", ".bat", ".com"].includes(
      path.extname(candidate).toLowerCase(),
    ),
  );
  return executable ?? candidates[0] ?? command;
}

function resolveCommand(command) {
  if (
    process.platform !== "win32" ||
    path.isAbsolute(command) ||
    command.includes("/") ||
    command.includes("\\")
  ) {
    return command;
  }
  const lookup = spawnSync("where.exe", [command], {
    encoding: "utf8",
    shell: false,
  });
  return lookup.status === 0
    ? selectWindowsCommand(command, lookup.stdout)
    : command;
}

function run(command, args, options = {}) {
  if (options.commandRunner) {
    const result = options.commandRunner(command, args, {
      cwd: options.cwd ?? DEFAULT_REPO_ROOT,
    });
    return {
      ok: result.ok,
      status: result.status ?? (result.ok ? 0 : 1),
      stdout: String(result.stdout ?? "").trim(),
      stderr: String(result.stderr ?? "").trim(),
      error: result.error,
    };
  }

  const executable = resolveCommand(command);
  const isWindowsCommandScript =
    process.platform === "win32" &&
    [".bat", ".cmd"].includes(path.extname(executable).toLowerCase());
  const result = spawnSync(
    isWindowsCommandScript ? (process.env.ComSpec ?? "cmd.exe") : executable,
    isWindowsCommandScript ? ["/d", "/c", executable, ...args] : args,
    {
      cwd: options.cwd ?? DEFAULT_REPO_ROOT,
      encoding: "utf8",
      shell: false,
    },
  );
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
    error: result.error?.message,
  };
}

function makeCheck({ id, label, category, required = true, ok, detail, hint }) {
  return {
    id,
    label,
    category,
    required,
    ok,
    status: ok ? "pass" : required ? "fail" : "warn",
    detail: detail || "(no detail)",
    hint,
  };
}

function commandCheck(id, label, category, command, args, options = {}) {
  const result = run(command, args, options);
  const output = firstLine(
    result.stdout || result.stderr || result.error || "",
  );
  return makeCheck({
    id,
    label,
    category,
    required: options.required ?? true,
    ok: result.ok,
    detail: output || `exit ${result.status ?? "unknown"}`,
    hint: options.hint,
  });
}

function versionCommandCheck(id, label, category, candidates, range, options) {
  let lastResult = null;
  for (const [command, args] of candidates) {
    const result = run(command, args, options);
    lastResult = result;
    if (result.ok) {
      const detail = firstLine(result.stdout || result.stderr);
      return makeCheck({
        id,
        label,
        category,
        required: true,
        ok: satisfiesSimpleRange(detail, range),
        detail,
        hint: options.hint,
      });
    }
  }

  return makeCheck({
    id,
    label,
    category,
    required: true,
    ok: false,
    detail: firstLine(
      lastResult?.stdout || lastResult?.stderr || lastResult?.error || "",
    ),
    hint: options.hint,
  });
}

function hasSupportedKicadVersion(output) {
  const parsed = parseVersion(output);
  return Boolean(parsed && parsed[0] >= 8 && parsed[0] <= 10);
}

function readOptionalText(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), "utf8");
  } catch {
    return "";
  }
}

function workspaceScriptsCheck(packageJson) {
  const scripts = packageJson.scripts ?? {};
  const exactScripts = {
    "dev-doctor": "node scripts/dev-doctor.mjs",
    "dev:doctor": "node scripts/dev-doctor.mjs",
    "check:dev-doctor": "node scripts/dev-doctor.mjs --ci --strict",
    "check:kicad-studio": "pnpm --filter kicadstudiokit run check",
    "check:fixtures":
      "node scripts/generate-kicad-fixture-corpus.mjs --check && node --test scripts/check-kicad-fixtures-package.test.mjs && pnpm --dir packages/kicad-fixtures run check",
    "check:kicad-fixtures": "pnpm --dir packages/kicad-fixtures run check",
    "check:protocol-schemas":
      "node --test scripts/check-protocol-schemas-package.test.mjs && node --input-type=module -e \"import pkg from '@oaslananka/kicad-protocol-schemas'; console.log('protocol-schemas resolves OK:', typeof pkg.readSchema === 'function' ? 'readSchema present' : 'readSchema missing')\"",
  };
  const missing = Object.entries(exactScripts)
    .filter(([name, expected]) => scripts[name] !== expected)
    .map(([name]) => name);

  return makeCheck({
    id: "workspace-scripts",
    label: "Root workspace scripts",
    category: "workspace",
    required: true,
    ok: missing.length === 0,
    detail:
      missing.length === 0
        ? "required root scripts are available"
        : `missing or mismatched scripts: ${missing.join(", ")}`,
    hint: "Restore the root package.json script entrypoints used by CI and contributors.",
  });
}

function fixtureManifestCheck(repoRoot) {
  const manifestPath = path.join(
    repoRoot,
    "packages",
    "kicad-fixtures",
    "manifest.json",
  );
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const fixtureCount = Number(manifest.fixtureCount ?? 0);
    return makeCheck({
      id: "fixture-manifest",
      label: "KiCad fixture corpus manifest",
      category: "fixtures",
      required: true,
      ok: fixtureCount > 0 && Array.isArray(manifest.fixtures),
      detail: `${fixtureCount} fixture(s) declared`,
      hint: "Regenerate fixtures with `corepack pnpm run fixtures:kicad:generate`.",
    });
  } catch (error) {
    return makeCheck({
      id: "fixture-manifest",
      label: "KiCad fixture corpus manifest",
      category: "fixtures",
      required: true,
      ok: false,
      detail: error.message,
      hint: "Regenerate fixtures with `corepack pnpm run fixtures:kicad:generate`.",
    });
  }
}

function protocolSchemasCheck(repoRoot) {
  const pkgRoot = path.dirname(
    path.dirname(
      require.resolve("@oaslananka/kicad-protocol-schemas/package.json"),
    ),
  );
  const schemaRoot = path.join(pkgRoot, "schemas");
  try {
    const schemaFiles = readdirSync(schemaRoot).filter((file) =>
      file.endsWith(".schema.json"),
    );
    const invalid = [];
    for (const file of schemaFiles) {
      const schema = JSON.parse(
        readFileSync(path.join(schemaRoot, file), "utf8"),
      );
      if (!schema.$schema || !schema.$id || !schema.type) {
        invalid.push(file);
      }
    }
    return makeCheck({
      id: "protocol-schemas",
      label: "Protocol schemas (npm)",
      category: "protocol",
      required: true,
      ok: schemaFiles.length > 0 && invalid.length === 0,
      detail:
        invalid.length === 0
          ? `${schemaFiles.length} schema file(s) parsed from @oaslananka/kicad-protocol-schemas`
          : `invalid schema metadata: ${invalid.join(", ")}`,
      hint: "Source of truth is oaslananka/kicad-mcp. Studio consumes from npm.",
    });
  } catch (error) {
    return makeCheck({
      id: "protocol-schemas",
      label: "Protocol schemas",
      category: "protocol",
      required: true,
      ok: false,
      detail: error.message,
      hint: "Run pnpm install. If missing, verify @oaslananka/kicad-protocol-schemas is in root devDependencies.",
    });
  }
}

function extensionDependenciesCheck(repoRoot) {
  const packagePath = path.join(
    repoRoot,
    "apps",
    "vscode-extension",
    "package.json",
  );
  const nodeModulesPath = path.join(
    repoRoot,
    "apps",
    "vscode-extension",
    "node_modules",
  );
  return makeCheck({
    id: "vscode-extension-deps",
    label: "VS Code extension dependencies",
    category: "workspace",
    required: true,
    ok: existsSync(packagePath) && existsSync(nodeModulesPath),
    detail: existsSync(nodeModulesPath)
      ? "apps/vscode-extension/node_modules is present"
      : "apps/vscode-extension/node_modules is missing",
    hint: "Run `corepack pnpm install --frozen-lockfile` from the repository root.",
  });
}

function mcpVersionDetail(result) {
  try {
    const payload = JSON.parse(result.stdout);
    const version = payload.package?.version;
    return version ? `kicad-mcp-pro ${version}` : firstLine(result.stdout);
  } catch {
    return firstLine(result.stdout || result.stderr || result.error || "");
  }
}

function mcpDoctorDetail(result) {
  try {
    const payload = JSON.parse(result.stdout);
    const status = payload.status ?? "unknown";
    const recentErrors = Array.isArray(payload.recent_errors)
      ? payload.recent_errors.length
      : 0;
    return `doctor ${status}; ${recentErrors} recent ${
      recentErrors === 1 ? "issue" : "issues"
    }`;
  } catch {
    return firstLine(result.stdout || result.stderr || result.error || "");
  }
}

function findPortOwner(port, repoRoot, commandRunner) {
  if (process.platform === "win32") {
    const result = run("netstat", ["-ano", "-p", "tcp"], {
      cwd: repoRoot,
      commandRunner,
    });
    const ownerLine = result.stdout
      .split(/\r?\n/u)
      .find((line) => line.includes(`:${port}`) && /LISTENING/u.test(line));
    return ownerLine ? ownerLine.trim() : "owner process not found";
  }

  const lsof = run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
    cwd: repoRoot,
    commandRunner,
  });
  if (lsof.ok && lsof.stdout) {
    return (
      firstLine(lsof.stdout.split(/\r?\n/u).slice(1).join("\n")) || lsof.stdout
    );
  }

  const ss = run("ss", ["-ltnp"], { cwd: repoRoot, commandRunner });
  const ownerLine = ss.stdout
    .split(/\r?\n/u)
    .find((line) => line.includes(`:${port}`));
  return ownerLine ? ownerLine.trim() : "owner process not found";
}

async function probePort(port, repoRoot, commandRunner) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        resolve({
          ok: false,
          detail: `127.0.0.1:${port} in use (${findPortOwner(port, repoRoot, commandRunner)})`,
        });
      } else {
        resolve({
          ok: false,
          detail: `127.0.0.1:${port} unavailable: ${error.message}`,
        });
      }
    });
    server.listen(port, "127.0.0.1", () => {
      server.close(() => {
        resolve({ ok: true, detail: `127.0.0.1:${port} available` });
      });
    });
  });
}

async function portsCheck(repoRoot, options) {
  const ports = [27185, 3334, 3335];
  const results = await Promise.all(
    ports.map((port) =>
      (
        options.portProbe ??
        ((value) => probePort(value, repoRoot, options.commandRunner))
      )(port),
    ),
  );

  return makeCheck({
    id: "ports",
    label: "Project development ports",
    category: "network",
    required: false,
    ok: results.every((result) => result.ok),
    detail: results.map((result) => result.detail).join("; "),
    hint: "Stop the owning process or configure an alternate port for MCP/preview tooling.",
  });
}

export async function createDoctorReport(
  repoRoot = DEFAULT_REPO_ROOT,
  options = {},
) {
  const packageJson = readPackageJson(repoRoot);
  const env = options.env ?? process.env;
  const environment = {
    platform: process.platform,
    arch: process.arch,
    ...detectDevelopmentEnvironment(env),
  };
  const nodeRange = packageJson.engines?.node ?? ">=24.11.0 <25";
  const pnpmRange = packageJson.engines?.pnpm ?? ">=11.0.0 <12";
  const pythonRange = ">=3.13";
  const commandOptions = {
    cwd: repoRoot,
    commandRunner: options.commandRunner,
  };
  const developerToolRequired = !options.ci || environment.isDevcontainer;
  const checks = [];

  checks.push(
    makeCheck({
      id: "node",
      label: `Node ${nodeRange}`,
      category: "runtime",
      required: true,
      ok: satisfiesSimpleRange(process.versions.node, nodeRange),
      detail: process.version,
      hint: "Install the Node version declared in .node-version and package.json engines.",
    }),
  );

  const pnpm = run("corepack", ["pnpm", "--version"], commandOptions);
  checks.push(
    makeCheck({
      id: "pnpm",
      label: `pnpm ${pnpmRange}`,
      category: "runtime",
      required: true,
      ok: pnpm.ok && satisfiesSimpleRange(pnpm.stdout, pnpmRange),
      detail: firstLine(pnpm.stdout || pnpm.stderr || pnpm.error || ""),
      hint: "Run `corepack enable` and use the pnpm version declared by packageManager.",
    }),
  );

  checks.push(
    versionCommandCheck(
      "python",
      `Python ${pythonRange}`,
      "runtime",
      [
        ["python3", ["--version"]],
        ["python", ["--version"]],
        ["py", ["-3", "--version"]],
      ],
      pythonRange,
      {
        ...commandOptions,
        hint: "Install Python 3.13 or newer and make it available as python3 or python.",
      },
    ),
  );

  checks.push(
    commandCheck("uv", "uv", "tools", "uv", ["--version"], {
      ...commandOptions,
      hint: "Install uv from https://docs.astral.sh/uv/.",
    }),
  );
  checks.push(
    commandCheck("corepack", "Corepack", "tools", "corepack", ["--version"], {
      ...commandOptions,
      hint: "Install Node with Corepack and run `corepack enable`.",
    }),
  );
  checks.push(
    commandCheck(
      "shellcheck",
      "shellcheck",
      "tools",
      "shellcheck",
      ["--version"],
      {
        ...commandOptions,
        required: developerToolRequired,
        hint: "Install shellcheck for workflow and shell script validation.",
      },
    ),
  );
  checks.push(
    commandCheck(
      "actionlint",
      "actionlint",
      "tools",
      "actionlint",
      ["-version"],
      {
        ...commandOptions,
        required: developerToolRequired,
        hint: "Install actionlint for GitHub Actions workflow validation.",
      },
    ),
  );
  checks.push(
    commandCheck("gh", "GitHub CLI", "tools", "gh", ["--version"], {
      ...commandOptions,
      required: developerToolRequired,
      hint: "Install GitHub CLI and authenticate with `gh auth login`.",
    }),
  );
  checks.push(
    commandCheck("xvfb", "Xvfb", "tools", "xvfb-run", ["--help"], {
      ...commandOptions,
      required: developerToolRequired,
      hint: "Install Xvfb for headless VS Code and KiCad GUI smoke tests on Linux.",
    }),
  );

  const kicad = run("kicad-cli", ["version"], commandOptions);
  const kicadDetail = firstLine(
    kicad.stdout || kicad.stderr || kicad.error || "",
  );
  checks.push(
    makeCheck({
      id: "kicad-cli",
      label: "KiCad CLI 8.x/9.x/10.x",
      category: "tools",
      required: !options.ci,
      ok: kicad.ok && hasSupportedKicadVersion(kicadDetail),
      detail: kicadDetail,
      hint: "Install a supported KiCad CLI or set the extension kicad-cli path.",
    }),
  );

  checks.push(extensionDependenciesCheck(repoRoot));

  checks.push(
    commandCheck(
      "cloudflared",
      "Cloudflare tunnel tool",
      "optional",
      "cloudflared",
      ["--version"],
      {
        ...commandOptions,
        required: false,
        hint: "Install cloudflared only when testing remote tunnel workflows.",
      },
    ),
  );

  checks.push(await portsCheck(repoRoot, options));
  checks.push(workspaceScriptsCheck(packageJson));
  checks.push(fixtureManifestCheck(repoRoot));
  checks.push(
    commandCheck(
      "fixture-corpus",
      "KiCad fixture corpus validation",
      "fixtures",
      "corepack",
      ["pnpm", "run", "check:fixtures"],
      {
        ...commandOptions,
        hint: "Run `corepack pnpm run fixtures:kicad:generate` and commit the generated corpus.",
      },
    ),
  );
  checks.push(protocolSchemasCheck(repoRoot));

  const compatibility = readOptionalText(repoRoot, "compatibility.yaml");
  checks.push(
    makeCheck({
      id: "compatibility-matrix",
      label: "Compatibility matrix",
      category: "workspace",
      required: true,
      ok:
        compatibility.includes('primary: "10.0.x"') &&
        compatibility.includes('range: ">=24.11.0 <25"') &&
        compatibility.includes('range: ">=3.13"'),
      detail: compatibility
        ? "compatibility.yaml contains runtime baselines"
        : "missing",
      hint: "Keep compatibility.yaml aligned with package engines and support docs.",
    }),
  );

  const failedRequired = checks.some((check) => check.required && !check.ok);

  return {
    schemaVersion: 1,
    status: failedRequired ? "failed" : "ok",
    environment,
    checks,
  };
}

export function formatHumanReport(report) {
  const envSummary = report.environment.isDevcontainer
    ? `devcontainer detected (${report.environment.markers.join(", ")})`
    : "devcontainer marker not detected";
  const lines = [
    "KiCad Studio Kit dev-doctor",
    `Status: ${report.status}`,
    `Environment: ${report.environment.platform}/${report.environment.arch}; ${envSummary}`,
  ];

  for (const check of report.checks) {
    lines.push(`[${check.status}] ${check.label}: ${check.detail}`);
    if (!check.ok) {
      lines.push(`  hint: ${check.hint}`);
    }
  }

  return lines.join("\n");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = new Set(process.argv.slice(2));
  const report = await createDoctorReport(DEFAULT_REPO_ROOT, {
    env: process.env,
    ci: args.has("--ci"),
  });
  const requireDevcontainer = args.has("--require-devcontainer");
  const strict = args.has("--strict") || report.environment.isDevcontainer;

  if (args.has("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatHumanReport(report));
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
