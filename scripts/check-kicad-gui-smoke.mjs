#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const workflowPath = path.join(root, ".github", "workflows", "kicad-gui-smoke.yml");
const rootPackagePath = path.join(root, "package.json");
const mcpPackagePath = path.join(root, "packages", "mcp-server", "package.json");
const pytestPath = path.join(
  root,
  "packages",
  "mcp-server",
  "tests",
  "gui",
  "test_kicad_gui_live_context.py",
);
const runnerPath = path.join(root, "packages", "mcp-server", "scripts", "run_pytest.py");
const pyprojectPath = path.join(root, "packages", "mcp-server", "pyproject.toml");
const strategyPath = path.join(root, "docs", "testing-strategy.md");

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`Missing ${path.relative(root, filePath)}: ${error.message}`);
  }
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function assertIncludes(haystack, needle, source) {
  if (!haystack.includes(needle)) {
    throw new Error(`${source} must include ${JSON.stringify(needle)}`);
  }
}

function assertExcludes(haystack, needle, source) {
  if (haystack.includes(needle)) {
    throw new Error(`${source} must not include ${JSON.stringify(needle)}`);
  }
}

const workflow = readText(workflowPath);
const pytest = readText(pytestPath);
const runner = readText(runnerPath);
const pyproject = readText(pyprojectPath);
const strategy = readText(strategyPath);
const rootScripts = readJson(rootPackagePath).scripts ?? {};
const mcpScripts = readJson(mcpPackagePath).scripts ?? {};

for (const phrase of [
  "name: KiCad GUI Smoke",
  "workflow_dispatch:",
  "schedule:",
  "cron:",
  "windows-primary:",
  "Windows primary KiCad GUI smoke",
  "windows-2025-vs2026",
  "choco install kicad --version=10.0.3 --yes --no-progress",
  "KICAD_GUI_SMOKE_BIN_DIR",
  "kicad-gui-smoke-windows-primary",
  "ubuntu-24.04",
  "xvfb-run",
  "dbus-run-session",
  "ppa:kicad/kicad-10.0-releases",
  "KICAD_MCP_ENABLE_GUI_SMOKE: \"1\"",
  "KICAD_MCP_GUI_SMOKE_REQUIRED: \"1\"",
  "corepack pnpm run test:kicad-gui-smoke",
  "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
  "if: always()",
  "retention-days: 14",
]) {
  assertIncludes(workflow, phrase, ".github/workflows/kicad-gui-smoke.yml");
}
assertExcludes(workflow, "pull_request:", ".github/workflows/kicad-gui-smoke.yml");
assertExcludes(workflow, "push:", ".github/workflows/kicad-gui-smoke.yml");

for (const phrase of [
  "OASLANA-44",
  "GitHub issue #35",
  "KICAD_MCP_ENABLE_GUI_SMOKE",
  "pcb_get_board_summary",
  "pcb_get_tracks",
  "pcb_get_footprints",
  "pcb_get_nets",
  "live-gui",
  "file-backed fallback",
  "project-switch",
  "failure-screenshot.png",
]) {
  assertIncludes(pytest, phrase, "GUI smoke pytest suite");
}

assertIncludes(runner, "\"gui\"", "packages/mcp-server/scripts/run_pytest.py");
assertIncludes(runner, "tests/gui/", "packages/mcp-server/scripts/run_pytest.py");
assertIncludes(pyproject, "\"gui:", "packages/mcp-server/pyproject.toml");

if (
  mcpScripts["test:gui-smoke"] !==
  "uv run --all-extras python scripts/run_pytest.py gui"
) {
  throw new Error("packages/mcp-server/package.json must define test:gui-smoke");
}
if (rootScripts["test:kicad-gui-smoke"] !== "pnpm --dir packages/mcp-server run test:gui-smoke") {
  throw new Error("package.json must define test:kicad-gui-smoke");
}
if (rootScripts["check:kicad-gui-smoke"] !== "node scripts/check-kicad-gui-smoke.mjs") {
  throw new Error("package.json must define check:kicad-gui-smoke");
}
if (!rootScripts.check?.includes("pnpm run check:kicad-gui-smoke")) {
  throw new Error("package.json check must run check:kicad-gui-smoke");
}

for (const phrase of [
  "OASLANA-44",
  ".github/workflows/kicad-gui-smoke.yml",
  "corepack pnpm run check:kicad-gui-smoke",
  "corepack pnpm run test:kicad-gui-smoke",
  "KiCad IPC API",
]) {
  assertIncludes(strategy, phrase, "docs/testing-strategy.md");
}
