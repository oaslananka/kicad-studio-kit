#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const ignoredDirs = new Set([
  ".git",
  "node_modules",
  ".venv",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  "__pycache__",
  "coverage",
  "htmlcov",
  "dist",
  "out",
  "site",
  ".codex-checkpoints",
]);
const ignoredFiles = new Set(["pnpm-lock.yaml", "uv.lock"]);
const ignoredExts = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".whl", ".gz"]);
const rawPatterns = [
  "dev" + "\\.azure\\.com",
  "visual" + "studio\\.com",
  "azure-" + "pipelines",
  "azure-" + "pipelines-ci\\.yml",
  "\\." + "gitlab-ci\\.yml",
  "git" + "lab\\.com",
  "Git" + "Lab CI",
  "oaslananka-" + "ops/",
  "mirror-" + "personal",
  "mirror-" + "to-ops",
  "showcase " + "mirror",
  "personal " + "showcase " + "mirror",
  "public " + "lab",
  "lab " + "workflow",
  "kicad-" + "studio/actions",
  "kicad-" + "mcp-pro/actions",
  "github\\.com/oaslananka/kicad-" + "studio(?!-kit)",
  "github\\.com/oaslananka/kicad-" + "mcp-pro",
];
const patterns = rawPatterns.map((pattern) => [
  pattern.replaceAll("\\", ""),
  new RegExp(pattern, "i"),
]);

function shouldSkip(file) {
  const rel = path.relative(root, file).replaceAll("\\", "/");
  const parts = rel.split("/");
  if (parts.some((part) => ignoredDirs.has(part))) return true;
  if (ignoredFiles.has(path.basename(file))) return true;
  if (ignoredExts.has(path.extname(file).toLowerCase())) return true;
  if (rel === "scripts/check-no-forbidden-refs.mjs") return true;
  return false;
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (shouldSkip(full)) continue;
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

const hits = [];
for (const file of walk(root)) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const [label, regex] of patterns) {
      if (regex.test(line)) {
        hits.push({
          file: path.relative(root, file).replaceAll("\\", "/"),
          line: index + 1,
          pattern: label,
          snippet: line.trim().slice(0, 180),
        });
      }
    }
  });
}

if (hits.length > 0) {
  for (const hit of hits) {
    console.error(`${hit.file}:${hit.line}: forbidden reference ${hit.pattern}: ${hit.snippet}`);
  }
  process.exit(1);
}

console.log("No forbidden repository references found.");
