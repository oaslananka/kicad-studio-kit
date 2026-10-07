import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { validatePnpmSupplyChain } from "./check-pnpm-supply-chain.mjs";

const CANONICAL_WORKSPACE = parseYaml(
  readFileSync(new URL("../pnpm-workspace.yaml", import.meta.url), "utf8"),
);
const MINIMUM_RELEASE_AGE_EXCLUDE_ERROR =
  "pnpm-workspace.yaml minimumReleaseAgeExclude must be limited to version-scoped security exceptions: tmp@0.2.7, nanoid@3.3.18, pnpm@11.11.0, source-map-js@1.2.2";

function workspaceFixture(mutate = () => {}) {
  const workspace = structuredClone(CANONICAL_WORKSPACE);
  mutate(workspace);
  return stringifyYaml(workspace);
}

function createFixture(overrides = {}) {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), "pnpm-supply-chain-"));
  mkdirSync(path.join(repoRoot, ".github/workflows"), { recursive: true });

  const workspacePackages = Array.isArray(overrides.workspacePackages)
    ? overrides.workspacePackages
    : ["apps/vscode-extension", "packages/kicad-fixtures", "packages/test-harness"];

  for (const pkgPath of workspacePackages) {
    mkdirSync(path.join(repoRoot, pkgPath), { recursive: true });
    writeFileSync(
      path.join(repoRoot, pkgPath, "package.json"),
      JSON.stringify(
        overrides.workspacePackageJson ?? {
          packageManager: "pnpm@11.11.0",
          engines: { pnpm: ">=11.11.0 <12" },
        },
      ),
    );
  }

  writeFileSync(
    path.join(repoRoot, "pnpm-workspace.yaml"),
    overrides.workspace ?? workspaceFixture(),
  );
  writeFileSync(
    path.join(repoRoot, "package.json"),
    JSON.stringify(
      overrides.rootPackage ?? {
        packageManager: "pnpm@11.11.0",
        engines: { pnpm: ">=11.11.0 <12" },
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

test("workspace packageManager must match root packageManager", () => {
  const repoRoot = createFixture({
    rootPackage: {
      packageManager: "pnpm@11.28.3",
      engines: { pnpm: ">=11.11.0 <12" },
    },
    workspacePackageJson: {
      packageManager: "pnpm@11.11.0",
      engines: { pnpm: ">=11.11.0 <12" },
    },
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      "Workspace package apps/vscode-extension packageManager (pnpm@11.11.0) must match root packageManager (pnpm@11.28.3)",
      "Workspace package packages/kicad-fixtures packageManager (pnpm@11.11.0) must match root packageManager (pnpm@11.28.3)",
      "Workspace package packages/test-harness packageManager (pnpm@11.11.0) must match root packageManager (pnpm@11.28.3)",
    ]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("workspace packageManager matches root passes validation", () => {
  const repoRoot = createFixture({
    rootPackage: {
      packageManager: "pnpm@11.28.3",
      engines: { pnpm: ">=11.11.0 <12" },
    },
    workspacePackageJson: {
      packageManager: "pnpm@11.28.3",
      engines: { pnpm: ">=11.11.0 <12" },
    },
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), []);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("mature PostCSS and tar releases cannot remain age exceptions", () => {
  const repoRoot = createFixture({
    workspace: workspaceFixture((workspace) => {
      workspace.minimumReleaseAgeExclude.push("postcss@8.5.24", "tar@7.5.22");
    }),
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      MINIMUM_RELEASE_AGE_EXCLUDE_ERROR,
    ]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("disabled pnpm supply-chain controls fail validation", () => {
  const repoRoot = createFixture({
    workspace: workspaceFixture((workspace) => {
      workspace.minimumReleaseAge = 0;
      workspace.trustPolicy = "off";
      workspace.minimumReleaseAgeExclude = ["tmp"];
      workspace.trustPolicyExclude = ["chokidar"];
      workspace.blockExoticSubdeps = false;
      workspace.trustLockfile = true;
    }),
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      "pnpm-workspace.yaml must set minimumReleaseAge: 10080",
      "pnpm-workspace.yaml must set trustPolicy: no-downgrade",
      "pnpm-workspace.yaml must set blockExoticSubdeps: true",
      "pnpm-workspace.yaml must not enable trustLockfile for public PR CI",
      MINIMUM_RELEASE_AGE_EXCLUDE_ERROR,
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
      packageManager: "pnpm@11.11.0",
      engines: { pnpm: ">=11.11.0 <12" },
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
    workspace: workspaceFixture((workspace) => {
      delete workspace.overrides["brace-expansion@2.1.1"];
      delete workspace.overrides["brace-expansion@5.0.6"];
      delete workspace.overrides["brace-expansion@5.0.7"];
      delete workspace.overrides["postcss@8.5.15"];
    }),
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      "pnpm-workspace.yaml overrides must pin brace-expansion@2.1.1 to 2.1.7",
      "pnpm-workspace.yaml overrides must pin brace-expansion@5.0.6 to 5.0.12",
      "pnpm-workspace.yaml overrides must pin brace-expansion@5.0.7 to 5.0.12",
      "pnpm-workspace.yaml overrides must pin postcss@8.5.15 to 8.5.28",
    ]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("#506 stale js-yaml security override fails validation", () => {
  const repoRoot = createFixture({
    workspace: workspaceFixture((workspace) => {
      workspace.overrides["js-yaml"] = "4.2.0";
    }),
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      "pnpm-workspace.yaml overrides must pin js-yaml to 4.3.2",
    ]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("#506 stale tar security override fails validation", () => {
  const repoRoot = createFixture({
    workspace: workspaceFixture((workspace) => {
      workspace.overrides.tar = "7.5.18";
    }),
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
    workspace: workspaceFixture((workspace) => {
      workspace.overrides["fast-uri"] = "3.1.2";
      workspace.overrides["linkify-it"] = "5.0.1";
    }),
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      "pnpm-workspace.yaml overrides must pin fast-uri to 3.1.8",
      "pnpm-workspace.yaml overrides must pin linkify-it to 5.0.2",
    ]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("GHSA-2v37-7h3g-55p8 nanoid fix stays pinned", () => {
  const repoRoot = createFixture({
    workspace: workspaceFixture((workspace) => {
      workspace.minimumReleaseAgeExclude =
        workspace.minimumReleaseAgeExclude.filter(
          (entry) => entry !== "nanoid@3.3.18",
        );
      delete workspace.overrides["nanoid@3.3.16"];
      delete workspace.overrides["nanoid@3.3.17"];
    }),
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      MINIMUM_RELEASE_AGE_EXCLUDE_ERROR,
      "pnpm-workspace.yaml overrides must pin nanoid@3.3.16 to 3.3.19",
      "pnpm-workspace.yaml overrides must pin nanoid@3.3.17 to 3.3.19",
    ]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("#554 newly disclosed PostCSS and brace-expansion fixes stay pinned", () => {
  const repoRoot = createFixture({
    workspace: workspaceFixture((workspace) => {
      workspace.minimumReleaseAgeExclude = ["tmp@0.2.7"];
      workspace.overrides["brace-expansion@5.0.6"] = "5.0.7";
      delete workspace.overrides["brace-expansion@5.0.7"];
      delete workspace.overrides["postcss@8.5.15"];
    }),
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      MINIMUM_RELEASE_AGE_EXCLUDE_ERROR,
      "pnpm-workspace.yaml overrides must pin brace-expansion@5.0.6 to 5.0.12",
      "pnpm-workspace.yaml overrides must pin brace-expansion@5.0.7 to 5.0.12",
      "pnpm-workspace.yaml overrides must pin postcss@8.5.15 to 8.5.28",
    ]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("#554 active advisory suppressions fail validation", () => {
  const repoRoot = createFixture({
    workspace: workspaceFixture((workspace) => {
      workspace.auditConfig = {
        ignoreGhsas: ["GHSA-mh99-v99m-4gvg"],
      };
    }),
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      "pnpm-workspace.yaml auditConfig.ignoreGhsas must be empty; use patched upstream releases instead of suppressing active advisories",
    ]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("root package.json missing packageManager fails validation", () => {
  const repoRoot = createFixture({
    rootPackage: {
      engines: { pnpm: ">=11.11.0 <12" },
    },
  });
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      "package.json packageManager must pin pnpm 11.x",
      "Root package.json missing packageManager",
    ]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("workspace package missing package.json fails validation", () => {
  const repoRoot = createFixture({
    workspacePackages: ["packages/missing-package"],
    workspace: workspaceFixture((ws) => {
      ws.packages = ["packages/missing-package"];
    }),
  });
  rmSync(path.join(repoRoot, "packages/missing-package/package.json"));
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      "Workspace package missing package.json: packages/missing-package",
    ]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("workspace package with malformed package.json fails validation", () => {
  const repoRoot = createFixture();
  writeFileSync(
    path.join(repoRoot, "packages/kicad-fixtures", "package.json"),
    "{ invalid json",
  );
  try {
    assert.deepEqual(validatePnpmSupplyChain(repoRoot), [
      "packages/kicad-fixtures/package.json must be strict JSON: Expected property name or '}' in JSON at position 2 (line 1 column 3)",
    ]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("#554 official brace-expansion release preserves minimatch API and bounds output", () => {
  const pnpmRoot = path.resolve("node_modules/.pnpm");
  const officialDirectory = readdirSync(pnpmRoot).find((entry) =>
    entry.startsWith("brace-expansion@2.1.7"),
  );
  assert.ok(
    officialDirectory,
    "expected official brace-expansion 2.1.7 installation",
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
