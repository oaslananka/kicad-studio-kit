#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_ROOT, "..");
const EXPECTED_CHECK_SCRIPT =
  "node scripts/check-devcontainer.mjs && node --test scripts/check-devcontainer.test.mjs scripts/dev-doctor.test.mjs";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(repoRoot, relativePath, errors) {
  const filePath = path.join(repoRoot, relativePath);
  try {
    return readFileSync(filePath, "utf8");
  } catch (error) {
    errors.push(`Missing ${relativePath}: ${error.message}`);
    return "";
  }
}

function readJson(repoRoot, relativePath, errors) {
  const text = readText(repoRoot, relativePath, errors);
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    errors.push(`${relativePath} must be strict JSON: ${error.message}`);
    return null;
  }
}

function requireIncludes(errors, source, text, phrase) {
  if (!text.includes(phrase)) {
    errors.push(`${source} must include ${JSON.stringify(phrase)}`);
  }
}

function requireArrayIncludes(errors, source, values, expected) {
  if (!Array.isArray(values) || !values.includes(expected)) {
    errors.push(`${source} must include ${expected}`);
  }
}

function requireExecutable(errors, repoRoot, relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  if (!existsSync(filePath)) {
    errors.push(`${relativePath} must exist`);
    return;
  }
  if (process.platform !== "win32" && (statSync(filePath).mode & 0o111) === 0) {
    errors.push(`${relativePath} must be executable`);
  }
}

function validateDevcontainerJson(errors, config) {
  if (!isRecord(config)) {
    errors.push(".devcontainer/devcontainer.json must be a JSON object");
    return;
  }

  if (config.name !== "KiCad Studio Kit") {
    errors.push("devcontainer name must be KiCad Studio Kit");
  }
  if (config.build?.dockerfile !== "Dockerfile") {
    errors.push("devcontainer build.dockerfile must be Dockerfile");
  }
  if (config.build?.context !== "..") {
    errors.push("devcontainer build.context must be ..");
  }
  if (config.remoteUser !== "vscode") {
    errors.push("devcontainer remoteUser must be vscode");
  }
  if (config.postCreateCommand !== "bash .devcontainer/postCreateCommand.sh") {
    errors.push("devcontainer postCreateCommand must run postCreateCommand.sh");
  }
  if (config.waitFor !== "postCreateCommand") {
    errors.push("devcontainer waitFor must be postCreateCommand");
  }

  const containerEnv = config.containerEnv ?? {};
  for (const [name, expected] of Object.entries({
    KICAD_STUDIO_DEVCONTAINER: "1",
    PLAYWRIGHT_BROWSERS_PATH: "/ms-playwright",
    UV_LINK_MODE: "copy",
    UV_PYTHON: "3.13",
  })) {
    if (containerEnv[name] !== expected) {
      errors.push(`devcontainer containerEnv.${name} must be ${expected}`);
    }
  }

  const nodeFeature =
    config.features?.["ghcr.io/devcontainers/features/node:1"];
  if (!isRecord(nodeFeature)) {
    errors.push(
      "devcontainer must include the official Node devcontainer feature",
    );
  } else {
    if (nodeFeature.version !== "24") {
      errors.push("Node devcontainer feature must install Node 24");
    }
    if (nodeFeature.pnpmVersion !== "none") {
      errors.push("Node devcontainer feature must leave pnpm to Corepack");
    }
    if (nodeFeature.nodeGypDependencies !== true) {
      errors.push(
        "Node devcontainer feature must install node-gyp dependencies",
      );
    }
  }
  if (
    !isRecord(config.features?.["ghcr.io/devcontainers/features/github-cli:1"])
  ) {
    errors.push("devcontainer must include the official GitHub CLI feature");
  }

  const extensions = config.customizations?.vscode?.extensions;
  for (const extension of [
    "charliermarsh.ruff",
    "dbaeumer.vscode-eslint",
    "ms-playwright.playwright",
    "ms-python.python",
  ]) {
    requireArrayIncludes(
      errors,
      "devcontainer VS Code extensions",
      extensions,
      extension,
    );
  }
}

