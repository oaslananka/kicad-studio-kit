#!/usr/bin/env node

// Guards the post-split MCP ownership model.
//
// Current operational guidance must name the canonical KiCad MCP Pro owner and
// published protocol-schema artifact. Historical evidence may preserve old
// monorepo paths verbatim, while migration guards may mention removed paths only
// to require that they remain absent.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  ".venv",
  "dist",
  "out",
  "site",
  "coverage",
  "htmlcov",
  "__pycache__",
  ".vscode-test",
  ".pytest_cache",
]);

const IGNORED_FILES = new Set(["pnpm-lock.yaml", "uv.lock"]);

const IGNORED_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".ico",
  ".whl",
  ".gz",
  ".vsix",
]);

const CHECKER_FILES = new Set([
  "scripts/check-mcp-split-docs.mjs",
  "scripts/check-mcp-split-docs.test.mjs",
]);

export const ACTIVE_OPERATIONAL_FILES = new Set([
  "AGENTS.md",
  "CONTRIBUTING.md",
  "README.md",
  "docs/adr/0008-mcp-2026-07-28-protocol-upgrade.md",
  "docs/mcp/index.md",
  "docs/publishing.md",
  "docs/support-matrix.md",
  "docs/testing-strategy.md",
  "docs/architecture/product-boundaries.md",
  "docs/RELEASE-COORDINATION.md",
]);

const GUARD_FILES = new Set([
  "docs/protocol-schemas.md",
  "docs/architecture/branch-protection.md",
  ".github/workflows/cross-repo-compatibility.yml",
  "scripts/check-cross-repo-compatibility.mjs",
  "scripts/check-compatibility-contract.mjs",
]);

const HISTORICAL_PREFIXES = ["docs/changelog/", "docs/superpowers/"];

const HISTORICAL_FILES = new Set([
  "docs/architecture/migration-phases.md",
  "docs/EMERGENCY-RELEASE-FLOW.md",
  "docs/security/github-security-settings.md",
]);

function normalizeRelativePath(relativePath) {
  return relativePath.replaceAll("\\", "/");
}

export function classifyMcpDocumentationPath(relativePath) {
  const rel = normalizeRelativePath(relativePath);
  if (ACTIVE_OPERATIONAL_FILES.has(rel)) {
    return "active";
  }
  if (GUARD_FILES.has(rel)) {
    return "guard";
  }
  if (
    HISTORICAL_FILES.has(rel) ||
    HISTORICAL_PREFIXES.some((prefix) => rel.startsWith(prefix)) ||
    rel.startsWith("docs/adr/") ||
    rel.endsWith("CHANGELOG.md")
  ) {
    return "historical";
  }
  return "other";
}

export function isHistorical(relativePath) {
  return classifyMcpDocumentationPath(relativePath) === "historical";
}

// Present-tense claims that this repository still co-locates the MCP server.
// These apply to all current, non-historical repository content.
export const FORBIDDEN_PHRASES = [
  {
    pattern: /Monorepo for KiCad Studio VS Code extension and KiCad MCP Pro/iu,
    hint: "Describe this repository as the VS Code extension repo; the MCP server is released from KiCad MCP Pro.",
  },
  {
    pattern: /independent products in one repository/iu,
    hint: "KiCad Studio and KiCad MCP Pro are released from separate repositories.",
  },
  {
    pattern: /three product workspaces/iu,
    hint: "This repository releases one product (the extension) plus private shared packages.",
  },
  {
    pattern: /the Python MCP server, the npm launcher/iu,
    hint: "The MCP server and npm launcher live in KiCad MCP Pro, not this repository.",
  },
];

