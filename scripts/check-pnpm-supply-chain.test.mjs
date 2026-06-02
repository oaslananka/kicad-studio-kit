import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validatePnpmSupplyChain } from "./check-pnpm-supply-chain.mjs";

function createFixture(overrides = {}) {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), "pnpm-supply-chain-"));
  mkdirSync(path.join(repoRoot, ".github/workflows"), { recursive: true });

  writeFileSync(
    path.join(repoRoot, "pnpm-workspace.yaml"),
    overrides.workspace ??
      [
        "packages:",
        "minimumReleaseAge: 1440",
        "minimumReleaseAgeExclude:",
        "  - tmp@0.2.6",
        "blockExoticSubdeps: true",
        "",
      ].join("\n"),
  );
  writeFileSync(
    path.join(repoRoot, "package.json"),
    JSON.stringify(
      overrides.rootPackage ?? {
        packageManager: "pnpm@11.3.0",
        engines: { pnpm: ">=11.0.0 <12" },
      },
    ),
  );
  writeFileSync(
    path.join(repoRoot, ".npmrc"),
    overrides.npmrc ?? "audit=true\n",
  );
  writeFileSync(
    path.join(repoRoot, ".github/workflows/security.yml"),
    overrides.securityWorkflow ??
      [
        "on:",
        "  pull_request:",
        "  schedule:",
        '    - cron: "23 3 * * 1"',
        "steps:",
        "  - run: corepack pnpm audit --audit-level high",
        "",
      ].join("\n"),
  );

  return repoRoot;
}

test("current repository keeps pnpm 11 supply-chain controls explicit", () => {
  assert.deepEqual(validatePnpmSupplyChain(), []);
});

test("fixture with expected supply-chain settings passes", () => {
  const repoRoot = createFixture();
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), []);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("disabled pnpm supply-chain controls fail validation", () => {
  const repoRoot = createFixture({
    workspace: [
      "packages:",
      "minimumReleaseAge: 0",
      "minimumReleaseAgeExclude:",
      "  - tmp",
      "blockExoticSubdeps: false",
      "trustLockfile: true",
      "",
    ].join("\n"),
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      "pnpm-workspace.yaml must set minimumReleaseAge: 1440",
      "pnpm-workspace.yaml must set blockExoticSubdeps: true",
      "pnpm-workspace.yaml must not enable trustLockfile for public PR CI",
      "pnpm-workspace.yaml minimumReleaseAgeExclude must be limited to version-scoped security exceptions: tmp@0.2.6",
    ]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test(".npmrc and package.json cannot carry ignored pnpm supply-chain settings", () => {
  const repoRoot = createFixture({
    npmrc: "minimumReleaseAge=0\n",
    rootPackage: {
      packageManager: "pnpm@11.3.0",
      engines: { pnpm: ">=11.0.0 <12" },
      pnpm: { blockExoticSubdeps: false },
    },
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      "package.json must not define pnpm.blockExoticSubdeps; use pnpm-workspace.yaml",
      ".npmrc must not define minimumReleaseAge; pnpm 11 reads it from pnpm-workspace.yaml",
    ]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});
