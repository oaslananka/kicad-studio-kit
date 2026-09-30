#!/usr/bin/env node
// Jest runs inside apps/vscode-extension and reports SF:src/... paths.
// SonarQube Cloud scans at the repository root, so source paths must be
// repository-relative, validated, and deterministic before ingestion.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const LCOV_PATH = "apps/vscode-extension/coverage/lcov.info";
const EXTENSION_PREFIX = "apps/vscode-extension/";
const JEST_SOURCE_PREFIX = "src/";

export function normalizeSonarLcov(root = REPO_ROOT, reportPath = LCOV_PATH) {
  const lcovFile = path.resolve(root, reportPath);
  const content = readFileSync(lcovFile, "utf8");
  let sources = 0;
  const normalized = content.split(/\r?\n/u).map((line) => {
    if (!line.startsWith("SF:")) return line;

    const original = line.slice(3);
    const relative = original.startsWith(JEST_SOURCE_PREFIX)
      ? EXTENSION_PREFIX + original
      : original;
    if (
      !relative.startsWith(EXTENSION_PREFIX + JEST_SOURCE_PREFIX) ||
      relative.includes("\\") ||
      path.posix.normalize(relative) !== relative ||
      !existsSync(path.join(root, relative))
    ) {
      throw new Error(
        `Refusing to publish unresolvable or unsafe LCOV source path: ${original}`,
      );
    }
    sources += 1;
    return "SF:" + relative;
  });

  if (sources === 0) throw new Error("Missing LCOV source records (SF:)");
  writeFileSync(lcovFile, normalized.join("\n"));
  return sources;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const count = normalizeSonarLcov();
  console.log(`Prepared real LCOV source paths for SonarCloud: ${count} files`);
}
