#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const TRIVY_ACTION_SHA = "ed142fd0673e97e23eac54620cfb913e5ce36c25";
const CODEQL_ACTION_SHA = "8aad20d150bbac5944a9f9d289da16a4b0d87c1e";
const UPLOAD_ARTIFACT_SHA = "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a";
const TRIVY_VERSION = "v0.72.0";

function readText(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(root, relativePath) {
  return JSON.parse(readText(root, relativePath));
}

function includesAll(source, snippets) {
  return snippets.every((snippet) => source.includes(snippet));
}

function addErrorWhen(errors, condition, message) {
  if (condition) {
    errors.push(message);
  }
}

export function validateTrivyDevcontainerPolicy(root = REPO_ROOT) {
  const errors = [];
  const workflow = readText(root, ".github/workflows/security.yml");
  const packageJson = readJson(root, "package.json");
  const renovate = readJson(root, "renovate.json");
  const taskfile = readText(root, "apps/vscode-extension/Taskfile.yml");
  const securityDocs = readText(root, "docs/security.md");

  if (!workflow.includes(`aquasecurity/trivy-action@${TRIVY_ACTION_SHA}`)) {
    errors.push(
      `security.yml must use the immutable Trivy action commit ${TRIVY_ACTION_SHA}`,
    );
  }

  if (
    !workflow.includes(`TRIVY_VERSION: ${TRIVY_VERSION}`) ||
    !workflow.includes("version: ${{ env.TRIVY_VERSION }}")
  ) {
    errors.push(
      `security.yml must pin and pass Trivy ${TRIVY_VERSION} explicitly`,
    );
  }

  if (!workflow.includes("scan-type: config")) {
    errors.push(
      "security.yml must use Trivy's configuration scanner for the development container",
    );
  }
  if (!workflow.includes("scan-ref: .devcontainer")) {
    errors.push("security.yml must scan only .devcontainer with Trivy");
  }

  if (
    !includesAll(workflow, [
      "format: sarif",
      "output: trivy-devcontainer.sarif",
      "limit-severities-for-sarif: true",
      `github/codeql-action/upload-sarif@${CODEQL_ACTION_SHA}`,
      "category: trivy-devcontainer",
      `actions/upload-artifact@${UPLOAD_ARTIFACT_SHA}`,
      "name: trivy-devcontainer-sarif",
    ])
  ) {
    errors.push(
      "security.yml must retain Trivy SARIF generation, code-scanning upload, and artifact evidence",
    );
  }

  if (
    !workflow.includes("severity: HIGH,CRITICAL") ||
    !workflow.includes('exit-code: "1"')
  ) {
    errors.push(
      "security.yml must fail Trivy on HIGH,CRITICAL development-container misconfigurations",
    );
  }

  if (
    !workflow.includes("continue-on-error: true") ||
    !workflow.includes("id: trivy-devcontainer")
  ) {
    errors.push(
      "security.yml must defer failure until Trivy evidence has been uploaded",
    );
  }

  if (!workflow.includes("steps.trivy-devcontainer.outcome == 'failure'")) {
    errors.push(
      "security.yml must fail the required security job when the Trivy scan fails",
    );
  }

  if (
    !workflow.includes(
      "github.event.pull_request.head.repo.full_name == github.repository",
    ) ||
    !workflow.includes("security-events: write")
  ) {
    errors.push(
      "security.yml must keep Trivy SARIF upload fork-safe with least-privilege code-scanning permissions",
    );
  }

  const duplicateScannerOwnership = workflow.split(/\r?\n/u).some((line) => {
    const normalized = line.toLowerCase();
    return (
      normalized.includes("scanners:") &&
      ["vuln", "secret", "license"].some((scanner) =>
        normalized.includes(scanner),
      )
    );
  });
  addErrorWhen(
    errors,
    duplicateScannerOwnership,
    "Trivy must not duplicate vulnerability, dependency, license, or secret scanning",
  );

  const localCommand = packageJson.scripts?.["security:trivy-devcontainer"];
  if (
    typeof localCommand !== "string" ||
    !includesAll(localCommand, [
      "trivy config",
      "--skip-version-check",
      "--severity HIGH,CRITICAL",
      "--exit-code 1",
      ".devcontainer",
    ])
  ) {
    errors.push(
      "package.json must expose a local Trivy command scoped to .devcontainer",
    );
  }

  const policyCommand = packageJson.scripts?.["check:trivy-devcontainer"];
  const rootCheck = packageJson.scripts?.check;
  if (
    typeof policyCommand !== "string" ||
    !policyCommand.includes("scripts/check-trivy-devcontainer.mjs") ||
    !policyCommand.includes("scripts/check-trivy-devcontainer.test.mjs") ||
    typeof rootCheck !== "string" ||
    !rootCheck.includes("pnpm run check:trivy-devcontainer")
  ) {
    errors.push(
      "package.json must wire the Trivy policy validator and tests into the root check",
    );
  }

  if (
    !taskfile.includes("security:trivy-devcontainer:") ||
    !taskfile.includes("pnpm --dir ../.. run security:trivy-devcontainer") ||
    !taskfile.includes("task: security:trivy-devcontainer")
  ) {
    errors.push(
      "Taskfile security:local must include the root local Trivy command",
    );
  }

  if (
    !/\| Development-container configuration\s+\| Trivy v0\.72\.0/u.test(
      securityDocs,
    ) ||
    !securityDocs.includes("trivy-devcontainer") ||
    !securityDocs.includes("HIGH/CRITICAL") ||
    !securityDocs.includes("configuration-only")
  ) {
    errors.push(
      "docs/security.md must document Trivy v0.72.0, its configuration-only scope, evidence category, and HIGH/CRITICAL gate",
    );
  }

  const customManagers = Array.isArray(renovate.customManagers)
    ? renovate.customManagers
    : [];
  const hasTrivyManager = customManagers.some(
    (manager) =>
      manager?.customType === "regex" &&
      JSON.stringify(manager).includes("aquasecurity/trivy") &&
      JSON.stringify(manager).includes("TRIVY_VERSION"),
  );
  if (
    !Array.isArray(renovate.enabledManagers) ||
    !renovate.enabledManagers.includes("custom.regex") ||
    !hasTrivyManager
  ) {
    errors.push(
      "Renovate must own the explicit Trivy scanner version through a custom regex manager",
    );
  }

  return errors;
}

function main() {
  const errors = validateTrivyDevcontainerPolicy();
  if (errors.length > 0) {
    console.error("Targeted Trivy devcontainer policy failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }
  console.log("Targeted Trivy devcontainer policy is valid.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
