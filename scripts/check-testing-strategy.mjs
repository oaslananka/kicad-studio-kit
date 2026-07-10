#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const root = process.cwd();
const compatibilityPath = path.join(root, "compatibility.yaml");
const strategyPath = path.join(root, "docs", "testing-strategy.md");
const packagePath = path.join(root, "package.json");
const ciWorkflowPath = path.join(root, ".github", "workflows", "ci.yml");
const vscodeCanaryWorkflowPath = path.join(
  root,
  ".github",
  "workflows",
  "vscode-canary.yml",
);
const extensionPackagePath = path.join(
  root,
  "apps",
  "vscode-extension",
  "package.json",
);

const requiredSections = [
  "# Testing Strategy",
  "## Gate Summary",
  "## Test Layers",
  "## Fast PR Gates",
  "## Bug-Fix Regression Requirement",
  "## Path-Filtered CI Lanes",
  "## Performance Budgets",
  "## Scheduled Compatibility Gates",
  "## Regression Coverage Map",
  "## Local Commands",
  "## CI Ownership",
  "## Source Verification",
];

const requiredPhrases = [
  "OASLANA-35",
  "GitHub issue #36",
  "corepack pnpm run check",
  "corepack pnpm run check:kicad-studio",
  "corepack pnpm run test:kicad-studio",
  "corepack pnpm run build:kicad-studio",
  "corepack pnpm run package:kicad-studio",
  "corepack pnpm run check:protocol-schemas",
  "corepack pnpm run check:compatibility-contract",
  "Run from the `oaslananka/kicad-mcp-pro` repository",
  "corepack pnpm run check:performance-budgets",
  "corepack pnpm run check:ci-lanes",
  "corepack pnpm run check:kicad-gui-smoke",
  "corepack pnpm run test:fixtures",
  "GitHub issue #62",
  "A reference to the related issue ID",
  "Manual screenshots alone are not\nsufficient",
  "Known Repeatable Bug Areas",
  "docs/performance-baselines.md",
  "@vscode/test-electron",
  "Playwright",
  "toHaveScreenshot",
  "kicad-cli",
  "Streamable HTTP",
  "legacy SSE opt-in",
  "MCP-Protocol-Version",
  "visual regression",
  "accessibility",
  "manual smoke",
  ".github/workflows/vscode-canary.yml",
  ".github/workflows/cross-repo-compatibility.yml",
];

const roadmapIssueIds = [
  "OASLANA-35",
  "OASLANA-36",
  "OASLANA-37",
  "OASLANA-43",
  "OASLANA-71",
  "OASLANA-44",
  "OASLANA-56",
  "OASLANA-57",
  "OASLANA-75",
  "OASLANA-61",
  "OASLANA-16",
  "OASLANA-20",
  "OASLANA-68",
  "OASLANA-63",
  "OASLANA-64",
  "OASLANA-81",
  "OASLANA-82",
  "OASLANA-124",
];

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(
      `Missing required file ${path.relative(root, filePath)}: ${error.message}`,
    );
  }
}

function assertIncludes(haystack, needle, source) {
  if (!haystack.includes(needle)) {
    throw new Error(`${source} must include ${JSON.stringify(needle)}`);
  }
}

function requireString(value, source) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${source} must be a non-empty string`);
  }
  return value;
}

const strategy = readText(strategyPath);
const compatibility = parse(readText(compatibilityPath));
const packageJson = JSON.parse(readText(packagePath));
const extensionPackageJson = JSON.parse(readText(extensionPackagePath));
const ciWorkflow = readText(ciWorkflowPath);
const vscodeCanaryWorkflow = readText(vscodeCanaryWorkflowPath);
const vscodeCanaryWorkflowConfig = parse(vscodeCanaryWorkflow);
const vscodeMinimum = requireString(
  compatibility?.vscode?.minimum,
  "compatibility.yaml vscode.minimum",
);
const vscodeEnginesRange = requireString(
  compatibility?.vscode?.enginesRange,
  "compatibility.yaml vscode.enginesRange",
);

for (const section of requiredSections) {
  assertIncludes(strategy, section, "docs/testing-strategy.md");
}

for (const phrase of requiredPhrases) {
  assertIncludes(strategy, phrase, "docs/testing-strategy.md");
}

for (const issueId of roadmapIssueIds) {
  assertIncludes(
    strategy,
    issueId,
    "docs/testing-strategy.md regression coverage map",
  );
}

const scripts = packageJson.scripts ?? {};
if (
  scripts["check:testing-strategy"] !==
  "node scripts/check-testing-strategy.mjs"
) {
  throw new Error("package.json must define check:testing-strategy");
}

if (!scripts.check?.includes("pnpm run check:testing-strategy")) {
  throw new Error("package.json check must run check:testing-strategy");
}

assertIncludes(
  ciWorkflow,
  "Measure extension performance budgets",
  "ci workflow",
);
assertIncludes(
  ciWorkflow,
  "corepack pnpm --filter kicadstudiokit run test:perf",
  "ci workflow",
);
assertIncludes(
  vscodeCanaryWorkflow,
  "name: VS Code Canary",
  "vscode-canary workflow",
);
assertIncludes(vscodeCanaryWorkflow, "cron:", "vscode-canary workflow");
assertIncludes(
  vscodeCanaryWorkflow,
  "corepack pnpm --filter kicadstudiokit run test:integration",
  "vscode-canary workflow",
);

if (extensionPackageJson.engines?.vscode !== vscodeEnginesRange) {
  throw new Error(
    `apps/vscode-extension/package.json engines.vscode must match compatibility.yaml vscode.enginesRange (${vscodeEnginesRange})`,
  );
}

const canaryMatrixInclude =
  vscodeCanaryWorkflowConfig?.jobs?.["extension-host"]?.strategy?.matrix
    ?.include;
if (!Array.isArray(canaryMatrixInclude)) {
  throw new Error(
    "vscode-canary workflow must define jobs.extension-host.strategy.matrix.include",
  );
}

const canaryVersionsById = new Map(
  canaryMatrixInclude.map((lane) => [lane?.id, lane?.version]),
);
for (const [laneId, expectedVersion] of [
  ["minimum", vscodeMinimum],
  ["stable", "stable"],
  ["insiders", "insiders"],
]) {
  const actualVersion = canaryVersionsById.get(laneId);
  if (String(actualVersion) !== expectedVersion) {
    throw new Error(
      `vscode-canary workflow lane ${laneId} must use version ${expectedVersion}; found ${actualVersion}`,
    );
  }
}
