#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const EXPECTED_SCRIPTS = {
  "check:security-tooling":
    "node scripts/check-security-tooling.mjs && node --test scripts/check-security-tooling.test.mjs",
  "security:workflows":
    "actionlint -config-file .github/actionlint.yaml && uvx --from zizmor==1.28.0 zizmor --config .github/zizmor.yml --offline --strict-collection --format plain --min-severity medium --min-confidence high .",
  "security:semgrep":
    "uvx --from semgrep==1.170.0 semgrep scan --config .semgrep/semgrep.yml --error --metrics=off apps/vscode-extension/src apps/vscode-extension/scripts packages scripts",
  "test:semgrep-rules":
    "uvx --from semgrep==1.170.0 semgrep --metrics=off --test --config .semgrep/semgrep.yml .semgrep/semgrep.ts",
};

const REQUIRED_PRECOMMIT_HOOKS = [
  "trailing-whitespace",
  "end-of-file-fixer",
  "mixed-line-ending",
  "check-yaml",
  "check-json",
  "check-toml",
  "check-merge-conflict",
  "check-case-conflict",
  "check-illegal-windows-names",
  "check-symlinks",
  "check-added-large-files",
  "detect-private-key",
];

const REQUIRED_SEMGREP_RULES = [
  "kicad.no-node-shell-exec",
  "kicad.no-dynamic-code-evaluation",
  "kicad.no-sensitive-console-logging",
];

