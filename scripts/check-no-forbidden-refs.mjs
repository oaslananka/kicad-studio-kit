#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ignoredDirs = new Set([
  ".git",
  "node_modules",
  ".venv",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".vscode-test",
  "__pycache__",
  "coverage",
  "htmlcov",
  "dist",
  "out",
  "site",
  ".codex-checkpoints",
  ".omo",
  ".hypothesis",
]);
const ignoredFiles = new Set(["pnpm-lock.yaml", "uv.lock"]);
const ignoredExts = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".whl",
  ".gz",
]);
const rawPatterns = [
  "dev" + "\\.azure\\.com",
  "visual" + "studio\\.com",
  "Azure " + "DevOps",
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
  "personal " + "canonical",
  "personal " + "repository",
  "showcase-" + "only",
  "mirror " + "automation",
  "manual " + "fallback " + "surfaces",
  "public " + "lab",
  "lab " + "workflow",
  "kicad-" + "studio/actions",
  "kicad-" + "mcp-pro/actions",
  "github\\.com/oaslananka/kicad-" + "studio(?!-kit)",
  "github\\.com/oaslananka/kicad-" + "mcp-pro",
  "oaslananka/kicad-" + "studio(?!-kit)",
  "(?<![@.])oaslananka/kicad-" + "mcp-pro",
  "oaslananka/kicad-" + "mcp(?![-\\w])",
  "depend" + "abot",
];
const patterns = rawPatterns.map((pattern) => [
  pattern.replaceAll("\\", ""),
  new RegExp(pattern, "i"),
]);
const visualStudioHostPattern =
  /(?:^|[^A-Za-z0-9.-])([A-Za-z0-9.-]*visualstudio\.com)(?=[^A-Za-z0-9.-]|$)/gi;
const allowedDependabotFiles = new Set([
  "docs/dependency-lifecycle.md",
  "docs/security.md",
  "docs/superpowers/plans/2026-07-21-dependabot-security-targets.md",
  "package.json",
  "scripts/check-dependabot-policy.mjs",
  "scripts/check-dependabot-policy.test.mjs",
]);

function isOfficialVscodeHostHit(line) {
  const hosts = [...line.matchAll(visualStudioHostPattern)].map((match) =>
    match[1].toLowerCase(),
  );
  return (
    hosts.length > 0 &&
    hosts.every(
      (host) =>
        host === "update.code.visualstudio.com" ||
        host === "code.visualstudio.com" ||
        host === "marketplace.visualstudio.com",
    )
  );
}

function isAllowedHit(label, line, relativePath) {
  return (
    (label === "(?<![@.])oaslananka/kicad-mcp-pro" &&
      line.includes("ghcr.io/oaslananka/kicad-mcp-pro")) ||
    (label === "visualstudio.com" && isOfficialVscodeHostHit(line)) ||
    (label === "dependabot" && allowedDependabotFiles.has(relativePath))
  );
}

function shouldSkip(root, file) {
  const relativePath = path.relative(root, file).replaceAll("\\", "/");
  const parts = relativePath.split("/");
  if (parts.some((part) => ignoredDirs.has(part))) return true;
  if (ignoredFiles.has(path.basename(file))) return true;
  if (ignoredExts.has(path.extname(file).toLowerCase())) return true;
  if (relativePath === "scripts/check-no-forbidden-refs.mjs") return true;
  if (relativePath === ".github/dependabot.yml") return true;
  return false;
}

function* walk(root, directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (shouldSkip(root, fullPath)) continue;
    if (entry.isDirectory()) yield* walk(root, fullPath);
    else if (entry.isFile()) yield fullPath;
  }
}

export function scanForbiddenReferences(rootDir = process.cwd()) {
  const root = path.resolve(rootDir);
  const hits = [];
  for (const file of walk(root, root)) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const relativePath = path.relative(root, file).replaceAll("\\", "/");
    const lines = text.split(/\r?\n/u);
    lines.forEach((line, index) => {
      for (const [label, regex] of patterns) {
        if (regex.test(line) && !isAllowedHit(label, line, relativePath)) {
          hits.push({
            file: relativePath,
            line: index + 1,
            pattern: label,
            snippet: line.trim().slice(0, 180),
          });
        }
      }
    });
  }
  return hits;
}

function main() {
  const hits = scanForbiddenReferences();
  if (hits.length > 0) {
    for (const hit of hits) {
      console.error(
        `${hit.file}:${hit.line}: forbidden reference ${hit.pattern}: ${hit.snippet}`,
      );
    }
    process.exit(1);
  }
  console.log("No forbidden repository references found.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
