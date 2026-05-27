import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validatePnpmSupplyChain } from "./check-pnpm-supply-chain.mjs";

function createFixture(overrides = {}) {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), "pnpm-supply-chain-"));
  mkdirSync(path.join(repoRoot, ".github/workflows"), { recursive: true });
  mkdirSync(path.join(repoRoot, "packages/mcp-server"), { recursive: true });

  writeFileSync(
    path.join(repoRoot, "pnpm-workspace.yaml"),
    overrides.workspace ??
      [
        "packages:",
        '  - "packages/mcp-server"',
        "minimumReleaseAge: 1440",
        "blockExoticSubdeps: true",
        "",
      ].join("\n"),
  );
  writeFileSync(
    path.join(repoRoot, "package.json"),
    JSON.stringify(
      overrides.rootPackage ?? {
        packageManager: "pnpm@11.0.8",
        engines: { pnpm: ">=11.0.0 <12" },
      },
    ),
  );
  writeFileSync(
    path.join(repoRoot, "packages/mcp-server/package.json"),
    JSON.stringify(
      overrides.mcpPackage ?? {
        scripts: {
          "security:bandit":
            "uv run --all-extras python -m bandit -r src/ -ll -s B104",
          "security:audit":
            "uv run --all-extras python scripts/audit_dependencies.py",
          security:
            "corepack pnpm run security:bandit && corepack pnpm run security:audit",
        },
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
        "  - run: corepack pnpm --dir packages/mcp-server run security",
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
      '  - "packages/mcp-server"',
      "minimumReleaseAge: 0",
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
    ]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test(".npmrc and package.json cannot carry ignored pnpm supply-chain settings", () => {
  const repoRoot = createFixture({
    npmrc: "minimumReleaseAge=0\n",
    rootPackage: {
      packageManager: "pnpm@11.0.8",
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
