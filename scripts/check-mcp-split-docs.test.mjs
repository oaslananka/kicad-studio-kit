import assert from "node:assert/strict";
import test from "node:test";

import {
  FORBIDDEN_PHRASES,
  findMonorepoLanguage,
  isHistorical,
  scanLine,
} from "./check-mcp-split-docs.mjs";

test("#396 repository is free of stale MCP-monorepo language", () => {
  const hits = findMonorepoLanguage();
  assert.deepEqual(
    hits,
    [],
    `Stale monorepo language found:\n${hits
      .map((hit) => `- ${hit.file}:${hit.line}: ${hit.snippet}`)
      .join("\n")}`,
  );
});

test("#396 each retired phrase is detected", () => {
  const staleLines = [
    "Monorepo for KiCad Studio VS Code extension and KiCad MCP Pro server.",
    "KiCad Studio and KiCad MCP Pro are independent products in one repository.",
    "The monorepo has three product workspaces, but they stay decoupled.",
    "separate product boundaries for the VS Code extension, the Python MCP server, the npm launcher",
  ];
  for (const line of staleLines) {
    assert.ok(
      scanLine(line).length >= 1,
      `expected to flag stale line: ${line}`,
    );
  }
  // Every phrase is exercised by at least one sample line.
  assert.equal(FORBIDDEN_PHRASES.length, staleLines.length);
});

test("#396 corrected wording is not flagged", () => {
  const cleanLines = [
    "VS Code extension repository for KiCad Studio. The KiCad MCP Pro server is developed and released separately.",
    "KiCad Studio and KiCad MCP Pro are independent products released from separate repositories.",
    "This repository releases one product — the KiCad Studio VS Code extension.",
    "The MCP server and npm launcher live in KiCad MCP Pro.",
  ];
  for (const line of cleanLines) {
    assert.equal(scanLine(line).length, 0, `unexpected flag for: ${line}`);
  }
});

test("#396 historical records are exempt", () => {
  assert.equal(
    isHistorical(
      "docs/adr/0009-split-kicad-mcp-pro-into-separate-repository.md",
    ),
    true,
  );
  assert.equal(isHistorical("docs/changelog/kicad-studio.md"), true);
  assert.equal(isHistorical("apps/vscode-extension/CHANGELOG.md"), true);
  assert.equal(
    isHistorical("docs/superpowers/plans/2026-05-20-monorepo-migration.md"),
    true,
  );
  assert.equal(isHistorical("README.md"), false);
  assert.equal(isHistorical("docs/integration/kicad-studio-mcp.md"), false);
});
