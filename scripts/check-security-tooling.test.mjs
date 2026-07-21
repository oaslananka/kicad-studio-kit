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

import { validateSecurityTooling } from "./check-security-tooling.mjs";

const RELEVANT_FILES = [
  ".github/workflows/security.yml",
  ".github/zizmor.yml",
  ".pre-commit-config.yaml",
  ".semgrepignore",
  ".semgrep/semgrep.yml",
  ".semgrep/semgrep.ts",
  "package.json",
];

function createFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "kicad-security-tooling-"));
  for (const relativePath of RELEVANT_FILES) {
    const source = path.resolve(relativePath);
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

test("#508 repository security-tooling policy is complete", () => {
  assert.deepEqual(validateSecurityTooling(), []);
});

test("#508 exact scanner versions cannot drift", () => {
  const root = createFixture();
  try {
    replaceInFixture(root, "package.json", "zizmor==1.27.0", "zizmor==latest");
    replaceInFixture(root, "package.json", "semgrep==1.170.0", "semgrep");
    const errors = validateSecurityTooling(root);
    assert.ok(errors.some((error) => error.includes("zizmor 1.27.0")));
    assert.ok(errors.some((error) => error.includes("Semgrep 1.170.0")));
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
