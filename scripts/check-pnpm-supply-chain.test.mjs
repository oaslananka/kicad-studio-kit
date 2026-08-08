import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
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
        "  - fast-uri@3.1.5",
        "  - js-yaml@4.3.1",
        "  - brace-expansion@2.1.4",
        "  - brace-expansion@5.0.9",
        "  - nanoid@3.3.17",
        "trustPolicyExclude:",
        '  - "@octokit/endpoint@9.0.6"',
        "  - chokidar@4.0.3",
        '  - "semver@5.7.2 || 6.3.1"',
        "blockExoticSubdeps: true",
        "overrides:",
        '  "brace-expansion@2.1.1": "2.1.4"',
        '  "brace-expansion@5.0.6": "5.0.9"',
        '  "brace-expansion@5.0.7": "5.0.9"',
        '  "postcss@8.5.15": "8.5.24"',
        '  "nanoid@3.3.16": "3.3.17"',
        "  js-yaml: 4.3.1",
        "  tar: 7.5.22",
        "  fast-uri: 3.1.5",
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
        internalChecksFilter: "strict",
        minimumReleaseAgeBehaviour: "timestamp-required",
        packageRules: [
          {
            matchDatasources: ["npm"],
            minimumReleaseAge: "7 days",
            internalChecksFilter: "strict",
            minimumReleaseAgeBehaviour: "timestamp-required",
          },
        ],
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