function readText(root, relativePath) {
  const filePath = path.join(root, relativePath);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function readJson(root, relativePath) {
  const text = readText(root, relativePath);
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function validatePackageScripts(packageJson) {
  const errors = [];
  const scripts = packageJson.scripts ?? {};
  if (
    scripts["check:security-tooling"] !==
      EXPECTED_SCRIPTS["check:security-tooling"] ||
    !scripts.check?.includes("pnpm run check:security-tooling")
  ) {
    errors.push(
      "package.json must expose check:security-tooling and compose it into the root check",
    );
  }
  if (
    scripts["security:workflows"] !== EXPECTED_SCRIPTS["security:workflows"]
  ) {
    errors.push(
      "package.json must pin actionlint plus zizmor 1.28.0 in the deterministic workflow-security command",
    );
  }
  if (scripts["security:semgrep"] !== EXPECTED_SCRIPTS["security:semgrep"]) {
    errors.push(
      "package.json must pin Semgrep 1.170.0 to the repository-owned scan targets",
    );
  }
  if (
    scripts["test:semgrep-rules"] !== EXPECTED_SCRIPTS["test:semgrep-rules"]
  ) {
    errors.push("package.json must pin Semgrep 1.170.0 for custom rule tests");
  }
  return errors;
}

function validateSecurityWorkflow(workflow) {
  const requirements = [
    ["ACTIONLINT_VERSION: 1.7.12", "security.yml must pin actionlint 1.7.12"],
    [
      "ACTIONLINT_SHA256: 8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8",
      "security.yml must verify the immutable actionlint Linux archive checksum",
    ],
    [
      "--proto '=https' --proto-redir '=https'",
      "security.yml must restrict actionlint downloads and redirects to HTTPS",
    ],
    [
      "sha256sum --check --strict",
      "security.yml must fail closed on the actionlint checksum",
    ],
    [
      "corepack pnpm run check:security-tooling",
      "security.yml must run check:security-tooling before scanners",
    ],
    [
      "corepack pnpm run security:workflows",
      "security.yml must run security:workflows in the required security job",
    ],
    [
      "corepack pnpm run test:semgrep-rules",
      "security.yml must run test:semgrep-rules in the required security job",
    ],
    [
      "corepack pnpm run security:semgrep",
      "security.yml must run security:semgrep in the required security job",
    ],
  ];
  return requirements
    .filter(([needle]) => !workflow.includes(needle))
    .map(([, message]) => message);
}

function validateLocalSecurityScripts(shellScript, powershellScript) {
  const errors = [];
  const safePrecommit = "uvx --no-build --from pre-commit==4.6.0 pre-commit";
  if (!shellScript.includes(safePrecommit)) {
    errors.push(
      "local-security.sh must run pinned pre-commit with uvx --no-build",
    );
  }
  if (!powershellScript.includes(safePrecommit)) {
    errors.push(
      "local-security.ps1 must run pinned pre-commit with uvx --no-build",
    );
  }
  return errors;
}

function validatePrecommit(precommit) {
  const errors = [];
  if (!precommit.includes("rev: v6.0.0")) {
    errors.push("pre-commit hooks must remain pinned to v6.0.0");
  }
  for (const hook of REQUIRED_PRECOMMIT_HOOKS) {
    if (!precommit.includes(`- id: ${hook}`)) {
      errors.push(`pre-commit must retain the fast ${hook} hook`);
    }
  }
  if (!/id:\s+mixed-line-ending[\s\S]*?args:\s*\[--fix=no\]/u.test(precommit)) {
    errors.push("pre-commit mixed-line-ending must use --fix=no");
  }
  return errors;
}

function validateZizmor(zizmor) {
  const errors = [];
  if (!zizmor.includes("rules:")) {
    errors.push(".github/zizmor.yml must define the reviewed zizmor policy");
  }
  if (/disable:\s*true/u.test(zizmor)) {
    errors.push("zizmor rules must not be globally disabled");
  }
  return errors;
}

function validateRenovate(renovate) {
  const errors = [];
  const customManagers = Array.isArray(renovate.customManagers)
    ? renovate.customManagers
    : [];
  const hasZizmorManager = customManagers.some((manager) => {
    return (
      manager?.customType === "regex" &&
      manager?.datasourceTemplate === "pypi" &&
      manager?.depNameTemplate === "zizmor" &&
      manager?.versioningTemplate === "pep440" &&
      Array.isArray(manager.managerFilePatterns) &&
      manager.managerFilePatterns.includes("/^package\\.json$/") &&
      Array.isArray(manager.matchStrings) &&
      manager.matchStrings.some(
        (pattern) =>
          pattern.includes("zizmor==") && pattern.includes("currentValue"),
      )
    );
  });
  if (
    !Array.isArray(renovate.enabledManagers) ||
    !renovate.enabledManagers.includes("custom.regex") ||
    !hasZizmorManager
  ) {
    errors.push(
      "Renovate must own the exact zizmor PyPI pin through a custom regex manager",
    );
  }
  return errors;
}

function validateSecurityDocs(securityDocs) {
  const errors = [];
  if (!securityDocs.includes("zizmor 1.28.0")) {
    errors.push("docs/security.md must document the pinned zizmor 1.28.0 gate");
  }
  if (securityDocs.includes("zizmor 1.27.0")) {
    errors.push("docs/security.md must not reference yanked zizmor 1.27.0");
  }
  return errors;
}

function validateSemgrep(semgrep, semgrepIgnore) {
  const errors = [];
  for (const rule of REQUIRED_SEMGREP_RULES) {
    if (!semgrep.includes(`id: ${rule}`)) {
      errors.push(`Semgrep must retain repository-owned rule ${rule}`);
    }
  }
  if (/\bp\/[A-Za-z0-9_-]+/u.test(semgrep) || /semgrep\.dev/u.test(semgrep)) {
    errors.push(
      "Semgrep configuration must stay repository-owned instead of loading broad registry rules",
    );
  }
  if (/p\/secrets|detect-secrets|trufflehog/u.test(semgrep)) {
    errors.push(
      "Semgrep must not duplicate secret scanning owned by GitHub push protection and Gitleaks",
    );
  }
  for (const ignored of [
    "**/dist/",
    "**/out/",
    "**/coverage/",
    "**/test/**",
    "apps/vscode-extension/media/kicanvas/",
    "packages/kicad-fixtures/fixtures/",
  ]) {
    if (!semgrepIgnore.includes(ignored)) {
      errors.push(`.semgrepignore must exclude ${ignored}`);
    }
  }
  const ignoredEntries = new Set(
    semgrepIgnore
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  for (const forbidden of [".semgrep/", ".semgrep/semgrep.ts"]) {
    if (ignoredEntries.has(forbidden)) {
      errors.push(
        `.semgrepignore must not hide custom rule fixtures with ${forbidden}`,
      );
    }
  }
  return errors;
}

function validateSemgrepFixtures(fixtures) {
  return REQUIRED_SEMGREP_RULES.filter(
    (rule) => !fixtures.includes(`ruleid: ${rule}`),
  ).map((rule) => `Semgrep fixtures must exercise ${rule}`);
}

export function validateSecurityTooling(root = REPO_ROOT) {
  return [
    ...validatePackageScripts(readJson(root, "package.json")),
    ...validateSecurityWorkflow(
      readText(root, ".github/workflows/security.yml"),
    ),
    ...validateLocalSecurityScripts(
      readText(root, "apps/vscode-extension/scripts/local-security.sh"),
      readText(root, "apps/vscode-extension/scripts/local-security.ps1"),
    ),
    ...validatePrecommit(readText(root, ".pre-commit-config.yaml")),
    ...validateZizmor(readText(root, ".github/zizmor.yml")),
    ...validateRenovate(readJson(root, "renovate.json")),
    ...validateSecurityDocs(readText(root, "docs/security.md")),
    ...validateSemgrep(
      readText(root, ".semgrep/semgrep.yml"),
      readText(root, ".semgrepignore"),
    ),
    ...validateSemgrepFixtures(readText(root, ".semgrep/semgrep.ts")),
  ];
}

function main() {
  const errors = validateSecurityTooling();
  if (errors.length > 0) {
    console.error("Security tooling policy failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }
  console.log("Security tooling policy is valid.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
