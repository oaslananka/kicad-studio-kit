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

function activateBundleFixture() {
  const root = createFixture();
  const docsPath = path.join(root, "docs/testing-strategy.md");
  const docs = readFileSync(docsPath, "utf8");
  if (
    !docs.includes("kicad-studio-vscode-extension") ||
    !docs.includes("fails closed")
  ) {
    writeFileSync(
      docsPath,
      `${docs}\nBundle Analysis uses the stable bundle name kicad-studio-vscode-extension and fails closed without a successful upload confirmation.\n`,
    );
  }
  return root;
}

test("#514 activated fixture satisfies the Codecov bundle contract", () => {
  const root = activateBundleFixture();
  try {
    assert.deepEqual(validateCodecovPolicy(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#514 exact bundle dependency pin cannot disappear", () => {
  const root = activateBundleFixture();
  try {
    const packagePath = path.join(root, "apps/vscode-extension/package.json");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
    delete packageJson.devDependencies["@codecov/webpack-plugin"];
    writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
    assert.ok(
      validateCodecovPolicy(root).includes(
        "extension devDependencies must pin @codecov/webpack-plugin 2.0.1",
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#514 immutable Codecov action pins cannot drift", () => {
  const root = activateBundleFixture();
  try {
    replaceInFixture(
      root,
      ".github/workflows/ci.yml",
      "codecov/codecov-action@fb8b3582c8e4def4969c97caa2f19720cb33a72f",
      "codecov/codecov-action@0000000000000000000000000000000000000000",
    );
    assert.ok(
      validateCodecovPolicy(root).includes(
        "ci.yml must pin both coverage and test-result uploads to codecov/codecov-action v7.0.0 commit fb8b3582c8e4def4969c97caa2f19720cb33a72f",
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#514 fork guards and failed-test reporting are mandatory", () => {
  const root = activateBundleFixture();
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

test("#514 bundle upload context and success confirmation are mandatory", () => {
  const root = activateBundleFixture();
  try {
    replaceInFixture(
      root,
      ".github/workflows/ci.yml",
      "CODECOV_BUNDLE_SHA: ${{ github.event.pull_request.head.sha || github.sha }}",
      "CODECOV_BUNDLE_SHA: ''",
    );
    replaceInFixture(
      root,
      ".github/workflows/ci.yml",
      "Successfully uploaded stats for bundle: kicad-studio-vscode-extension",
      "bundle upload completed",
    );
    const errors = validateCodecovPolicy(root);
    assert.ok(
      errors.includes(
        "ci.yml must pass explicit branch, PR, SHA, and slug context to Bundle Analysis",
      ),
    );
    assert.ok(
      errors.includes(
        "ci.yml must fail unless the stable Codecov bundle upload is positively confirmed",
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#514 bundle plugin remains opt-in and telemetry-free", () => {
  const root = activateBundleFixture();
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
        "webpack bundle analysis must require CODECOV_BUNDLE_ANALYSIS=true and a non-empty token",
      ),
    );
    assert.ok(
      errors.includes("Codecov bundle plugin telemetry must stay disabled"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#514 Codecov statuses remain informational", () => {
  const root = activateBundleFixture();
  try {
    replaceInFixture(
      root,
      "codecov.yml",
      "status: informational",
      "status: success",
    );
    const errors = validateCodecovPolicy(root);
    assert.ok(
      errors.some((error) => error.includes("must remain informational")),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#514 root check wiring cannot silently disappear", () => {
  const root = activateBundleFixture();
  try {
    const packagePath = path.join(root, "package.json");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
    delete packageJson.scripts["check:codecov"];
    writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
    assert.ok(
      validateCodecovPolicy(root).includes(
        "package.json must expose check:codecov, include the Webpack contract test, and compose it into the root check",
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