test("mature PostCSS and tar releases cannot remain age exceptions", () => {
  const repoRoot = createFixture({
    workspace: [
      "packages:",
      "minimumReleaseAge: 10080",
      "trustPolicy: no-downgrade",
      "minimumReleaseAgeExclude:",
      "  - tmp@0.2.7",
      "  - fast-uri@3.1.5",
      "  - js-yaml@4.3.1",
      "  - brace-expansion@2.1.4",
      "  - brace-expansion@5.0.9",
      "  - postcss@8.5.24",
      "  - tar@7.5.22",
      "trustPolicyExclude:",
      '  - "@octokit/endpoint@9.0.6"',
      "  - chokidar@4.0.3",
      '  - "semver@5.7.2 || 6.3.1"',
      "blockExoticSubdeps: true",
      "overrides:",
      '  "brace-expansion@2.1.1": "2.1.4"',
      '  "brace-expansion@5.0.6": "5.0.9"',
      '  "brace-expansion@5.0.7": "5.0.9"',
      '  "postcss@8.5.15": "8.5.24"',
      "  js-yaml: 4.3.1",
      "  tar: 7.5.22",
      "  fast-uri: 3.1.5",
      "  linkify-it: 5.0.2",
      '  "nanoid@3.3.16": "3.3.17"',
      "",
    ].join("\n"),
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      "pnpm-workspace.yaml minimumReleaseAgeExclude must be limited to version-scoped security exceptions: tmp@0.2.7, fast-uri@3.1.5, js-yaml@4.3.1, brace-expansion@2.1.4, brace-expansion@5.0.9, nanoid@3.3.17",
    ]);
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
      '  "brace-expansion@2.1.1": "2.1.4"',
      '  "brace-expansion@5.0.6": "5.0.9"',
      '  "brace-expansion@5.0.7": "5.0.9"',
      '  "postcss@8.5.15": "8.5.24"',
      "  js-yaml: 4.3.1",
      "  tar: 7.5.22",
      "  fast-uri: 3.1.5",
      "  linkify-it: 5.0.2",
      '  "nanoid@3.3.16": "3.3.17"',
      "",
    ].join("\n"),
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      "pnpm-workspace.yaml must set minimumReleaseAge: 10080",
      "pnpm-workspace.yaml must set trustPolicy: no-downgrade",
      "pnpm-workspace.yaml must set blockExoticSubdeps: true",
      "pnpm-workspace.yaml must not enable trustLockfile for public PR CI",
      "pnpm-workspace.yaml minimumReleaseAgeExclude must be limited to version-scoped security exceptions: tmp@0.2.7, fast-uri@3.1.5, js-yaml@4.3.1, brace-expansion@2.1.4, brace-expansion@5.0.9, nanoid@3.3.17",
      "pnpm-workspace.yaml trustPolicyExclude must be limited to reviewed version-scoped exceptions: @octokit/endpoint@9.0.6, chokidar@4.0.3, semver@5.7.2 || 6.3.1",
    ]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("#542 Renovate and pnpm enforce the same strict seven-day npm maturity gate", () => {
  const repoRoot = createFixture({
    renovate: {
      minimumReleaseAge: "3 days",
      internalChecksFilter: "flexible",
      minimumReleaseAgeBehaviour: "timestamp-optional",
      packageRules: [
        {
          matchDatasources: ["npm"],
          minimumReleaseAge: "1 day",
        },
      ],
    },
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      'renovate.json must set top-level minimumReleaseAge to "7 days"',
      'renovate.json must set internalChecksFilter to "strict"',
      'renovate.json must set minimumReleaseAgeBehaviour to "timestamp-required"',
      'renovate.json must define one npm package rule with minimumReleaseAge "7 days", internalChecksFilter "strict", and minimumReleaseAgeBehaviour "timestamp-required"',
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
      "  - fast-uri@3.1.5",
      "  - js-yaml@4.3.1",
      "  - brace-expansion@2.1.4",
      "  - brace-expansion@5.0.9",
      "  - nanoid@3.3.17",
      "trustPolicyExclude:",
      '  - "@octokit/endpoint@9.0.6"',
      "  - chokidar@4.0.3",
      '  - "semver@5.7.2 || 6.3.1"',
      "blockExoticSubdeps: true",
      "overrides:",
      "  js-yaml: 4.3.1",
      "  tar: 7.5.22",
      "  fast-uri: 3.1.5",
      "  linkify-it: 5.0.2",
      '  "nanoid@3.3.16": "3.3.17"',
      "",
    ].join("\n"),
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      "pnpm-workspace.yaml overrides must pin brace-expansion@2.1.1 to 2.1.4",
      "pnpm-workspace.yaml overrides must pin brace-expansion@5.0.6 to 5.0.9",
      "pnpm-workspace.yaml overrides must pin brace-expansion@5.0.7 to 5.0.9",
      "pnpm-workspace.yaml overrides must pin postcss@8.5.15 to 8.5.24",
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
      "  - fast-uri@3.1.5",
      "  - js-yaml@4.3.1",
      "  - brace-expansion@2.1.4",
      "  - brace-expansion@5.0.9",
      "  - nanoid@3.3.17",
      "trustPolicyExclude:",
      '  - "@octokit/endpoint@9.0.6"',
      "  - chokidar@4.0.3",
      '  - "semver@5.7.2 || 6.3.1"',
      "blockExoticSubdeps: true",
      "overrides:",
      '  "brace-expansion@2.1.1": "2.1.4"',
      '  "brace-expansion@5.0.6": "5.0.9"',
      '  "brace-expansion@5.0.7": "5.0.9"',
      '  "postcss@8.5.15": "8.5.24"',
      "  js-yaml: 4.2.0",
      "  tar: 7.5.22",
      "  fast-uri: 3.1.5",
      "  linkify-it: 5.0.2",
      '  "nanoid@3.3.16": "3.3.17"',
      "",
    ].join("\n"),
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      "pnpm-workspace.yaml overrides must pin js-yaml to 4.3.1",
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
      "  - fast-uri@3.1.5",
      "  - js-yaml@4.3.1",
      "  - brace-expansion@2.1.4",
      "  - brace-expansion@5.0.9",
      "  - nanoid@3.3.17",
      "trustPolicyExclude:",
      '  - "@octokit/endpoint@9.0.6"',
      "  - chokidar@4.0.3",
      '  - "semver@5.7.2 || 6.3.1"',
      "blockExoticSubdeps: true",
      "overrides:",
      '  "brace-expansion@2.1.1": "2.1.4"',
      '  "brace-expansion@5.0.6": "5.0.9"',
      '  "brace-expansion@5.0.7": "5.0.9"',
      '  "postcss@8.5.15": "8.5.24"',
      "  js-yaml: 4.3.1",
      "  tar: 7.5.18",
      "  fast-uri: 3.1.5",
      "  linkify-it: 5.0.2",
      '  "nanoid@3.3.16": "3.3.17"',
      "",
    ].join("\n"),
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      "pnpm-workspace.yaml overrides must pin tar to 7.5.22",
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
      "  - fast-uri@3.1.5",
      "  - js-yaml@4.3.1",
      "  - brace-expansion@2.1.4",
      "  - brace-expansion@5.0.9",
      "  - nanoid@3.3.17",
      "trustPolicyExclude:",
      '  - "@octokit/endpoint@9.0.6"',
      "  - chokidar@4.0.3",
      '  - "semver@5.7.2 || 6.3.1"',
      "blockExoticSubdeps: true",
      "overrides:",
      '  "brace-expansion@2.1.1": "2.1.4"',
      '  "brace-expansion@5.0.6": "5.0.9"',
      '  "brace-expansion@5.0.7": "5.0.9"',
      '  "postcss@8.5.15": "8.5.24"',
      "  js-yaml: 4.3.1",
      "  tar: 7.5.22",
      "  fast-uri: 3.1.2",
      "  linkify-it: 5.0.1",
      '  "nanoid@3.3.16": "3.3.17"',
      "",
    ].join("\n"),
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      "pnpm-workspace.yaml overrides must pin fast-uri to 3.1.5",
      "pnpm-workspace.yaml overrides must pin linkify-it to 5.0.2",
    ]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("newly disclosed nanoid fix stays pinned", () => {
  const repoRoot = createFixture({
    workspace: [
      "packages:",
      "minimumReleaseAge: 10080",
      "trustPolicy: no-downgrade",
      "minimumReleaseAgeExclude:",
      "  - tmp@0.2.7",
      "  - fast-uri@3.1.5",
      "  - js-yaml@4.3.1",
      "  - brace-expansion@2.1.4",
      "  - brace-expansion@5.0.9",
      "trustPolicyExclude:",
      '  - "@octokit/endpoint@9.0.6"',
      "  - chokidar@4.0.3",
      '  - "semver@5.7.2 || 6.3.1"',
      "blockExoticSubdeps: true",
      "overrides:",
      '  "brace-expansion@2.1.1": "2.1.4"',
      '  "brace-expansion@5.0.6": "5.0.9"',
      '  "brace-expansion@5.0.7": "5.0.9"',
      '  "postcss@8.5.15": "8.5.24"',
      "  js-yaml: 4.3.1",
      "  tar: 7.5.22",
      "  fast-uri: 3.1.5",
      "  linkify-it: 5.0.2",
      "",
    ].join("\n"),
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      "pnpm-workspace.yaml minimumReleaseAgeExclude must be limited to version-scoped security exceptions: tmp@0.2.7, fast-uri@3.1.5, js-yaml@4.3.1, brace-expansion@2.1.4, brace-expansion@5.0.9, nanoid@3.3.17",
      "pnpm-workspace.yaml overrides must pin nanoid@3.3.16 to 3.3.17",
    ]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("#554 newly disclosed PostCSS and brace-expansion fixes stay pinned", () => {
  const repoRoot = createFixture({
    workspace: [
      "packages:",
      "minimumReleaseAge: 10080",
      "trustPolicy: no-downgrade",
      "minimumReleaseAgeExclude:",
      "  - tmp@0.2.7",
      "  - fast-uri@3.1.5",
      "  - js-yaml@4.3.1",
      "trustPolicyExclude:",
      '  - "@octokit/endpoint@9.0.6"',
      "  - chokidar@4.0.3",
      '  - "semver@5.7.2 || 6.3.1"',
      "blockExoticSubdeps: true",
      "overrides:",
      '  "brace-expansion@2.1.1": "2.1.4"',
      '  "brace-expansion@5.0.6": "5.0.7"',
      "  js-yaml: 4.3.1",
      "  tar: 7.5.22",
      "  fast-uri: 3.1.5",
      "  linkify-it: 5.0.2",
      '  "nanoid@3.3.16": "3.3.17"',
      "",
    ].join("\n"),
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      "pnpm-workspace.yaml minimumReleaseAgeExclude must be limited to version-scoped security exceptions: tmp@0.2.7, fast-uri@3.1.5, js-yaml@4.3.1, brace-expansion@2.1.4, brace-expansion@5.0.9, nanoid@3.3.17",
      "pnpm-workspace.yaml overrides must pin brace-expansion@5.0.6 to 5.0.9",
      "pnpm-workspace.yaml overrides must pin brace-expansion@5.0.7 to 5.0.9",
      "pnpm-workspace.yaml overrides must pin postcss@8.5.15 to 8.5.24",
    ]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("#554 active advisory suppressions fail validation", () => {
  const repoRoot = createFixture({
    workspace: [
      "packages:",
      "minimumReleaseAge: 10080",
      "trustPolicy: no-downgrade",
      "minimumReleaseAgeExclude:",
      "  - tmp@0.2.7",
      "  - fast-uri@3.1.5",
      "  - js-yaml@4.3.1",
      "  - brace-expansion@2.1.4",
      "  - brace-expansion@5.0.9",
      "  - nanoid@3.3.17",
      "trustPolicyExclude:",
      '  - "@octokit/endpoint@9.0.6"',
      "  - chokidar@4.0.3",
      '  - "semver@5.7.2 || 6.3.1"',
      "blockExoticSubdeps: true",
      "auditConfig:",
      "  ignoreGhsas:",
      "    - GHSA-mh99-v99m-4gvg",
      "overrides:",
      '  "brace-expansion@2.1.1": "2.1.4"',
      '  "brace-expansion@5.0.6": "5.0.9"',
      '  "brace-expansion@5.0.7": "5.0.9"',
      '  "postcss@8.5.15": "8.5.24"',
      "  js-yaml: 4.3.1",
      "  tar: 7.5.22",
      "  fast-uri: 3.1.5",
      "  linkify-it: 5.0.2",
      '  "nanoid@3.3.16": "3.3.17"',
      "",
    ].join("\n"),
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      "pnpm-workspace.yaml auditConfig.ignoreGhsas must be empty; use patched upstream releases instead of suppressing active advisories",
    ]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("#554 official brace-expansion release preserves minimatch API and bounds output", () => {
  const pnpmRoot = path.resolve("node_modules/.pnpm");
  const officialDirectory = readdirSync(pnpmRoot).find((entry) =>
    entry.startsWith("brace-expansion@2.1.4"),
  );
  assert.ok(
    officialDirectory,
    "expected official brace-expansion 2.1.4 installation",
  );

  const packageRoot = path.join(
    pnpmRoot,
    officialDirectory,
    "node_modules/brace-expansion",
  );
  const require = createRequire(import.meta.url);
  const expand = require(packageRoot);
  assert.equal(typeof expand, "function");
  assert.deepEqual(expand("{a,b}"), ["a", "b"]);

  const expanded = expand("{a,b}".repeat(5000));
  const totalLength = expanded.reduce((sum, value) => sum + value.length, 0);
  assert.ok(expanded.length > 0);
  assert.ok(totalLength <= 4_000_000);

  const minimatchDirectory = readdirSync(pnpmRoot).find((entry) =>
    entry.startsWith("minimatch@9.0.9"),
  );
  assert.ok(minimatchDirectory, "expected minimatch 9 installation");
  const minimatchModule = require(
    path.join(pnpmRoot, minimatchDirectory, "node_modules/minimatch"),
  );
  assert.equal(minimatchModule.minimatch("src/a.js", "src/*.{js,ts}"), true);
  assert.equal(minimatchModule.minimatch("src/a.css", "src/*.{js,ts}"), false);
  assert.deepEqual(minimatchModule.braceExpand("a{b,c}d"), ["abd", "acd"]);
});
