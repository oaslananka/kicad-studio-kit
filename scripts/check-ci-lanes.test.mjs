import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyChangedFiles,
  formatMarkdownSummary,
  outputsForReport,
} from "./check-ci-lanes.mjs";

test("extension-only changes run extension and performance lanes, not MCP packaging", () => {
  const report = classifyChangedFiles([
    "apps/vscode-extension/src/extension.ts",
  ]);

  assert.equal(report.lanes.metadata, true);
  assert.equal(report.lanes.vscodeExtension, true);
  assert.equal(report.lanes.performanceBudgets, true);
  assert.equal(report.lanes.mcpServer, false);
  assert.equal(report.lanes.mcpNpm, false);
  assert.equal(report.lanes.integrationContracts, false);
});

test("extension MCP adapter changes run integration compatibility", () => {
  const report = classifyChangedFiles([
    "apps/vscode-extension/src/mcp/McpToolAdapter.ts",
  ]);

  assert.equal(report.lanes.vscodeExtension, true);
  assert.equal(report.lanes.integrationContracts, true);
  assert.equal(report.lanes.realPairCompatibility, true);
});

test("MCP server changes run MCP, npm launcher, performance, and integration lanes", () => {
  const report = classifyChangedFiles([
    "packages/mcp-server/src/kicad_mcp/server.py",
  ]);

  assert.equal(report.lanes.mcpServer, true);
  assert.equal(report.lanes.mcpNpm, true);
  assert.equal(report.lanes.performanceBudgets, true);
  assert.equal(report.lanes.integrationContracts, true);
  assert.equal(report.lanes.realPairCompatibility, true);
  assert.equal(report.lanes.vscodeExtension, false);
});

test("shared schema changes run both product compatibility gates", () => {
  const report = classifyChangedFiles([
    "packages/protocol-schemas/schemas/kicad-mcp-server-info.schema.json",
  ]);

  assert.equal(report.lanes.sharedPackages, true);
  assert.equal(report.lanes.vscodeExtension, true);
  assert.equal(report.lanes.mcpServer, true);
  assert.equal(report.lanes.mcpNpm, true);
  assert.equal(report.lanes.integrationContracts, true);
  assert.equal(report.lanes.realPairCompatibility, true);
});

test("test harness changes run shared and cross-product compatibility gates", () => {
  const report = classifyChangedFiles(["packages/test-harness/src/index.ts"]);

  assert.equal(report.lanes.sharedPackages, true);
  assert.equal(report.lanes.vscodeExtension, true);
  assert.equal(report.lanes.mcpServer, true);
  assert.equal(report.lanes.mcpNpm, true);
  assert.equal(report.lanes.integrationContracts, true);
  assert.equal(report.lanes.realPairCompatibility, true);
  assert.equal(report.lanes.performanceBudgets, true);
});

test("root toolchain and CI workflow changes run all lanes", () => {
  for (const file of [
    "package.json",
    "pnpm-lock.yaml",
    ".github/workflows/ci.yml",
  ]) {
    const report = classifyChangedFiles([file]);
    for (const value of Object.values(report.lanes)) {
      assert.equal(value, true, `${file} should run every lane`);
    }
    assert.equal(outputsForReport(report).run_all, "true");
  }
});

test("docs-only changes keep product lanes skipped while metadata still runs", () => {
  const report = classifyChangedFiles([
    "docs/testing-strategy.md",
    "AGENTS.md",
    ".github/copilot-instructions.md",
    "examples/mcp-clients/vscode.mcp.example.json",
  ]);

  assert.equal(report.lanes.metadata, true);
  assert.equal(report.lanes.vscodeExtension, false);
  assert.equal(report.lanes.mcpServer, false);
  assert.equal(report.lanes.sharedPackages, false);
  assert.equal(report.lanes.integrationContracts, false);
});

test("manual and scheduled contexts can force all lanes", () => {
  const report = classifyChangedFiles([], {
    forceAll: true,
    forceAllReason: "workflow_dispatch runs all CI lanes.",
  });

  for (const value of Object.values(report.lanes)) {
    assert.equal(value, true);
  }
});

test("markdown summary reports skipped lanes and reasons", () => {
  const report = classifyChangedFiles(["docs/testing-strategy.md"]);
  const summary = formatMarkdownSummary(report);

  assert.match(summary, /CI Lane Selection/u);
  assert.match(summary, /VS Code extension \| skipped/u);
  assert.match(summary, /No changed file matched this lane's trigger set/u);
});
