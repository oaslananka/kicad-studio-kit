#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const docsRoot = path.join(repoRoot, "docs");
const args = new Set(process.argv.slice(2));
const checkAll = args.size === 0 || args.has("--all");

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".vitepress" || entry.name === "public") {
        return [];
      }
      return walk(fullPath);
    }
    return entry.isFile() && entry.name.endsWith(".md") ? [fullPath] : [];
  });
}

function relativeToRepo(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function slugify(text) {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/`([^`]+)`/gu, "$1");
  return Array.from(normalized)
    .map((character) => {
      if (/[\p{Letter}\p{Number}]/u.test(character)) {
        return character;
      }
      if (/[\s-]/u.test(character)) {
        return "-";
      }
      return "";
    })
    .join("")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function anchorsFor(markdown) {
  const anchors = new Set();
  for (const line of markdown.split(/\r?\n/u)) {
    const heading = line.match(/^(#{1,6})\s+(.+)$/u);
    if (heading) {
      anchors.add(slugify(heading[2].replace(/\s+#*$/u, "")));
    }
  }
  return anchors;
}

function isIgnoredUrl(target) {
  return (
    target.startsWith("http://") ||
    target.startsWith("https://") ||
    target.startsWith("mailto:") ||
    target.startsWith("command:") ||
    target.startsWith("vscode:")
  );
}

function extractLinks(markdown) {
  const links = [];
  const markdownLink = /(?<!!)\[[^\]]+\]\(([^)]+)\)/gu;
  let match;
  while ((match = markdownLink.exec(markdown)) !== null) {
    links.push(match[1].trim());
  }
  return links.filter((link) => link && !link.startsWith("<"));
}

function resolveTarget(filePath, target) {
  const [withoutHash, hash = ""] = target.split("#", 2);
  const cleanTarget = withoutHash.split("?")[0];
  if (!cleanTarget && hash) {
    return { filePath, hash };
  }
  if (cleanTarget.startsWith("/")) {
    const normalized = cleanTarget.replace(/^\/kicad-studio-kit/u, "");
    return {
      filePath: path.join(docsRoot, normalized.replace(/^\/+/u, "")),
      hash,
    };
  }
  return { filePath: path.resolve(path.dirname(filePath), cleanTarget), hash };
}

function candidateFiles(targetPath) {
  const candidates = [targetPath];
  if (!path.extname(targetPath)) {
    candidates.push(`${targetPath}.md`);
    candidates.push(path.join(targetPath, "index.md"));
  }
  if (targetPath.endsWith(".html")) {
    candidates.push(targetPath.replace(/\.html$/u, ".md"));
  }
  return candidates;
}

function checkMarkdown(files) {
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const rel = relativeToRepo(file);
    const lines = content.split(/\r?\n/u);
    let h1Count = 0;
    lines.forEach((line, index) => {
      if (/[ \t]$/u.test(line)) {
        fail(`${rel}:${index + 1}: trailing whitespace`);
      }
      if (/^\t/u.test(line)) {
        fail(`${rel}:${index + 1}: leading tab`);
      }
      const heading = line.match(/^(#{1,6})\s+(.+)$/u);
      if (heading) {
        const level = heading[1].length;
        if (level === 1) {
          h1Count += 1;
        }
      }
    });
    if (!content.endsWith("\n")) {
      fail(`${rel}: missing final newline`);
    }
    const isHome = rel === "docs/index.md";
    if (!isHome && h1Count !== 1) {
      fail(`${rel}: expected exactly one h1 heading, found ${h1Count}`);
    }
  }
}

function checkLinks(files) {
  const anchorCache = new Map();
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const rel = relativeToRepo(file);
    for (const rawLink of extractLinks(content)) {
      const target = rawLink.replace(/^<|>$/gu, "");
      if (isIgnoredUrl(target)) {
        continue;
      }
      const { filePath: resolvedPath, hash } = resolveTarget(
        file,
        decodeURI(target),
      );
      const existing = candidateFiles(resolvedPath).find((candidate) =>
        fs.existsSync(candidate),
      );
      if (!existing) {
        fail(`${rel}: broken internal link ${rawLink}`);
        continue;
      }
      if (hash) {
        if (!anchorCache.has(existing)) {
          anchorCache.set(
            existing,
            anchorsFor(fs.readFileSync(existing, "utf8")),
          );
        }
        const anchors = anchorCache.get(existing);
        if (!anchors.has(hash)) {
          fail(`${rel}: missing anchor ${rawLink}`);
        }
      }
    }
  }
}

function checkGeneratedFreshness() {
  const before = new Map(
    walk(docsRoot).map((file) => [
      relativeToRepo(file),
      fs.readFileSync(file, "utf8"),
    ]),
  );
  const result = awaitImportGenerator();
  if (result !== 0) {
    fail("docs generator failed");
    return;
  }
  for (const [relativePath, oldContent] of before) {
    const fullPath = path.join(repoRoot, relativePath);
    if (
      fs.existsSync(fullPath) &&
      fs.readFileSync(fullPath, "utf8") !== oldContent
    ) {
      fail(`${relativePath}: generated docs are stale`);
    }
  }
}

function awaitImportGenerator() {
  try {
    const generator = path.join(repoRoot, "scripts/generate-docs-site.mjs");
    const result = spawnSync(process.execPath, [generator], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: "pipe",
    });
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    return result.status ?? 1;
  } catch (error) {
    console.error(error);
    return 1;
  }
}

const files = walk(docsRoot);
if (checkAll || args.has("--generated")) {
  checkGeneratedFreshness();
}
if (checkAll || args.has("--markdown")) {
  checkMarkdown(files);
}
if (checkAll || args.has("--links")) {
  checkLinks(files);
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("docs site checks passed");