export function validateDevcontainerRepository(repoRoot = DEFAULT_REPO_ROOT) {
  const errors = [];
  const config = readJson(repoRoot, ".devcontainer/devcontainer.json", errors);
  const dockerfile = readText(repoRoot, ".devcontainer/Dockerfile", errors);
  const postCreate = readText(
    repoRoot,
    ".devcontainer/postCreateCommand.sh",
    errors,
  );
  const docs = readText(repoRoot, "docs/devcontainer.md", errors);
  const readme = readText(repoRoot, "README.md", errors);
  const contributing = readText(repoRoot, "CONTRIBUTING.md", errors);
  const docsContributing = readText(repoRoot, "docs/contributing.md", errors);
  const packageJson = readJson(repoRoot, "package.json", errors);

  validateDevcontainerJson(errors, config);
  requireExecutable(errors, repoRoot, ".devcontainer/postCreateCommand.sh");

  for (const phrase of [
    "FROM mcr.microsoft.com/devcontainers/python:3.13-bookworm",
    "ARG ACTIONLINT_VERSION=1.7.12",
    "ARG UV_VERSION=0.11.16",
    "shellcheck",
    "apt-cache show kicad",
    "actionlint_${ACTIONLINT_VERSION}_${actionlint_arch}.tar.gz",
    "sha256sum -c -",
    "PLAYWRIGHT_BROWSERS_PATH=/ms-playwright",
    "USER vscode",
  ]) {
    requireIncludes(errors, ".devcontainer/Dockerfile", dockerfile, phrase);
  }

  for (const phrase of [
    "corepack enable pnpm",
    "corepack pnpm install --frozen-lockfile",
    "uv sync --all-extras --frozen --project packages/mcp-server",
    "corepack pnpm --filter kicadstudio exec playwright install --with-deps chromium",
    "corepack pnpm run check:devcontainer",
    "corepack pnpm run dev-doctor -- --require-devcontainer",
  ]) {
    requireIncludes(
      errors,
      ".devcontainer/postCreateCommand.sh",
      postCreate,
      phrase,
    );
  }

  for (const phrase of [
    "Node 24",
    "pnpm 11",
    "Python 3.13",
    "uv 0.11.16",
    "actionlint 1.7.12",
    "shellcheck",
    "GitHub CLI",
    "Playwright",
    "KiCad GUI",
    "corepack pnpm run dev-doctor -- --require-devcontainer",
    "corepack pnpm run check:devcontainer",
  ]) {
    requireIncludes(errors, "docs/devcontainer.md", docs, phrase);
  }

  requireIncludes(errors, "README.md", readme, "docs/devcontainer.md");
  requireIncludes(
    errors,
    "CONTRIBUTING.md",
    contributing,
    "corepack pnpm run check:devcontainer",
  );
  requireIncludes(
    errors,
    "docs/contributing.md",
    docsContributing,
    "corepack pnpm run check:devcontainer",
  );

  const scripts = packageJson?.scripts ?? {};
  if (scripts["check:devcontainer"] !== EXPECTED_CHECK_SCRIPT) {
    errors.push("package.json must define check:devcontainer");
  }
  if (scripts["dev-doctor"] !== "node scripts/dev-doctor.mjs") {
    errors.push("package.json must define dev-doctor");
  }
  if (scripts["dev:doctor"] !== "node scripts/dev-doctor.mjs") {
    errors.push("package.json must define dev:doctor");
  }
  if (
    scripts["check:dev-doctor"] !== "node scripts/dev-doctor.mjs --ci --strict"
  ) {
    errors.push("package.json must define check:dev-doctor");
  }
  if (!scripts.check?.includes("pnpm run check:devcontainer")) {
    errors.push("package.json check must run check:devcontainer");
  }
  if (!scripts.check?.includes("pnpm run check:dev-doctor")) {
    errors.push("package.json check must run check:dev-doctor");
  }

  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = validateDevcontainerRepository();
  if (errors.length > 0) {
    console.error("Devcontainer validation failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
  } else {
    console.log("Devcontainer validation passed.");
  }
}
