#!/usr/bin/env node
// Temporary, fail-closed mitigation for GHSA-fc5q-39xc-vjpf.
// Both source changes are upstream proposals, not official patched releases:
// https://github.com/micromatch/picomatch/pull/246 (2.x)
// https://github.com/micromatch/picomatch/pull/237 (4.x)
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ADVISORY = "GHSA-fc5q-39xc-vjpf";
const REVIEW_UNTIL = "2027-02-17";
const PATCHES = Object.freeze({
  "2.3.2": "4e5d1196c6498b3b7a9b1249c3446214ab7a98d35649421b2350663a87871acf",
  "4.0.7": "e9177ae19aaf641b73e4a9bc2d6f8cbd5624f16029f07d919c6c012937ce5e52",
});

function readYaml(file) {
  return YAML.parse(readFileSync(path.join(ROOT, file), "utf8"));
}

export function assessAudit(audit) {
  assert(
    audit && typeof audit === "object" && audit.advisories && audit.metadata,
    "Missing or malformed pnpm audit report",
  );
  let mitigated = 0;
  for (const advisory of Object.values(audit.advisories)) {
    if (!["high", "critical"].includes(advisory?.severity)) continue;
    const versions = advisory.findings?.map((finding) => finding.version);
    const expected =
      advisory.github_advisory_id === ADVISORY &&
      advisory.module_name === "picomatch" &&
      Array.isArray(versions) &&
      versions.length > 0 &&
      versions.every((version) => Object.hasOwn(PATCHES, version));
    assert(
      expected,
      `Unmitigated HIGH/CRITICAL dependency advisory: ${advisory.github_advisory_id ?? advisory.id ?? "unknown"}`,
    );
    mitigated++;
  }
  assert(mitigated <= 1, "Unexpected duplicate picomatch advisories");
  const counts = audit.metadata.vulnerabilities;
  assert(
    Number.isInteger(counts?.high) && Number.isInteger(counts?.critical),
    "pnpm audit severity counts are unavailable",
  );
  const highOrCritical = Object.values(audit.advisories).filter((advisory) =>
    ["high", "critical"].includes(advisory?.severity),
  ).length;
  assert.equal(
    counts.high + counts.critical,
    highOrCritical,
    "pnpm audit report omits declared HIGH/CRITICAL advisories",
  );
  return mitigated;
}

export function verifyFilesAndLock() {
  const workspace = readYaml("pnpm-workspace.yaml");
  const lock = readYaml("pnpm-lock.yaml");
  const modules = readdirSync(path.join(ROOT, "node_modules", ".pnpm"));
  const result = [];
  for (const [version, expectedHash] of Object.entries(PATCHES)) {
    const name = `picomatch@${version}`;
    const patchPath = `patches/${name}.patch`;
    const digest = createHash("sha256")
      .update(readFileSync(path.join(ROOT, patchPath)))
      .digest("hex");
    assert.equal(digest, expectedHash, `Unexpected patch contents: ${name}`);
    assert.equal(
      workspace.patchedDependencies?.[name],
      patchPath,
      `Missing pinned patch in workspace: ${name}`,
    );
    assert.equal(
      lock.patchedDependencies?.[name],
      expectedHash,
      `Missing patched lockfile entry: ${name}`,
    );
    const snapshotKey = `${name}(patch_hash=${expectedHash})`;
    assert(
      Object.hasOwn(lock.snapshots ?? {}, snapshotKey),
      `Missing patched snapshot: ${name}`,
    );
    for (const snap of Object.values(lock.snapshots ?? {})) {
      if (snap?.dependencies?.picomatch?.startsWith(`${version}`)) {
        assert.equal(
          snap.dependencies.picomatch,
          `${version}(patch_hash=${expectedHash})`,
          `Unpatched consumer remains: ${name}`,
        );
      }
    }
    const folder = `${name}_patch_hash=${expectedHash}`;
    assert(
      modules.includes(folder),
      `Patched ${name} not installed; run a frozen pnpm install`,
    );
    const modulePath = path.join(
      ROOT,
      "node_modules",
      ".pnpm",
      folder,
      "node_modules",
      "picomatch",
    );
    const installed = JSON.parse(
      readFileSync(path.join(modulePath, "package.json"), "utf8"),
    );
    assert.equal(installed.version, version);
    result.push({ version, modulePath });
  }
  return result;
}

