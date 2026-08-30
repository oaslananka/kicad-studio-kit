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
  for (const name of ["ci.yml", "security.yml"]) {
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
