#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const strategyPath = path.join(root, "docs", "testing-strategy.md");
const packagePath = path.join(root, "package.json");
const nightlyWorkflowPath = path.join(
  root,
  ".github",
  "workflows",
  "nightly-quality-gates.yml",
);

const requiredSections = [
  "# Testing Strategy",
  "## Gate Summary",
  "## Test Layers",
  "## Fast PR Gates",
  "## Nightly Quality Gates",
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
  "uv sync --all-extras --frozen --project packages/mcp-server",
  "corepack pnpm run check:kicad-mcp-pro",
  "corepack pnpm run test:kicad-mcp-pro",
  "corepack pnpm run build:kicad-mcp-pro",
  "corepack pnpm run package:kicad-mcp-pro",
  "corepack pnpm run check:mcp-npm",
  "corepack pnpm run test:contract",
  "corepack pnpm run test:fixtures",
  "@vscode/test-electron",
  "Playwright",
  "toHaveScreenshot",
  "kicad-cli",
  "Streamable HTTP",
  "MCP-Protocol-Version",
  "visual regression",
  "accessibility",
  "manual smoke",
];

const roadmapIssueIds = [
  "OASLANA-35",
  "OASLANA-36",
  "OASLANA-37",
  "OASLANA-43",
  "OASLANA-56",
  "OASLANA-57",
  "OASLANA-75",
  "OASLANA-16",
  "OASLANA-20",
  "OASLANA-68",
  "OASLANA-63",
  "OASLANA-64",
  "OASLANA-81",
  "OASLANA-82",
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

const strategy = readText(strategyPath);
const packageJson = JSON.parse(readText(packagePath));
const nightlyWorkflow = readText(nightlyWorkflowPath);

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
  nightlyWorkflow,
  "name: Nightly Quality Gates",
  "nightly-quality-gates workflow",
);
assertIncludes(nightlyWorkflow, "cron:", "nightly-quality-gates workflow");
assertIncludes(
  nightlyWorkflow,
  "corepack pnpm run check",
  "nightly-quality-gates workflow",
);
assertIncludes(
  nightlyWorkflow,
  "corepack pnpm run test:contract",
  "nightly-quality-gates workflow",
);
assertIncludes(
  nightlyWorkflow,
  "corepack pnpm run test:fixtures",
  "nightly-quality-gates workflow",
);
