#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { exit } from "node:process";

const files = {
  rootPackage: "package.json",
  releasePlease: "release-please-config.json",
  publishExtension: ".github/workflows/publish-extension.yml",
  docsRelease: "docs/release.md",
  docsPublishing: "docs/publishing.md",
};

function read(path) {
  return readFileSync(path, "utf8");
}

function readJson(path) {
  return JSON.parse(read(path));
}

function expect(condition, message, failures) {
  if (!condition) failures.push(message);
}

function expectIncludes(content, needle, label, failures) {
  expect(content.includes(needle), `${label} must include ${needle}`, failures);
}

function checkPackageNames(failures) {
  const rootPackage = readJson(files.rootPackage);
  const releasePlease = readJson(files.releasePlease);
  expect(
    rootPackage.private === true,
    "root package must remain private",
    failures,
  );
}

function checkWorkflowEvidence(failures) {
  const extension = read(files.publishExtension);
  expectIncludes(
    extension,
    "sha256sum --check",
    "extension workflow",
    failures,
  );
  expectIncludes(
    extension,
    "gh release upload",
    "extension workflow",
    failures,
  );
  expectIncludes(
    extension,
    "attestations: write",
    "extension workflow",
    failures,
  );
  expectIncludes(extension, "actions/attest@", "extension workflow", failures);
  expectIncludes(
    extension,
    "release-assets/vscode-extension",
    "extension workflow",
    failures,
  );
  expectIncludes(
    extension,
    "scripts/validate-vsix-metadata.js",
    "extension workflow",
    failures,
  );
  expectIncludes(
    extension,
    'VSIX_DIR="$GITHUB_WORKSPACE/release-assets/vscode-extension"',
    "extension workflow",
    failures,
  );
  expectIncludes(
    extension,
    'OPENVSX_VERIFY_DIR="$GITHUB_WORKSPACE/release-assets/openvsx-verify"',
    "extension workflow",
    failures,
  );
  expectIncludes(
    extension,
    "vsce show oaslananka.kicadstudiokit --json",
    "extension workflow",
    failures,
  );
  expectIncludes(
    extension,
    "ovsx get oaslananka.kicadstudiokit",
    "extension workflow",
    failures,
  );
  expectIncludes(extension, "--packagePath", "extension workflow", failures);
}

function checkDocs(failures) {
  const release = read(files.docsRelease);
  const publishing = read(files.docsPublishing);
  for (const surface of ["VSIX"]) {
    expectIncludes(release, surface, "release docs", failures);
  }
  for (const registry of ["Visual Studio Marketplace", "Open VSX"]) {
    expectIncludes(publishing, registry, "publishing docs", failures);
  }
  expectIncludes(
    publishing,
    "Rollback and re-publish policy",
    "publishing docs",
    failures,
  );
}

const failures = [];
checkPackageNames(failures);
checkWorkflowEvidence(failures);
checkDocs(failures);

if (failures.length > 0) {
  console.error("Release provenance check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  exit(1);
}

console.log("Release provenance check passed.");
