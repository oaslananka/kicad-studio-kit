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

import { validateTrivyDevcontainerPolicy } from "./check-trivy-devcontainer.mjs";

const RELEVANT_FILES = [
  ".github/workflows/security.yml",
  "apps/vscode-extension/Taskfile.yml",
  "docs/security.md",
  "package.json",
  "renovate.json",
];

function createFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "kicad-trivy-policy-"));
  for (const relativePath of RELEVANT_FILES) {
    const target = path.join(root, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(relativePath, target);
  }
  return root;
}

function replaceInFixture(root, relativePath, before, after) {
  const filePath = path.join(root, relativePath);
  const source = readFileSync(filePath, "utf8");
  assert.ok(source.includes(before), `${relativePath} must contain ${before}`);
  writeFileSync(filePath, source.replace(before, after));
}

function withFixture(run) {
  const root = createFixture();
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("#512 targeted Trivy devcontainer policy is complete", () => {
  assert.deepEqual(validateTrivyDevcontainerPolicy(), []);
});

test("#512 Trivy action and scanner versions remain immutable", () => {
  withFixture((root) => {
    replaceInFixture(
      root,
      ".github/workflows/security.yml",
      "aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25",
      "aquasecurity/trivy-action@v0.36.0",
    );
    replaceInFixture(
      root,
      ".github/workflows/security.yml",
      "TRIVY_VERSION: v0.72.0",
      "TRIVY_VERSION: latest",
    );
    const errors = validateTrivyDevcontainerPolicy(root);
    assert.ok(errors.some((error) => error.includes("immutable Trivy action")));
    assert.ok(errors.some((error) => error.includes("Trivy v0.72.0")));
  });
});

test("#512 scan scope cannot widen beyond devcontainer configuration", () => {
  withFixture((root) => {
    replaceInFixture(
      root,
      ".github/workflows/security.yml",
      "scan-type: config",
      "scan-type: fs",
    );
    replaceInFixture(
      root,
      ".github/workflows/security.yml",
      "scan-ref: .devcontainer",
      "scan-ref: .",
    );
    const errors = validateTrivyDevcontainerPolicy(root);
    assert.ok(errors.some((error) => error.includes("configuration scanner")));
    assert.ok(errors.some((error) => error.includes("only .devcontainer")));
  });
});

test("#512 HIGH and CRITICAL findings fail only after evidence upload", () => {
  withFixture((root) => {
    replaceInFixture(
      root,
      ".github/workflows/security.yml",
      "severity: HIGH,CRITICAL",
      "severity: CRITICAL",
    );
    replaceInFixture(
      root,
      ".github/workflows/security.yml",
      "continue-on-error: true",
      "continue-on-error: false",
    );
    replaceInFixture(
      root,
      ".github/workflows/security.yml",
      "steps.trivy-devcontainer.outcome == 'failure'",
      "false",
    );
    const errors = validateTrivyDevcontainerPolicy(root);
    assert.ok(errors.some((error) => error.includes("HIGH,CRITICAL")));
    assert.ok(errors.some((error) => error.includes("defer failure")));
    assert.ok(
      errors.some((error) => error.includes("fail the required security job")),
    );
  });
});

test("#512 SARIF evidence and fork-safe upload cannot disappear", () => {
  withFixture((root) => {
    replaceInFixture(
      root,
      ".github/workflows/security.yml",
      "format: sarif",
      "format: table",
    );
    replaceInFixture(
      root,
      ".github/workflows/security.yml",
      "github.event.pull_request.head.repo.full_name == github.repository",
      "true",
    );
    const errors = validateTrivyDevcontainerPolicy(root);
    assert.ok(errors.some((error) => error.includes("SARIF")));
    assert.ok(errors.some((error) => error.includes("fork-safe")));
  });
});

test("#512 Trivy cannot duplicate vulnerability, dependency, license, or secret scanning", () => {
  withFixture((root) => {
    const workflowPath = path.join(root, ".github/workflows/security.yml");
    writeFileSync(
      workflowPath,
      `${readFileSync(workflowPath, "utf8")}\n# scanners: vuln,secret,license\n`,
    );
    const errors = validateTrivyDevcontainerPolicy(root);
    assert.ok(errors.some((error) => error.includes("must not duplicate")));
  });
});

test("#512 local command, documentation, root check, and Renovate ownership remain wired", () => {
  withFixture((root) => {
    const packagePath = path.join(root, "package.json");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
    delete packageJson.scripts["security:trivy-devcontainer"];
    packageJson.scripts.check = packageJson.scripts.check.replace(
      " && pnpm run check:trivy-devcontainer",
      "",
    );
    writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
    replaceInFixture(root, "docs/security.md", "Trivy v0.72.0", "Trivy");
    const renovatePath = path.join(root, "renovate.json");
    const renovate = JSON.parse(readFileSync(renovatePath, "utf8"));
    renovate.customManagers = [];
    writeFileSync(renovatePath, `${JSON.stringify(renovate, null, 2)}\n`);
    const errors = validateTrivyDevcontainerPolicy(root);
    assert.ok(errors.some((error) => error.includes("root check")));
    assert.ok(errors.some((error) => error.includes("local Trivy command")));
    assert.ok(errors.some((error) => error.includes("document Trivy v0.72.0")));
    assert.ok(errors.some((error) => error.includes("Renovate")));
  });
});
