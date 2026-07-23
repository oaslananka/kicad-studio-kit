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
        "minimumReleaseAge: 10080",
        "trustPolicy: no-downgrade",
        "minimumReleaseAgeExclude:",
        "  - tmp@0.2.7",
        "  - fast-uri@3.1.4",
        "trustPolicyExclude:",
        '  - "@octokit/endpoint@9.0.6"',
        "  - chokidar@4.0.3",
        '  - "semver@5.7.2 || 6.3.1"',
        "blockExoticSubdeps: true",
        "overrides:",
        '  "brace-expansion@2.1.1": "2.1.2"',
        '  "brace-expansion@5.0.6": "5.0.7"',
        "  js-yaml: 4.3.0",
        "  tar: 7.5.19",
        "  fast-uri: 3.1.4",
        "  linkify-it: 5.0.2",
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
    path.join(repoRoot, "renovate.json"),
    JSON.stringify(
      overrides.renovate ?? {
        minimumReleaseAge: "7 days",
        packageRules: [{ matchManagers: ["npm"], rangeStrategy: "pin" }],
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
      "trustPolicy: off",
      "minimumReleaseAgeExclude:",
      "  - tmp",
      "trustPolicyExclude:",
      "  - chokidar",
      "blockExoticSubdeps: false",
      "trustLockfile: true",
      "overrides:",
      '  "brace-expansion@2.1.1": "2.1.2"',
      '  "brace-expansion@5.0.6": "5.0.7"',
      "  js-yaml: 4.3.0",
      "  tar: 7.5.19",
      "  fast-uri: 3.1.4",
      "  linkify-it: 5.0.2",
      "",
    ].join("\n"),
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      "pnpm-workspace.yaml must set minimumReleaseAge: 10080",
      "pnpm-workspace.yaml must set trustPolicy: no-downgrade",
      "pnpm-workspace.yaml must set blockExoticSubdeps: true",
      "pnpm-workspace.yaml must not enable trustLockfile for public PR CI",
      "pnpm-workspace.yaml minimumReleaseAgeExclude must be limited to version-scoped security exceptions: tmp@0.2.7, fast-uri@3.1.4",
      "pnpm-workspace.yaml trustPolicyExclude must be limited to reviewed version-scoped exceptions: @octokit/endpoint@9.0.6, chokidar@4.0.3, semver@5.7.2 || 6.3.1",
    ]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("#542 Renovate uses the same seven-day top-level cooldown without package-rule duplication", () => {
  const repoRoot = createFixture({
    renovate: {
      minimumReleaseAge: "3 days",
      packageRules: [{ matchManagers: ["npm"], minimumReleaseAge: "1 day" }],
    },
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      'renovate.json must set top-level minimumReleaseAge to "7 days"',
      "renovate.json packageRules must not duplicate minimumReleaseAge; use the top-level policy",
    ]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test(".npmrc and package.json cannot carry ignored pnpm supply-chain settings", () => {
  const repoRoot = createFixture({
    npmrc:
      "minimumReleaseAge=0\ntrustPolicy=off\ntrustPolicyExclude=chokidar\n",
    rootPackage: {
      packageManager: "pnpm@11.3.0",
      engines: { pnpm: ">=11.0.0 <12" },
      pnpm: {
        blockExoticSubdeps: false,
        trustPolicy: "off",
        trustPolicyExclude: ["chokidar"],
      },
    },
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      "package.json must not define pnpm.blockExoticSubdeps; use pnpm-workspace.yaml",
      "package.json must not define pnpm.trustPolicy; use pnpm-workspace.yaml",
      "package.json must not define pnpm.trustPolicyExclude; use pnpm-workspace.yaml",
      ".npmrc must not define minimumReleaseAge; pnpm 11 reads it from pnpm-workspace.yaml",
      ".npmrc must not define trustPolicy; pnpm 11 reads it from pnpm-workspace.yaml",
      ".npmrc must not define trustPolicyExclude; pnpm 11 reads it from pnpm-workspace.yaml",
    ]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("#506 missing brace-expansion security overrides fail validation", () => {
  const repoRoot = createFixture({
    workspace: [
      "packages:",
      "minimumReleaseAge: 10080",
      "trustPolicy: no-downgrade",
      "minimumReleaseAgeExclude:",
      "  - tmp@0.2.7",
      "  - fast-uri@3.1.4",
      "trustPolicyExclude:",
      '  - "@octokit/endpoint@9.0.6"',
      "  - chokidar@4.0.3",
      '  - "semver@5.7.2 || 6.3.1"',
      "blockExoticSubdeps: true",
      "overrides:",
      "  js-yaml: 4.3.0",
      "  tar: 7.5.19",
      "  fast-uri: 3.1.4",
      "  linkify-it: 5.0.2",
      "",
    ].join("\n"),
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      "pnpm-workspace.yaml overrides must pin brace-expansion@2.1.1 to 2.1.2",
      "pnpm-workspace.yaml overrides must pin brace-expansion@5.0.6 to 5.0.7",
    ]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("#506 stale js-yaml security override fails validation", () => {
  const repoRoot = createFixture({
    workspace: [
      "packages:",
      "minimumReleaseAge: 10080",
      "trustPolicy: no-downgrade",
      "minimumReleaseAgeExclude:",
      "  - tmp@0.2.7",
      "  - fast-uri@3.1.4",
      "trustPolicyExclude:",
      '  - "@octokit/endpoint@9.0.6"',
      "  - chokidar@4.0.3",
      '  - "semver@5.7.2 || 6.3.1"',
      "blockExoticSubdeps: true",
      "overrides:",
      '  "brace-expansion@2.1.1": "2.1.2"',
      '  "brace-expansion@5.0.6": "5.0.7"',
      "  js-yaml: 4.2.0",
      "  tar: 7.5.19",
      "  fast-uri: 3.1.4",
      "  linkify-it: 5.0.2",
      "",
    ].join("\n"),
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      "pnpm-workspace.yaml overrides must pin js-yaml to 4.3.0",
    ]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("#506 stale tar security override fails validation", () => {
  const repoRoot = createFixture({
    workspace: [
      "packages:",
      "minimumReleaseAge: 10080",
      "trustPolicy: no-downgrade",
      "minimumReleaseAgeExclude:",
      "  - tmp@0.2.7",
      "  - fast-uri@3.1.4",
      "trustPolicyExclude:",
      '  - "@octokit/endpoint@9.0.6"',
      "  - chokidar@4.0.3",
      '  - "semver@5.7.2 || 6.3.1"',
      "blockExoticSubdeps: true",
      "overrides:",
      '  "brace-expansion@2.1.1": "2.1.2"',
      '  "brace-expansion@5.0.6": "5.0.7"',
      "  js-yaml: 4.3.0",
      "  tar: 7.5.18",
      "  fast-uri: 3.1.4",
      "  linkify-it: 5.0.2",
      "",
    ].join("\n"),
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      "pnpm-workspace.yaml overrides must pin tar to 7.5.19",
    ]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("#508 newly disclosed transitive security fixes stay pinned", () => {
  const repoRoot = createFixture({
    workspace: [
      "packages:",
      "minimumReleaseAge: 10080",
      "trustPolicy: no-downgrade",
      "minimumReleaseAgeExclude:",
      "  - tmp@0.2.7",
      "  - fast-uri@3.1.4",
      "trustPolicyExclude:",
      '  - "@octokit/endpoint@9.0.6"',
      "  - chokidar@4.0.3",
      '  - "semver@5.7.2 || 6.3.1"',
      "blockExoticSubdeps: true",
      "overrides:",
      '  "brace-expansion@2.1.1": "2.1.2"',
      '  "brace-expansion@5.0.6": "5.0.7"',
      "  js-yaml: 4.3.0",
      "  tar: 7.5.19",
      "  fast-uri: 3.1.2",
      "  linkify-it: 5.0.1",
      "",
    ].join("\n"),
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      "pnpm-workspace.yaml overrides must pin fast-uri to 3.1.4",
      "pnpm-workspace.yaml overrides must pin linkify-it to 5.0.2",
    ]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});