export function verifyRuntime(entries) {
  // Separate bounded child processes prevent a catastrophic regex from hanging CI.
  const testCode = `
    const assert = require('node:assert/strict');
    const picomatch = require(process.argv[1]);
    const input = 'a'.repeat(36) + '!';
    for (const pattern of ['+(*)b', '+(*a)b', '*(*a)b', '+(*a)', 'x+(*a)', '+(a*b)c']) {
      assert.equal(picomatch.isMatch(input, pattern), false, pattern);
    }
    // Unsafe repeated extglob capture semantics deliberately fail closed: do
    // not invent a different capture result while eliminating backtracking.
    for (const [pattern, value] of [
      ['+(*a)b', 'aaab'],
      ['+(*a)', 'aa'],
      ['*(foo*)', 'foofoo'],
      ['*(*.js)', 'foo.js'],
    ]) {
      assert.equal(picomatch.isMatch(value, pattern, { capture: true }), false);
    }
    for (const [pattern, input, expected] of [
      ['*.js', 'index.js', true],
      ['*.js', 'index.ts', false],
      ['**/*.ts', 'src/main.ts', true],
      ['+(foo|bar).js', 'foobar.js', true],
      ['*(*.js)', 'foo.js', true],
    ]) {
      assert.equal(picomatch.isMatch(input, pattern), expected, pattern);
    }
  `;
  for (const { version, modulePath } of entries) {
    const run = spawnSync(process.execPath, ["-e", testCode, modulePath], {
      encoding: "utf8",
      timeout: 2500,
      maxBuffer: 128 * 1024,
    });
    assert(
      !run.error,
      `Patched ${version} runtime failed or timed out: ${run.error?.message}`,
    );
    assert.equal(
      run.status,
      0,
      `Patched ${version} did not pass security and compatibility regression: ${run.stderr}`,
    );
  }
}

function corepackScriptPath() {
  // Do not resolve a mutable PATH command when executing a security audit.
  // Corepack ships with the approved Node runtime on both platforms.
  const nodeDir = path.dirname(process.execPath);
  const script =
    process.platform === "win32"
      ? path.join(nodeDir, "node_modules", "corepack", "dist", "corepack.js")
      : path.resolve(
          nodeDir,
          "..",
          "lib",
          "node_modules",
          "corepack",
          "dist",
          "corepack.js",
        );
  assert(
    existsSync(script),
    "Corepack must exist beside the selected Node runtime",
  );
  return script;
}

export function runAudit({
  date = new Date().toISOString().slice(0, 10),
  execute = spawnSync,
  log = console.log,
} = {}) {
  assert(
    date <= REVIEW_UNTIL,
    `Temporary ${ADVISORY} patch exception expired; reassess and remove if upstream fixed`,
  );
  const result = execute(
    process.execPath,
    [corepackScriptPath(), "pnpm", "audit", "--audit-level", "high", "--json"],
    {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  assert(
    !result.error,
    `pnpm audit could not complete: ${result.error?.message}`,
  );
  assert(
    [0, 1].includes(result.status),
    `pnpm audit failed operationally (exit ${result.status}): ${result.stderr?.slice(0, 1000)}`,
  );
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error(
      "pnpm audit produced no valid JSON; refusing to accept a security exception",
    );
  }
  const mitigated = assessAudit(report);
  if ((result.status === 0) !== (mitigated === 0)) {
    throw new Error(
      "pnpm audit failed without a recognized mitigated advisory",
    );
  }
  log(
    `Security audit evaluated: ${mitigated} explicitly verified, locally patched ${ADVISORY} advisory; no other HIGH/CRITICAL advisories.`,
  );
  if (mitigated) {
    log(
      `NOTICE: The registry still classifies picomatch 2.3.2 and 4.0.7 as vulnerable. This is a reviewed, temporary SOURCE mitigation, NOT an upstream fix. Re-review by ${REVIEW_UNTIL}.`,
    );
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const entries = verifyFilesAndLock();
    verifyRuntime(entries);
    console.log(
      "Both picomatch versions: pinned patch integrity + live ReDoS/behavior regression PASS.",
    );
    if (process.argv.includes("--audit")) runAudit();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
