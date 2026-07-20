import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  FORBIDDEN_PHRASES,
  classifyMcpDocumentationPath,
  findMcpOwnershipDrift,
  findMonorepoLanguage,
  isHistorical,
  scanActiveOwnershipLine,
  scanLine,
} from "./check-mcp-split-docs.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function createFixture(files) {
  const root = mkdtempSync(join(tmpdir(), "kicad-mcp-doc-policy-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const target = join(root, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
  }
  return root;
}

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

test("#493 classifies active, historical, guard, and other documentation roles", () => {
  assert.equal(classifyMcpDocumentationPath("CONTRIBUTING.md"), "active");
  assert.equal(
    classifyMcpDocumentationPath(
      "docs/adr/0008-mcp-2026-07-28-protocol-upgrade.md",
    ),
    "active",
  );
  assert.equal(
    classifyMcpDocumentationPath(
      "docs/adr/0009-split-kicad-mcp-pro-into-separate-repository.md",
    ),
    "historical",
  );
  assert.equal(
    classifyMcpDocumentationPath("docs/changelog/kicad-studio.md"),
    "historical",
  );
  assert.equal(
    classifyMcpDocumentationPath(
      "docs/superpowers/plans/2026-05-20-monorepo-migration.md",
    ),
    "historical",
  );
  assert.equal(
    classifyMcpDocumentationPath("docs/protocol-schemas.md"),
    "guard",
  );
  assert.equal(
    classifyMcpDocumentationPath("docs/architecture/branch-protection.md"),
    "guard",
  );
  assert.equal(
    classifyMcpDocumentationPath(
      ".github/workflows/cross-repo-compatibility.yml",
    ),
    "guard",
  );
  assert.equal(classifyMcpDocumentationPath("README.md"), "active");
});

test("#493 keeps ADR 0008 active while preserving historical exemptions", () => {
  assert.equal(
    isHistorical("docs/adr/0008-mcp-2026-07-28-protocol-upgrade.md"),
    false,
  );
  assert.equal(
    isHistorical(
      "docs/adr/0009-split-kicad-mcp-pro-into-separate-repository.md",
    ),
    true,
  );
  assert.equal(isHistorical("apps/vscode-extension/CHANGELOG.md"), true);
});

test("#493 detects removed local MCP paths and former repository wording in active guidance", () => {
  const staleLines = [
    "Update protocol schemas in `packages/protocol-schemas/`.",
    "Change `packages/mcp-server/src/kicad_mcp/config.py`.",
    "Run the workflow in the kicad-mcp repo.",
    "MCP tests run in the [kicad-mcp](https://example.invalid/) repository.",
    "The workflow validates kicad-mcp artifacts.",
    "This repository consumes published kicad-mcp protocol schemas.",
    "On the kicad-mcp side, publish the schemas first.",
    "kicad-mcp ships first, then the extension.",
    "corepack pnpm run check:kicad-mcp-pro",
    "corepack pnpm run test:contract",
  ];

  for (const line of staleLines) {
    assert.ok(
      scanActiveOwnershipLine(line).length >= 1,
      `expected active ownership drift for: ${line}`,
    );
  }
});

test("#493 accepts canonical product, repository, and published-artifact ownership wording", () => {
  const cleanLines = [
    "KiCad MCP Pro publishes `@oaslananka/kicad-protocol-schemas` before the extension consumes it.",
    "Run `publish-mcp-container.yml` from the KiCad MCP Pro repository.",
    "This repository owns the extension adapter and client compatibility metadata.",
    "The cross-repo canary validates published KiCad MCP Pro artifacts.",
    "The extension consumes published kicad-mcp-pro server artifacts.",
    "Run server checks from the KiCad MCP Pro repository.",
    "corepack pnpm run check:protocol-schemas",
  ];

  for (const line of cleanLines) {
    assert.equal(
      scanActiveOwnershipLine(line).length,
      0,
      `unexpected ownership flag for: ${line}`,
    );
  }
});

test("#493 scans active guidance but preserves historical evidence and migration guards", (t) => {
  const fixtureRoot = createFixture({
    "docs/adr/0008-mcp-2026-07-28-protocol-upgrade.md":
      "# Active\nUpdate `packages/protocol-schemas/` here.\n",
    "docs/adr/0009-split-kicad-mcp-pro-into-separate-repository.md":
      "# Historical\nThe old package was `packages/protocol-schemas/`.\n",
    "docs/protocol-schemas.md":
      "# Guard\nThe `packages/protocol-schemas` directory must NOT exist.\n",
  });
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

  const hits = findMcpOwnershipDrift(fixtureRoot);

  assert.equal(hits.length, 1);
  assert.match(hits[0].file, /docs\/adr\/0008-/u);
  assert.equal(hits[0].role, "active");
  assert.match(hits[0].hint, /KiCad MCP Pro|published/u);
});

test("#493 root package exposes and composes the dedicated MCP split docs gate", () => {
  const packageJson = JSON.parse(
    readFileSync(join(repoRoot, "package.json"), "utf8"),
  );

  assert.equal(
    packageJson.scripts["check:mcp-split-docs"],
    "node scripts/check-mcp-split-docs.mjs && node --test scripts/check-mcp-split-docs.test.mjs",
  );
  assert.match(
    packageJson.scripts["check:forbidden-refs"],
    /pnpm run check:mcp-split-docs/u,
  );
});

test("#493 repository active MCP ownership guidance is current", () => {
  const hits = findMcpOwnershipDrift();
  assert.deepEqual(
    hits,
    [],
    `Stale active MCP ownership guidance found:\n${hits
      .map((hit) => `- ${hit.file}:${hit.line}: ${hit.snippet}`)
      .join("\n")}`,
  );
});
