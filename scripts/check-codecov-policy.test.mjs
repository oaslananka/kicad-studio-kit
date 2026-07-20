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

import { validateCodecovPolicy } from "./check-codecov-policy.mjs";

const RELEVANT_FILES = [
  ".github/workflows/ci.yml",
  "apps/vscode-extension/.gitignore",
  "apps/vscode-extension/jest.config.js",
  "apps/vscode-extension/package.json",
  "apps/vscode-extension/webpack.config.js",
  "codecov.yml",
  "docs/testing-strategy.md",
  "package.json",
];

function createFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "kicad-codecov-policy-"));
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
  assert.ok(
    source.includes(before),
    `${relativePath} fixture must contain ${before}`,
  );
  writeFileSync(filePath, source.replace(before, after));
}

test("#511 current repository satisfies the Codecov observability contract", () => {
  assert.deepEqual(validateCodecovPolicy(), []);
});

test("#511 immutable Codecov action pins cannot drift", () => {
  const root = createFixture();
  try {
    replaceInFixture(
      root,
      ".github/workflows/ci.yml",
      "codecov/codecov-action@fb8b3582c8e4def4969c97caa2f19720cb33a72f",
      "codecov/codecov-action@0000000000000000000000000000000000000000",
    );
    assert.ok(
      validateCodecovPolicy(root).includes(
        "ci.yml must pin codecov/codecov-action v7.0.0 to fb8b3582c8e4def4969c97caa2f19720cb33a72f",
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#511 fork guards and failed-test reporting are mandatory", () => {
  const root = createFixture();
  try {
    replaceInFixture(
      root,
      ".github/workflows/ci.yml",
      "github.event.pull_request.head.repo.full_name == github.repository",
      "true",
    );
    replaceInFixture(
      root,
      ".github/workflows/ci.yml",
      "!cancelled() && matrix.os == 'ubuntu-24.04'",
      "matrix.os == 'ubuntu-24.04'",
    );
    const errors = validateCodecovPolicy(root);
    assert.ok(
      errors.includes(
        "ci.yml must skip token-backed Codecov work for fork pull requests",
      ),
    );
    assert.ok(
      errors.includes(
        "ci.yml must retain Ubuntu reports with !cancelled() failed-test semantics",
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#511 bundle analysis remains opt-in and telemetry-free", () => {
  const root = createFixture();
  try {
    replaceInFixture(
      root,
      "apps/vscode-extension/webpack.config.js",
      "environment.CODECOV_BUNDLE_ANALYSIS === 'true'",
      "true",
    );
    replaceInFixture(
      root,
      "apps/vscode-extension/webpack.config.js",
      "telemetry: false",
      "telemetry: true",
    );
    const errors = validateCodecovPolicy(root);
    assert.ok(
      errors.includes(
        "webpack bundle analysis must require CODECOV_BUNDLE_ANALYSIS=true",
      ),
    );
    assert.ok(
      errors.includes("Codecov bundle plugin telemetry must stay disabled"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#511 Codecov statuses remain informational during baseline establishment", () => {
  const root = createFixture();
  try {
    replaceInFixture(
      root,
      "codecov.yml",
      "informational: true",
      "informational: false",
    );
    const errors = validateCodecovPolicy(root);
    assert.ok(
      errors.some((error) =>
        error.includes("coverage status must be informational"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#511 root check wiring cannot silently disappear", () => {
  const root = createFixture();
  try {
    const packagePath = path.join(root, "package.json");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
    delete packageJson.scripts["check:codecov"];
    writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
    assert.ok(
      validateCodecovPolicy(root).includes(
        "package.json must expose check:codecov and compose it into the root check",
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