export const ACTIVE_OWNERSHIP_RULES = [
  {
    pattern:
      /packages\/(?:protocol-schemas|mcp-server|mcp-npm)(?:\/[a-z0-9_.-]+)*/iu,
    hint: "Do not direct active work to a removed local MCP path. Assign server/schema source work to KiCad MCP Pro and consume schemas through @oaslananka/kicad-protocol-schemas.",
  },
  {
    pattern: /\bkicad-mcp repo(?:sitory)?\b/iu,
    hint: "Use the canonical product/repository name KiCad MCP Pro and its stable documentation surface.",
  },
  {
    pattern: /\[kicad-mcp\]\(|\bkicad-mcp artifact(?:s)?\b/iu,
    hint: "Use KiCad MCP Pro for repository ownership and name published artifacts explicitly as kicad-mcp-pro or @oaslananka/kicad-protocol-schemas.",
  },
  {
    pattern: /\bkicad-mcp\b(?!-)/iu,
    hint: "Replace the retired kicad-mcp shorthand with KiCad MCP Pro, kicad-mcp-pro, or @oaslananka/kicad-protocol-schemas according to the owning surface.",
  },
  {
    pattern: /\bon the kicad-mcp side\b/iu,
    hint: "Name KiCad MCP Pro as the owner of server and schema publication work.",
  },
  {
    pattern: /\bkicad-mcp ships first\b/iu,
    hint: "Describe the artifact order explicitly: KiCad MCP Pro publishes schemas/server artifacts before KiCad Studio tightens its client requirement.",
  },
  {
    pattern:
      /corepack pnpm run (?:(?:check|test|build|package):kicad-mcp-pro|test:contract)\b/iu,
    hint: "Do not document non-existent local MCP server commands. Run server commands from KiCad MCP Pro; use this repository's check:protocol-schemas, check:compatibility-contract, test:fixtures, and check:protocol-pr-template commands for client-side contract work.",
  },
];

export function scanLine(line) {
  return FORBIDDEN_PHRASES.filter((rule) => rule.pattern.test(line));
}

export function scanActiveOwnershipLine(line) {
  return ACTIVE_OWNERSHIP_RULES.filter((rule) => rule.pattern.test(line));
}

function shouldSkip(relativePath, name) {
  if (IGNORED_FILES.has(name)) return true;
  if (IGNORED_EXTS.has(path.extname(name).toLowerCase())) return true;
  return isHistorical(relativePath) || CHECKER_FILES.has(relativePath);
}

function walkTextFiles(root, visitor) {
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const rel = normalizeRelativePath(path.relative(root, full));
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (IGNORED_FILES.has(entry.name)) continue;
      if (IGNORED_EXTS.has(path.extname(entry.name).toLowerCase())) continue;
      let text;
      try {
        text = fs.readFileSync(full, "utf8");
      } catch {
        continue;
      }
      visitor({ full, rel, name: entry.name, text });
    }
  };
  walk(root);
}

export function findMonorepoLanguage(root = repoRoot) {
  const hits = [];
  walkTextFiles(root, ({ rel, name, text }) => {
    if (shouldSkip(rel, name)) return;
    text.split(/\r?\n/u).forEach((line, index) => {
      for (const rule of scanLine(line)) {
        hits.push({
          file: rel,
          line: index + 1,
          role: classifyMcpDocumentationPath(rel),
          snippet: line.trim().slice(0, 160),
          hint: rule.hint,
        });
      }
    });
  });
  return hits;
}

export function findMcpOwnershipDrift(root = repoRoot) {
  const hits = [];
  walkTextFiles(root, ({ rel, text }) => {
    const role = classifyMcpDocumentationPath(rel);
    if (role !== "active") return;
    text.split(/\r?\n/u).forEach((line, index) => {
      for (const rule of scanActiveOwnershipLine(line)) {
        hits.push({
          file: rel,
          line: index + 1,
          role,
          snippet: line.trim().slice(0, 160),
          hint: rule.hint,
        });
      }
    });
  });
  return hits;
}

export function findMcpSplitDocumentationDrift(root = repoRoot) {
  return [...findMonorepoLanguage(root), ...findMcpOwnershipDrift(root)];
}

function main() {
  const hits = findMcpSplitDocumentationDrift();
  if (hits.length > 0) {
    console.error(
      "Stale MCP ownership guidance found (KiCad MCP Pro owns server/schema source and publishing; this repository owns the extension client):",
    );
    for (const hit of hits) {
      console.error(`- ${hit.file}:${hit.line} [${hit.role}]: ${hit.snippet}`);
      console.error(`    ${hit.hint}`);
    }
    console.error(
      "\nHistorical records and explicit migration guards are preserved by path-role policy.",
    );
    process.exit(1);
  }
  console.log("No stale MCP ownership guidance found.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
