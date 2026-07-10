#!/usr/bin/env node

// Guards against reintroducing pre-split "MCP monorepo" language that presents
// this repository as the home of the KiCad MCP Pro server. The server source
// moved to oaslananka/kicad-mcp-pro (ADR 0009); this repository owns only the VS
// Code extension and the extension-side MCP integration contract.
//
// Historical records that legitimately describe the old monorepo state — ADRs,
// generated/​product changelogs, and dated migration plans — are exempt.

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

// Locations allowed to record the historical monorepo state verbatim.
const HISTORICAL_PREFIXES = [
  "docs/adr/",
  "docs/changelog/",
  "docs/superpowers/",
];

export function isHistorical(relativePath) {
  const rel = relativePath.replaceAll("\\", "/");
  return (
    HISTORICAL_PREFIXES.some((prefix) => rel.startsWith(prefix)) ||
    rel.endsWith("CHANGELOG.md") ||
    rel === "scripts/check-mcp-split-docs.mjs" ||
    rel === "scripts/check-mcp-split-docs.test.mjs"
  );
}

// Present-tense claims that this repository still co-locates the MCP server.
// Each pattern targets language removed during the #396 cleanup so it cannot
// silently return.
export const FORBIDDEN_PHRASES = [
  {
    pattern: /Monorepo for KiCad Studio VS Code extension and KiCad MCP Pro/iu,
    hint: "Describe this repository as the VS Code extension repo; the MCP server is released from oaslananka/kicad-mcp-pro.",
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
    hint: "The MCP server and npm launcher live in oaslananka/kicad-mcp-pro, not this repository.",
  },
];

export function scanLine(line) {
  return FORBIDDEN_PHRASES.filter((rule) => rule.pattern.test(line));
}

function shouldSkip(relativePath, name) {
  if (IGNORED_FILES.has(name)) return true;
  if (IGNORED_EXTS.has(path.extname(name).toLowerCase())) return true;
  return isHistorical(relativePath);
}

export function findMonorepoLanguage(root = repoRoot) {
  const hits = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).replaceAll("\\", "/");
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (shouldSkip(rel, entry.name)) continue;
      let text;
      try {
        text = fs.readFileSync(full, "utf8");
      } catch {
        continue;
      }
      text.split(/\r?\n/u).forEach((line, index) => {
        for (const rule of scanLine(line)) {
          hits.push({
            file: rel,
            line: index + 1,
            snippet: line.trim().slice(0, 160),
            hint: rule.hint,
          });
        }
      });
    }
  };
  walk(root);
  return hits;
}

function main() {
  const hits = findMonorepoLanguage();
  if (hits.length > 0) {
    console.error(
      "Stale MCP-monorepo language found (the MCP server lives in oaslananka/kicad-mcp-pro; see ADR 0009):",
    );
    for (const hit of hits) {
      console.error(`- ${hit.file}:${hit.line}: ${hit.snippet}`);
      console.error(`    ${hit.hint}`);
    }
    console.error(
      "\nHistorical records under docs/adr/, docs/changelog/, docs/superpowers/, and CHANGELOG.md are exempt.",
    );
    process.exit(1);
  }
  console.log("No stale MCP-monorepo language found.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
