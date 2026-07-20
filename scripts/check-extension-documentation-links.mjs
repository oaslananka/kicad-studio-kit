#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import {
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryDocumentationUrlPattern =
  /https:\/\/github\.com\/oaslananka\/kicad-studio-kit\/blob\/main\/([^'"`<>\s?#)]+)/gu;

function toPosixPath(value) {
  return value.split(sep).join("/");
}

function walkTypeScriptFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkTypeScriptFiles(absolutePath));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(absolutePath);
    }
  }
  return files;
}

function normalizeRepositoryTarget(rawTarget) {
  let decodedTarget;
  try {
    decodedTarget = decodeURIComponent(rawTarget);
  } catch {
    return undefined;
  }

  if (
    decodedTarget.includes("\\") ||
    isAbsolute(decodedTarget) ||
    decodedTarget.split("/").includes("..")
  ) {
    return undefined;
  }

  const normalizedTarget = posix.normalize(decodedTarget);
  if (
    normalizedTarget === "." ||
    normalizedTarget === ".." ||
    normalizedTarget.startsWith("../")
  ) {
    return undefined;
  }

  return normalizedTarget;
}

export function collectExtensionDocumentationLinkErrors({
  repoRoot = defaultRepoRoot,
} = {}) {
  const absoluteRepoRoot = resolve(repoRoot);
  const sourceRoot = join(absoluteRepoRoot, "apps", "vscode-extension", "src");
  const errors = [];

  for (const sourcePath of walkTypeScriptFiles(sourceRoot)) {
    const source = readFileSync(sourcePath, "utf8");
    repositoryDocumentationUrlPattern.lastIndex = 0;

    for (const match of source.matchAll(repositoryDocumentationUrlPattern)) {
      const rawTarget = match[1];
      const line = source.slice(0, match.index).split("\n").length;
      const sourceLabel = toPosixPath(relative(absoluteRepoRoot, sourcePath));
      const normalizedTarget = normalizeRepositoryTarget(rawTarget);

      if (!normalizedTarget) {
        errors.push(
          `${sourceLabel}:${line} unsafe repository documentation target: ${rawTarget}`,
        );
        continue;
      }

      const absoluteTarget = resolve(absoluteRepoRoot, normalizedTarget);
      const repositoryPrefix = `${absoluteRepoRoot}${sep}`;
      if (!absoluteTarget.startsWith(repositoryPrefix)) {
        errors.push(
          `${sourceLabel}:${line} unsafe repository documentation target: ${rawTarget}`,
        );
        continue;
      }

      if (!existsSync(absoluteTarget) || !statSync(absoluteTarget).isFile()) {
        errors.push(
          `${sourceLabel}:${line} missing repository documentation target: ${normalizedTarget}`,
        );
      }
    }
  }

  return errors;
}

function run() {
  const errors = collectExtensionDocumentationLinkErrors();
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Extension documentation links are valid.");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  run();
}
