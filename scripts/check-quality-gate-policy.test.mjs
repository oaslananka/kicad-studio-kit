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

import { validateQualityGatePolicy } from "./check-quality-gate-policy.mjs";

const FILES = [
  ".github/quality-gates.json",
  ".github/rulesets/main.json",
  "codecov.yml",
  "sonar-project.properties",
  "docs/architecture/branch-protection.md",
  "package.json",
];

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "kicad-quality-gates-"));
  for (const relativePath of FILES) {
    const target = path.join(root, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(relativePath, target);
  }
  const workflowRoot = path.join(root, ".github/workflows");
  mkdirSync(workflowRoot, { recursive: true });
  for (const name of ["ci.yml", "security.yml", "sonarcloud.yml"]) {
    cpSync(path.join(".github/workflows", name), path.join(workflowRoot, name));
  }
  return root;
}

function mutateJson(root, relativePath, mutate) {
  const filePath = path.join(root, relativePath);
  const value = JSON.parse(readFileSync(filePath, "utf8"));
  mutate(value);
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

test("#627 repository quality-gate policy is complete", () => {
  assert.deepEqual(validateQualityGatePolicy(), []);
});

test("#627 required checks cannot drift from branch protection", () => {
  const root = fixture();
  try {
    mutateJson(root, ".github/quality-gates.json", (policy) =>
      policy.requiredChecks.pop(),
    );
    assert.match(
      validateQualityGatePolicy(root).join("\n"),
      /requiredChecks.*ruleset/iu,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#627 Sonar and Mergify cannot silently become merge authorities", () => {
  const root = fixture();
  try {
    mutateJson(root, ".github/quality-gates.json", (policy) => {
      policy.externalSignals.sonarCloud.required = true;
      policy.externalSignals.mergify.required = true;
    });
    const errors = validateQualityGatePolicy(root).join("\n");
    assert.match(errors, /SonarCloud.*advisory/iu);
    assert.match(errors, /Mergify.*merge authority/iu);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#627 Codecov statuses stay informational", () => {
  const root = fixture();
  try {
    const filePath = path.join(root, "codecov.yml");
    writeFileSync(
      filePath,
      readFileSync(filePath, "utf8").replace(
        "informational: true",
        "informational: false",
      ),
    );
    assert.match(
      validateQualityGatePolicy(root).join("\n"),
      /Codecov.*informational/iu,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#627 redundant owner aliases fail closed", () => {
  const root = fixture();
  try {
    const filePath = path.join(root, ".github/workflows/ci.yml");
    writeFileSync(
      filePath,
      `${readFileSync(filePath, "utf8")}\n# github.repository_owner == 'legacy-owner'\n`,
    );
    assert.match(
      validateQualityGatePolicy(root).join("\n"),
      /redundant repository-owner guard/iu,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#627 root quality-gate check cannot silently disappear", () => {
  const root = fixture();
  try {
    mutateJson(root, "package.json", (packageJson) => {
      delete packageJson.scripts["check:quality-gates"];
    });
    assert.match(
      validateQualityGatePolicy(root).join("\n"),
      /package\.json.*check:quality-gates/iu,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#706 CI-based Sonar coverage settings cannot drift", () => {
  const root = fixture();
  try {
    const filePath = path.join(root, "sonar-project.properties");
    writeFileSync(
      filePath,
      readFileSync(filePath, "utf8").replace(
        "sonar.javascript.lcov.reportPaths=apps/vscode-extension/coverage/lcov.info",
        "sonar.javascript.lcov.reportPaths=missing/lcov.info",
      ),
    );
    assert.match(
      validateQualityGatePolicy(root).join("\n"),
      /SonarCloud sonar.javascript.lcov.reportPaths/iu,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#706 Sonar workflow refuses unguarded token use on fork PRs", () => {
  const root = fixture();
  try {
    const filePath = path.join(root, ".github/workflows/sonarcloud.yml");
    writeFileSync(
      filePath,
      readFileSync(filePath, "utf8").replace(
        "github.event.pull_request.head.repo.full_name == github.repository",
        "true",
      ),
    );
    assert.match(
      validateQualityGatePolicy(root).join("\n"),
      /SonarCloud CI coverage must be read-only and fork guarded/iu,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#706 Sonar scanner pins an immutable action SHA", () => {
  const root = fixture();
  try {
    const filePath = path.join(root, ".github/workflows/sonarcloud.yml");
    writeFileSync(
      filePath,
      readFileSync(filePath, "utf8").replace(
        /sonarqube-scan-action@[a-f0-9]{40}/u,
        "sonarqube-scan-action@v8",
      ),
    );
    assert.match(
      validateQualityGatePolicy(root).join("\n"),
      /SonarCloud scanner must pin a commit/iu,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#706 Sonar requires generated Jest coverage", () => {
  const root = fixture();
  try {
    const filePath = path.join(root, ".github/workflows/sonarcloud.yml");
    writeFileSync(
      filePath,
      readFileSync(filePath, "utf8").replace("test:unit:coverage", "test:unit"),
    );
    assert.match(
      validateQualityGatePolicy(root).join("\n"),
      /SonarCloud must generate actual Jest unit LCOV/iu,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#706 Sonar workflow must normalize Jest's app-relative LCOV paths", () => {
  const root = fixture();
  try {
    const filePath = path.join(root, ".github/workflows/sonarcloud.yml");
    writeFileSync(
      filePath,
      readFileSync(filePath, "utf8").replace(
        "node scripts/prepare-sonar-lcov.mjs",
        "echo skip",
      ),
    );
    assert.match(
      validateQualityGatePolicy(root).join("\n"),
      /SonarCloud must normalize real Jest LCOV source paths/iu,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#706 Sonar must classify script tests outside production sources", () => {
  const root = fixture();
  try {
    const filename = path.join(root, "sonar-project.properties");
    writeFileSync(
      filename,
      readFileSync(filename, "utf8").replace(
        "sonar.test.inclusions=",
        "sonar.missing.test.inclusions=",
      ),
    );
    assert.match(
      validateQualityGatePolicy(root).join("\n"),
      /SonarCloud must classify VS Code and script tests separately/iu,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#706 Sonar must generate actual script LCOV through c8", () => {
  const root = fixture();
  try {
    const filePath = path.join(root, ".github/workflows/sonarcloud.yml");
    writeFileSync(
      filePath,
      readFileSync(filePath, "utf8").replace(
        "require.resolve('c8/bin/c8.js')",
        "undefined",
      ),
    );
    assert.match(
      validateQualityGatePolicy(root).join("\n"),
      /SonarCloud must discover the pnpm-pinned c8 CLI/iu,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#706 Sonar must classify extension script test files, not production code", () => {
  const root = fixture();
  try {
    const filename = path.join(root, "sonar-project.properties");
    writeFileSync(
      filename,
      readFileSync(filename, "utf8").replace(
        "apps/vscode-extension/scripts/**/*.test.mjs",
        "apps/vscode-extension/scripts/**/*.test.invalid",
      ),
    );
    assert.match(
      validateQualityGatePolicy(root).join("\n"),
      /SonarCloud must classify VS Code and script tests separately/iu,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#721 Sonar must execute governance and baseline-policy tests for changed repository scripts", () => {
  const workflow = readFileSync(".github/workflows/sonarcloud.yml", "utf8");
  for (const testPath of [
    "scripts/check-branch-protection-gates.test.mjs",
    "scripts/check-codecov-policy.test.mjs",
    "scripts/check-pnpm-supply-chain.test.mjs",
  ]) {
    assert.match(workflow, new RegExp(testPath.replaceAll(".", "\\."), "u"));
  }
});

test("#706 Sonar must execute existing compatibility and release tests for real script coverage", () => {
  const root = fixture();
  try {
    const file = path.join(root, ".github/workflows/sonarcloud.yml");
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace(
        "scripts/check-compatibility-contract.test.mjs",
        "scripts/skip-compatibility.test.mjs",
      ),
    );
    assert.match(
      validateQualityGatePolicy(root).join("\n"),
      /SonarCloud must discover the pnpm-pinned c8 CLI/iu,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#706 Sonar CSV properties tolerate insignificant whitespace", () => {
  const root = fixture();
  try {
    const filename = path.join(root, "sonar-project.properties");
    const original = readFileSync(filename, "utf8");
    writeFileSync(
      filename,
      original
        .replace(
          "sonar.tests=apps/vscode-extension/test,apps/vscode-extension/scripts,packages/kicad-fixtures/test,packages/test-harness/test,scripts",
          "sonar.tests=apps/vscode-extension/test, apps/vscode-extension/scripts, packages/kicad-fixtures/test, packages/test-harness/test, scripts",
        )
        .replace(
          "sonar.test.inclusions=apps/vscode-extension/test/**/*.ts,apps/vscode-extension/test/**/*.js,apps/vscode-extension/test/**/*.mjs,apps/vscode-extension/test/**/*.tsx,packages/kicad-fixtures/test/**/*.ts,packages/kicad-fixtures/test/**/*.js,packages/test-harness/test/**/*.ts,packages/test-harness/test/**/*.js,scripts/**/*.test.mjs,apps/vscode-extension/scripts/**/*.test.mjs",
          "sonar.test.inclusions=apps/vscode-extension/test/**/*.ts, apps/vscode-extension/test/**/*.js, apps/vscode-extension/test/**/*.mjs, apps/vscode-extension/test/**/*.tsx, packages/kicad-fixtures/test/**/*.ts, packages/kicad-fixtures/test/**/*.js, packages/test-harness/test/**/*.ts, packages/test-harness/test/**/*.js, scripts/**/*.test.mjs, apps/vscode-extension/scripts/**/*.test.mjs",
        ),
    );
    assert.equal(
      validateQualityGatePolicy(root).filter((error) =>
        error.includes("classify VS Code and script tests separately"),
      ).length,
      0,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#710 Sonar must execute the marketplace checker test for extension-script coverage", () => {
  const root = fixture();
  try {
    const file = path.join(root, ".github/workflows/sonarcloud.yml");
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace(
        "apps/vscode-extension/scripts/check-marketplace-assets.test.mjs",
        "apps/vscode-extension/scripts/skip-marketplace.test.mjs",
      ),
    );
    assert.match(
      validateQualityGatePolicy(root).join("\n"),
      /instrument repository and marketplace scripts/iu,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#710 Sonar must verify marketplace checker LCOV before upload", () => {
  const root = fixture();
  try {
    const file = path.join(root, ".github/workflows/sonarcloud.yml");
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace(
        "SF:apps/vscode-extension/scripts/check-marketplace-assets.js",
        "SF:apps/vscode-extension/scripts/missing-marketplace-checker.js",
      ),
    );
    assert.match(
      validateQualityGatePolicy(root).join("\n"),
      /verify marketplace and changed repository-policy LCOV/iu,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#710 Sonar marketplace checker coverage must run mutation tests serially", () => {
  const root = fixture();
  try {
    const file = path.join(root, ".github/workflows/sonarcloud.yml");
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace(
        "--test-concurrency=1",
        "--test-concurrency=4",
      ),
    );
    assert.match(
      validateQualityGatePolicy(root).join("\n"),
      /instrument repository and marketplace scripts/iu,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
