import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validateDependabotPolicy } from "./check-dependabot-policy.mjs";
import { scanForbiddenReferences } from "./check-no-forbidden-refs.mjs";

const RELEVANT_FILES = [
  ".github/dependabot.yml",
  ".github/retired-dependency-manifests.json",
  "docs/security.md",
  "docs/dependency-lifecycle.md",
  "package.json",
  "renovate.json",
];

function createFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "kicad-dependabot-policy-"));
  for (const relativePath of RELEVANT_FILES) {
    const target = path.join(root, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    try {
      cpSync(relativePath, target);
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

test("#520 repository Dependabot security-target policy is complete", () => {
  assert.deepEqual(validateDependabotPolicy(), []);
});

test("#520 only active root npm and GitHub Actions ecosystems are configured", () => {
  const root = createFixture();
  try {
    const configPath = path.join(root, ".github/dependabot.yml");
    const config = readFileSync(configPath, "utf8");
    writeFileSync(
      configPath,
      `${config}\n  - package-ecosystem: uv\n    directory: /packages/mcp-server\n    schedule:\n      interval: weekly\n    open-pull-requests-limit: 0\n`,
    );
    const errors = validateDependabotPolicy(root);
    assert.ok(
      errors.some((error) => error.includes("exactly npm and github-actions")),
    );
    assert.ok(errors.some((error) => error.includes("retired MCP")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#520 workflow-security cooldown policy cannot drift", () => {
  const root = createFixture();
  try {
    replaceInFixture(
      root,
      ".github/dependabot.yml",
      "default-days: 7",
      "default-days: 1",
    );
    const errors = validateDependabotPolicy(root);
    assert.ok(errors.some((error) => error.includes("seven-day cooldown")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#520 routine Dependabot version updates cannot be re-enabled", () => {
  const root = createFixture();
  try {
    replaceInFixture(
      root,
      ".github/dependabot.yml",
      "open-pull-requests-limit: 0",
      "open-pull-requests-limit: 5",
    );
    const errors = validateDependabotPolicy(root);
    assert.ok(errors.some((error) => error.includes("security-only")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#520 security update PR ownership metadata cannot drift", () => {
  const root = createFixture();
  try {
    replaceInFixture(
      root,
      ".github/dependabot.yml",
      '      - "security"',
      '      - "routine"',
    );
    replaceInFixture(
      root,
      ".github/dependabot.yml",
      '      - "oaslananka"',
      '      - "nobody"',
    );
    replaceInFixture(
      root,
      ".github/dependabot.yml",
      'applies-to: "security-updates"',
      'applies-to: "version-updates"',
    );
    const errors = validateDependabotPolicy(root);
    assert.ok(errors.some((error) => error.includes("security labels")));
    assert.ok(errors.some((error) => error.includes("oaslananka")));
    assert.ok(errors.some((error) => error.includes("security-updates group")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#520 Renovate remains the routine dependency-update authority", () => {
  const root = createFixture();
  try {
    replaceInFixture(
      root,
      "renovate.json",
      '"dependencyDashboard": true',
      '"dependencyDashboard": false',
    );
    const errors = validateDependabotPolicy(root);
    assert.ok(errors.some((error) => error.includes("Renovate")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#520 root check and security documentation wiring cannot disappear", () => {
  const root = createFixture();
  try {
    const packagePath = path.join(root, "package.json");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
    delete packageJson.scripts["check:dependabot-policy"];
    packageJson.scripts.check = packageJson.scripts.check.replace(
      " && pnpm run check:dependabot-policy",
      "",
    );
    writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
    replaceInFixture(
      root,
      "docs/security.md",
      "Dependabot is security-only for the active root npm and GitHub Actions surfaces",
      "Dependabot policy omitted",
    );
    const errors = validateDependabotPolicy(root);
    assert.ok(errors.some((error) => error.includes("root check")));
    assert.ok(errors.some((error) => error.includes("docs/security.md")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#520 forbidden-reference scanner rejects Dependabot outside approved policy files", () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "kicad-forbidden-dependabot-"),
  );
  try {
    mkdirSync(path.join(root, "docs"), { recursive: true });
    writeFileSync(
      path.join(root, "docs/security.md"),
      "Dependabot security policy is documented here.\n",
    );
    assert.deepEqual(scanForbiddenReferences(root), []);

    writeFileSync(
      path.join(root, "README.md"),
      "Dependabot should not appear here.\n",
    );
    const hits = scanForbiddenReferences(root);
    assert.ok(
      hits.some(
        (hit) =>
          hit.file === "README.md" &&
          hit.line === 1 &&
          hit.pattern === "dependabot",
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
