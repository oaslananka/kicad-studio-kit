#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  buildTypeScriptImportGraph,
  findImportCycles,
} from "./lib/typescript-import-graph.mjs";

export function validateVscodeArchitecture(repoRoot) {
  const sourceRoot = path.join(
    path.resolve(repoRoot),
    "apps",
    "vscode-extension",
    "src",
  );
  const graph = buildTypeScriptImportGraph(sourceRoot);
  return {
    files: graph.size,
    cycles: findImportCycles(graph),
  };
}

function runCli() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDirectory, "..");
  const result = validateVscodeArchitecture(repoRoot);
  if (result.cycles.length > 0) {
    console.error("VS Code production import cycles found:");
    for (const cycle of result.cycles) {
      console.error(`- ${cycle.join(" -> ")} -> ${cycle[0]}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(
    `VS Code architecture check passed: ${result.files} production TypeScript modules, 0 cycles.`,
  );
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  runCli();
}
