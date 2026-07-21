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
    "actionlint -config-file .github/actionlint.yaml && uvx --from zizmor==1.27.0 zizmor --config .github/zizmor.yml --offline --strict-collection --format plain --min-severity medium --min-confidence high .",
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

export function validateSecurityTooling(root = REPO_ROOT) {
  const errors = [];
  const packageJson = readJson(root, "package.json");
  const scripts = packageJson.scripts ?? {};
  const securityWorkflow = readText(root, ".github/workflows/security.yml");
  const precommit = readText(root, ".pre-commit-config.yaml");
  const semgrep = readText(root, ".semgrep/semgrep.yml");
  const semgrepIgnore = readText(root, ".semgrepignore");
  const zizmor = readText(root, ".github/zizmor.yml");

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
      "package.json must pin actionlint plus zizmor 1.27.0 in the deterministic workflow-security command",
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

  const workflowRequirements = [
    ["ACTIONLINT_VERSION: 1.7.12", "security.yml must pin actionlint 1.7.12"],
    [
      "ACTIONLINT_SHA256: 8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8",
      "security.yml must verify the immutable actionlint Linux archive checksum",
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
  for (const [needle, message] of workflowRequirements) {
    if (!securityWorkflow.includes(needle)) {
      errors.push(message);
    }
  }

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

  if (!zizmor || !zizmor.includes("rules:")) {
    errors.push(".github/zizmor.yml must define the reviewed zizmor policy");
  }
  if (/disable:\s*true/u.test(zizmor)) {
    errors.push("zizmor rules must not be globally disabled");
  }

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
  const semgrepIgnoreEntries = semgrepIgnore
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const forbidden of [".semgrep/", ".semgrep/semgrep.ts"]) {
    if (semgrepIgnoreEntries.includes(forbidden)) {
      errors.push(
        `.semgrepignore must not hide custom rule fixtures with ${forbidden}`,
      );
    }
  }

  const semgrepFixtures = readText(root, ".semgrep/semgrep.ts");
  for (const rule of REQUIRED_SEMGREP_RULES) {
    if (!semgrepFixtures.includes(`ruleid: ${rule}`)) {
      errors.push(`Semgrep fixtures must exercise ${rule}`);
    }
  }

  return errors;
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
