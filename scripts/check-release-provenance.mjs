#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { exit } from "node:process";
import { parse as parseYaml } from "yaml";

const files = {
  rootPackage: "package.json",
  releasePlease: "release-please-config.json",
  releasePleaseWorkflow: ".github/workflows/release-please.yml",
  publishExtension: ".github/workflows/publish-extension.yml",
  crossRepoCompatibility: ".github/workflows/cross-repo-compatibility.yml",
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
  const workflow = parseYaml(extension);
  const releasePleaseWorkflow = read(files.releasePleaseWorkflow);
  const crossRepoCompatibility = read(files.crossRepoCompatibility);
  const publishVscode = workflow.jobs?.publish_vscode;
  const publishOpenvsx = workflow.jobs?.publish_openvsx;
  const openvsxNeeds = Array.isArray(publishOpenvsx?.needs)
    ? publishOpenvsx.needs
    : [publishOpenvsx?.needs].filter(Boolean);

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
  expectIncludes(
    extension,
    "inputs.release_tag != ''",
    "extension workflow",
    failures,
  );
  expectIncludes(
    extension,
    "ref: ${{ inputs.release_tag || github.event.release.tag_name || github.ref }}",
    "extension workflow",
    failures,
  );
  expectIncludes(
    extension,
    "needs.publish_vscode.result == 'success'",
    "extension workflow",
    failures,
  );
  expect(
    publishVscode?.["continue-on-error"] !== true,
    "Visual Studio Marketplace publish must fail the workflow on errors",
    failures,
  );
  expect(
    openvsxNeeds.includes("publish_vscode"),
    "Open VSX publish must wait for Visual Studio Marketplace",
    failures,
  );
  expect(
    !extension.includes("publish likely succeeded but indexing is delayed"),
    "post-publish verification must fail closed instead of masking missing registry versions",
    failures,
  );
  expectIncludes(
    releasePleaseWorkflow,
    "gh workflow run publish-extension.yml",
    "release-please workflow",
    failures,
  );
  expectIncludes(
    crossRepoCompatibility,
    "validateProtocolPayload",
    "cross-repo compatibility workflow",
    failures,
  );
  expect(
    !crossRepoCompatibility.includes("pypi_version=not-found"),
    "cross-repo compatibility workflow must fail when PyPI smoke validation fails",
    failures,
  );
  expect(
    !crossRepoCompatibility.includes("2>&1 || true"),
    "cross-repo compatibility workflow must not mask published artifact failures",
    failures,
  );
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
