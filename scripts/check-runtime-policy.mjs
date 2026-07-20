#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

import {
  evaluateRuntimePolicy,
  parseKiCadStableRelease,
  parsePythonBugfixWindow,
  parseVsCodeStableRelease,
  renderRuntimePolicyMarkdown,
  validateRuntimePolicyMetadata,
} from "./lib/runtime-policy.mjs";

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_ROOT, "..");
const DEFAULT_TIMEOUT_MS = 20_000;

function readCompatibility() {
  return parseYaml(
    fs.readFileSync(path.join(REPO_ROOT, "compatibility.yaml"), "utf8"),
  );
}

function readExtensionPackage() {
  return JSON.parse(
    fs.readFileSync(
      path.join(REPO_ROOT, "apps/vscode-extension/package.json"),
      "utf8",
    ),
  );
}

function parseArgs(argv) {
  const options = { fetch: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--fetch") {
      options.fetch = true;
    } else if (arg === "--json") {
      options.jsonPath = argv[++index];
    } else if (arg === "--summary") {
      options.summaryPath = argv[++index];
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = Number(argv[++index]);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (
    options.timeoutMs !== undefined &&
    (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1)
  ) {
    throw new Error("--timeout-ms must be a positive integer");
  }
  return options;
}

async function fetchSource(url, format, timeoutMs) {
  const response = await fetch(url, {
    headers: {
      accept:
        format === "json"
          ? "application/json"
          : "text/html,application/xhtml+xml",
      "user-agent": "kicad-studio-kit-runtime-policy/1",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return format === "json" ? response.json() : response.text();
}

async function resolveUpstream(compatibility, timeoutMs) {
  const sources = compatibility.runtimePolicy.sources;
  const upstream = {};

  try {
    const payload = await fetchSource(sources.vscodeStable, "json", timeoutMs);
    upstream.vscode = {
      status: "available",
      version: parseVsCodeStableRelease(payload),
    };
  } catch (error) {
    upstream.vscode = { status: "unknown", error: error.message };
  }

  try {
    const payload = await fetchSource(
      sources.pythonReleases,
      "json",
      timeoutMs,
    );
    upstream.python = {
      status: "available",
      versions: parsePythonBugfixWindow(payload),
    };
  } catch (error) {
    upstream.python = { status: "unknown", error: error.message };
  }

  try {
    const payload = await fetchSource(
      sources.kicadDownloads,
      "html",
      timeoutMs,
    );
    upstream.kicad = {
      status: "available",
      version: parseKiCadStableRelease(payload),
    };
  } catch (error) {
    upstream.kicad = { status: "unknown", error: error.message };
  }

  return upstream;
}

function writeFile(relativeOrAbsolutePath, content, append = false) {
  const target = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(REPO_ROOT, relativeOrAbsolutePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (append) {
    fs.appendFileSync(target, content, "utf8");
  } else {
    fs.writeFileSync(target, content, "utf8");
  }
}

export async function runRuntimePolicyCheck(options = {}) {
  const compatibility = options.compatibility ?? readCompatibility();
  const extensionPackage = options.extensionPackage ?? readExtensionPackage();
  const errors = validateRuntimePolicyMetadata({
    compatibility,
    extensionPackage,
  });
  if (errors.length > 0) {
    return { errors, report: undefined, exitCode: 1 };
  }
  if (!options.fetch) {
    return { errors: [], report: undefined, exitCode: 0 };
  }

  const upstream =
    options.upstream ??
    (await resolveUpstream(
      compatibility,
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    ));
  const report = evaluateRuntimePolicy({ compatibility, upstream });
  return { errors: [], report, exitCode: report.exitCode };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runRuntimePolicyCheck(options);
  if (result.errors.length > 0) {
    console.error("Runtime policy metadata validation failed:");
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  if (!result.report) {
    console.log("Runtime policy metadata is internally consistent.");
    return;
  }

  const markdown = renderRuntimePolicyMarkdown(result.report);
  console.log(markdown);
  if (options.jsonPath) {
    writeFile(options.jsonPath, `${JSON.stringify(result.report, null, 2)}\n`);
  }
  if (options.summaryPath) {
    writeFile(options.summaryPath, `${markdown}\n`, true);
  }
  process.exitCode = result.exitCode;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Runtime policy check failed: ${error.message}`);
    process.exitCode = 1;
  });
}
