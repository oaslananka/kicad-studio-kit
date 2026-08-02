import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateSecurityTooling } from "./check-security-tooling.mjs";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const MISE_TEXT = readFileSync(path.join(REPO_ROOT, "mise.toml"), "utf8");
const UV_VERSION = /\buv\s*=\s*"(?<version>\d+\.\d+\.\d+)"/u.exec(MISE_TEXT)
  ?.groups?.version;
assert.ok(UV_VERSION, "mise.toml must expose the canonical uv version");

const UV_PIN_SURFACES = [
  ".devcontainer/Dockerfile",
  ".devcontainer/devcontainer.json",
  ".github/workflows/ci.yml",
  ".github/workflows/cross-repo-compatibility.yml",
  ".github/workflows/docs.yml",
  ".github/workflows/performance-nightly.yml",
  ".github/workflows/security.yml",
  "docs/validation-host.md",
  "mise.toml",
  "scripts/check-devcontainer.mjs",
  "scripts/check-security-tooling.mjs",
  "scripts/check-validation-host.mjs",
];

const RELEVANT_FILES = [
  ...UV_PIN_SURFACES,
  "apps/vscode-extension/scripts/local-security.sh",
  "apps/vscode-extension/scripts/local-security.ps1",
  ".github/zizmor.yml",
  ".pre-commit-config.yaml",
  ".semgrepignore",
  ".semgrep/semgrep.yml",
  ".semgrep/semgrep.ts",
  "package.json",
  "renovate.json",
  "docs/security.md",
];

function createFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "kicad-security-tooling-"));
  for (const relativePath of RELEVANT_FILES) {
    const source = path.join(REPO_ROOT, relativePath);
    const target = path.join(root, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    try {
      cpSync(source, target);
    } catch {
      writeFileSync(target, "");
    }
  }
  return root;
}

function replaceInFixture(root, relativePath, before, after) {
  const filePath = path.join(root, relativePath);
  const source = readFileSync(filePath, "utf8");
  assert.ok(source.includes(before), `${relativePath} must contain ${before}`);
  writeFileSync(filePath, source.replace(before, after));
}

function renovateFilePattern(pattern) {
  assert.match(pattern, /^\/.+\/[a-z]*$/u);
  const delimiter = pattern.lastIndexOf("/");
  const source = pattern.slice(1, delimiter);
  const flags = pattern.slice(delimiter + 1);
  return new RegExp(source, flags.includes("u") ? flags : `${flags}u`);
}

function countManagedUvPins(manager, text) {
  return manager.matchStrings.reduce((count, pattern) => {
    const regex = new RegExp(pattern, "gmu");
    return (
      count +
      [...text.matchAll(regex)].filter(
        (match) => match.groups?.currentValue === UV_VERSION,
      ).length
    );
  }, 0);
}

test("Renovate owns every repository uv pin surface", () => {
  const renovate = JSON.parse(
    readFileSync(path.join(REPO_ROOT, "renovate.json"), "utf8"),
  );
  const uvManagers = (renovate.customManagers ?? []).filter(
    (manager) =>
      manager.customType === "regex" &&
      manager.datasourceTemplate === "github-releases" &&
      manager.depNameTemplate === "astral-sh/uv",
  );
  assert.equal(uvManagers.length, 1);
  const manager = uvManagers[0];
  assert.equal(manager.versioningTemplate, "semver-coerced");
  assert.ok(Array.isArray(manager.managerFilePatterns));
  assert.ok(Array.isArray(manager.matchStrings));

  const nativeManagerDisabled = (renovate.packageRules ?? []).some(
    (rule) =>
      rule.enabled === false &&
      rule.matchManagers?.includes("github-actions") &&
      rule.matchPackageNames?.includes("astral-sh/uv"),
  );
  assert.equal(
    nativeManagerDisabled,
    true,
    "the native github-actions uses-with update must be disabled for astral-sh/uv",
  );

  const atomicUpdateRule = (renovate.packageRules ?? []).some(
    (rule) =>
      rule.matchManagers?.includes("custom.regex") &&
      rule.matchPackageNames?.includes("astral-sh/uv") &&
      rule.groupName === "repository uv toolchain" &&
      rule.semanticCommitScope === "repo" &&
      rule.dependencyDashboardApproval === true &&
      rule.automerge === false,
  );
  assert.equal(
    atomicUpdateRule,
    true,
    "the uv custom manager must produce one manually reviewed repository-scoped PR",
  );

  for (const relativePath of UV_PIN_SURFACES) {
    assert.ok(
      manager.managerFilePatterns.some((pattern) =>
        renovateFilePattern(pattern).test(relativePath),
      ),
      `${relativePath} must be included in the uv custom manager`,
    );
    const contents = readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
    const expectedMatches = contents.split(UV_VERSION).length - 1;
    assert.ok(
      expectedMatches > 0,
      `${relativePath} must contain ${UV_VERSION}`,
    );
    assert.equal(
      countManagedUvPins(manager, contents),
      expectedMatches,
      `${relativePath} must expose every uv pin to Renovate`,
    );
  }
});

test("every setup-node workflow reads the canonical .node-version file", () => {
  const workflowRoot = path.join(REPO_ROOT, ".github/workflows");
  for (const entry of readdirSync(workflowRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.ya?ml$/u.test(entry.name)) continue;
    const relativePath = `.github/workflows/${entry.name}`;
    const workflow = readFileSync(path.join(workflowRoot, entry.name), "utf8");
    if (!workflow.includes("actions/setup-node@")) continue;
    assert.doesNotMatch(
      workflow,
      /^\s*node-version:\s*\d/mu,
      `${relativePath} must not duplicate the Node runtime pin`,
    );
    const setupNodeSteps =
      workflow.match(/actions\/setup-node@/gu)?.length ?? 0;
    const nodeVersionFiles =
      workflow.match(/^\s*node-version-file:\s*\.node-version\s*$/gmu)
        ?.length ?? 0;
    assert.equal(
      nodeVersionFiles,
      setupNodeSteps,
      `${relativePath} must source every setup-node step from .node-version`,
    );
  }
});

test("#508 repository security-tooling policy is complete", () => {
  assert.deepEqual(validateSecurityTooling(), []);
});

test("#508 exact scanner versions cannot drift", () => {
  const root = createFixture();
  try {
    replaceInFixture(root, "package.json", "zizmor==1.28.0", "zizmor==latest");
    replaceInFixture(root, "package.json", "semgrep==1.170.0", "semgrep");
    const errors = validateSecurityTooling(root);
    assert.ok(errors.some((error) => error.includes("zizmor 1.28.0")));
    assert.ok(errors.some((error) => error.includes("Semgrep 1.170.0")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#524 Renovate owns the exact zizmor pin", () => {
  const root = createFixture();
  try {
    const renovatePath = path.join(root, "renovate.json");
    const renovate = JSON.parse(readFileSync(renovatePath, "utf8"));
    renovate.customManagers = (renovate.customManagers ?? []).filter(
      (manager) => !JSON.stringify(manager).includes("zizmor"),
    );
    writeFileSync(renovatePath, `${JSON.stringify(renovate, null, 2)}\n`);
    const errors = validateSecurityTooling(root);
    assert.ok(errors.some((error) => error.includes("Renovate")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#524 security documentation rejects the yanked zizmor release", () => {
  const root = createFixture();
  try {
    replaceInFixture(
      root,
      "docs/security.md",
      "zizmor 1.28.0",
      "zizmor 1.27.0",
    );
    const errors = validateSecurityTooling(root);
    assert.ok(errors.some((error) => error.includes("yanked zizmor 1.27.0")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#508 security workflow must run all scanners in the required security job", () => {
  const root = createFixture();
  try {
    replaceInFixture(
      root,
      ".github/workflows/security.yml",
      "corepack pnpm run security:workflows",
      "echo skipped-workflow-scanners",
    );
    replaceInFixture(
      root,
      ".github/workflows/security.yml",
      "corepack pnpm run security:semgrep",
      "echo skipped-semgrep",
    );
    const errors = validateSecurityTooling(root);
    assert.ok(errors.some((error) => error.includes("security:workflows")));
    assert.ok(errors.some((error) => error.includes("security:semgrep")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#508 Semgrep stays repository-owned and does not duplicate broad SAST or secrets", () => {
  const root = createFixture();
  try {
    const configPath = path.join(root, ".semgrep/semgrep.yml");
    writeFileSync(
      configPath,
      `${readFileSync(configPath, "utf8")}\n- p/security-audit\n- p/secrets\n`,
    );
    const errors = validateSecurityTooling(root);
    assert.ok(errors.some((error) => error.includes("repository-owned")));
    assert.ok(errors.some((error) => error.includes("secret scanning")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#508 Semgrep rule fixtures cannot be ignored or silently removed", () => {
  const root = createFixture();
  try {
    const ignorePath = path.join(root, ".semgrepignore");
    writeFileSync(
      ignorePath,
      `${readFileSync(ignorePath, "utf8")}\n.semgrep/semgrep.ts\n`,
    );
    replaceInFixture(
      root,
      ".semgrep/semgrep.ts",
      "// ruleid: kicad.no-sensitive-console-logging\n",
      "",
    );
    const errors = validateSecurityTooling(root);
    assert.ok(errors.some((error) => error.includes("must not hide")));
    assert.ok(errors.some((error) => error.includes("fixtures must exercise")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#555 every setup-uv action pins the repository uv version", () => {
  const root = createFixture();
  try {
    replaceInFixture(
      root,
      ".github/workflows/cross-repo-compatibility.yml",
      `          version: ${UV_VERSION}\n`,
      "          version: latest\n",
    );
    replaceInFixture(
      root,
      ".github/workflows/docs.yml",
      `          version: ${UV_VERSION}\n`,
      "",
    );
    const errors = validateSecurityTooling(root);
    for (const workflow of ["cross-repo-compatibility.yml", "docs.yml"]) {
      assert.ok(
        errors.some(
          (error) =>
            error.includes(workflow) && error.includes(`uv ${UV_VERSION}`),
        ),
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#508 scanner downloads and uvx execution stay fail-closed", () => {
  const root = createFixture();
  try {
    replaceInFixture(
      root,
      ".github/workflows/security.yml",
      "--proto '=https' --proto-redir '=https'",
      "--location",
    );
    replaceInFixture(
      root,
      "apps/vscode-extension/scripts/local-security.sh",
      "uvx --no-build --from pre-commit==4.6.0 pre-commit",
      "uvx --from pre-commit==4.6.0 pre-commit",
    );
    replaceInFixture(
      root,
      "apps/vscode-extension/scripts/local-security.ps1",
      "uvx --no-build --from pre-commit==4.6.0 pre-commit",
      "uvx --from pre-commit==4.6.0 pre-commit",
    );
    const errors = validateSecurityTooling(root);
    assert.ok(errors.some((error) => error.includes("redirects to HTTPS")));
    assert.ok(errors.some((error) => error.includes("uvx --no-build")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#508 fast pre-commit hook set cannot silently shrink", () => {
  const root = createFixture();
  try {
    replaceInFixture(
      root,
      ".pre-commit-config.yaml",
      "      - id: check-toml\n",
      "",
    );
    replaceInFixture(
      root,
      ".pre-commit-config.yaml",
      "      - id: mixed-line-ending\n        args: [--fix=no]\n",
      "",
    );
    const errors = validateSecurityTooling(root);
    assert.ok(errors.some((error) => error.includes("check-toml")));
    assert.ok(errors.some((error) => error.includes("mixed-line-ending")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#508 root check wiring cannot disappear", () => {
  const root = createFixture();
  try {
    const packagePath = path.join(root, "package.json");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
    delete packageJson.scripts["check:security-tooling"];
    packageJson.scripts.check = packageJson.scripts.check.replace(
      " && pnpm run check:security-tooling",
      "",
    );
    writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
    const errors = validateSecurityTooling(root);
    assert.ok(errors.some((error) => error.includes("root check")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
