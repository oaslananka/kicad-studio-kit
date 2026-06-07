#!/usr/bin/env node
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, extname, join, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const examplesRoot = join(repoRoot, "examples");
const manifestPath = join(examplesRoot, "manifest.json");

const requiredExampleIds = [
  "led-basic",
  "mcp-demo",
];

const requiredWorkflowPhrases = [
  "Basic schematic and PCB viewer",
  "DRC and ERC workflow",
  "BOM and netlist workflow",
  "MCP connected workflow",
  "MCP degraded workflow",
];

const requiredReadmeSections = [
  "## Purpose",
  "## Files",
  "## KiCad Version Compatibility",
  "## Extension Workflow",
  "## MCP Workflow",
  "## Smoke Commands",
  "## Expected Outputs",
];

const forbiddenGeneratedOutputs = new Set([
  ".bom",
  ".csv",
  ".drl",
  ".gbr",
  ".gbrjob",
  ".net",
  ".pos",
  ".rpt",
  ".step",
  ".stp",
  ".svg",
  ".zip",
]);

function toPosixPath(path) {
  return path.split(sep).join("/");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function includesNormalized(haystack, needle) {
  const normalizedHaystack = haystack.replace(/\s+/gu, " ");
  const normalizedNeedle = needle.replace(/\s+/gu, " ");
  return normalizedHaystack.includes(normalizedNeedle);
}

function assertFile(path, errors) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    errors.push(`Missing file: ${toPosixPath(relative(repoRoot, path))}`);
  }
}

function assertDirectory(path, errors) {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    errors.push(`Missing directory: ${toPosixPath(relative(repoRoot, path))}`);
  }
}

function walkFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(absolutePath));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }
  return files;
}

function validateRootWiring(errors) {
  const packageJson = readJson(join(repoRoot, "package.json"));
  if (
    packageJson.scripts?.["check:examples"] !==
    "node scripts/check-examples.mjs && node --test scripts/check-examples.test.mjs"
  ) {
    errors.push("package.json must define check:examples");
  }
  if (!packageJson.scripts?.check?.includes("pnpm run check:examples")) {
    errors.push("package.json check must run check:examples");
  }

  const rootReadme = readFileSync(join(repoRoot, "README.md"), "utf8");
  if (!rootReadme.includes("examples/README.md")) {
    errors.push("README.md must link to examples/README.md");
  }
}

function validateManifest(errors) {
  assertFile(manifestPath, errors);
  if (!existsSync(manifestPath)) {
    return undefined;
  }

  const manifest = readJson(manifestPath);
  if (manifest.version !== 1) {
    errors.push("examples/manifest.json must use version 1");
  }
  if (manifest.source !== "OASLANA-77") {
    errors.push("examples/manifest.json must identify source OASLANA-77");
  }
  if (!manifest.policy?.includes("not deterministic fixtures")) {
    errors.push(
      "examples/manifest.json must state examples are not deterministic fixtures",
    );
  }

  const ids = new Set(manifest.examples?.map((example) => example.id) ?? []);
  for (const expectedId of requiredExampleIds) {
    if (!ids.has(expectedId)) {
      errors.push(`examples/manifest.json missing example ${expectedId}`);
    }
  }

  const workflowCoverage = new Set(
    (manifest.examples ?? []).flatMap((example) => example.workflows ?? []),
  );
  for (const phrase of requiredWorkflowPhrases) {
    if (!workflowCoverage.has(phrase)) {
      errors.push(`examples/manifest.json missing workflow: ${phrase}`);
    }
  }

  return manifest;
}

function validateExamplesOverview(manifest, errors) {
  const readmePath = join(examplesRoot, "README.md");
  assertFile(readmePath, errors);
  if (!existsSync(readmePath) || !manifest) {
    return;
  }

  const readme = readFileSync(readmePath, "utf8");
  for (const id of requiredExampleIds) {
    if (!readme.includes(`${id}/README.md`)) {
      errors.push(`examples/README.md must link to ${id}/README.md`);
    }
  }
  for (const phrase of [
    "separate from deterministic automated fixtures",
    "release smoke",
  ]) {
    if (!readme.includes(phrase)) {
      errors.push(`examples/README.md must mention ${phrase}`);
    }
  }
}

function validateExample(example, errors) {
  const exampleRoot = join(examplesRoot, example.id);
  assertDirectory(exampleRoot, errors);
  if (!existsSync(exampleRoot)) {
    return;
  }

  const readmePath = join(exampleRoot, "README.md");
  assertFile(readmePath, errors);
  const readme = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : "";

  if (!readme.startsWith(`# ${example.title}`)) {
    errors.push(`${example.id}/README.md must start with the manifest title`);
  }

  for (const heading of requiredReadmeSections) {
    if (!readme.includes(heading)) {
      errors.push(`${example.id}/README.md missing ${heading}`);
    }
  }

  for (const workflow of example.workflows ?? []) {
    if (!includesNormalized(readme, workflow)) {
      errors.push(`${example.id}/README.md missing workflow ${workflow}`);
    }
  }

  const projectFiles = example.projectFiles ?? [];
  for (const file of projectFiles) {
    assertFile(join(exampleRoot, file), errors);
  }

  const projectExtensions = new Set(projectFiles.map((file) => extname(file)));
  for (const extension of [".kicad_pro", ".kicad_sch", ".kicad_pcb"]) {
    if (!projectExtensions.has(extension)) {
      errors.push(`${example.id} must declare a ${extension} project file`);
    }
  }

  for (const file of walkFiles(exampleRoot)) {
    const relativePath = toPosixPath(relative(exampleRoot, file));
    if (relativePath === "README.md" || projectFiles.includes(relativePath)) {
      continue;
    }
    if (forbiddenGeneratedOutputs.has(extname(file).toLowerCase())) {
      errors.push(
        `${example.id} must not commit generated output ${relativePath}`,
      );
    }
  }
}

function runKiCadSmoke(manifest, errors) {
  const smokeExample = manifest.examples.find(
    (example) => example.releaseSmoke,
  );
  if (!smokeExample) {
    errors.push("examples/manifest.json must mark one releaseSmoke example");
    return;
  }

  const projectRoot = join(examplesRoot, smokeExample.id);
  const schematic = smokeExample.projectFiles.find((file) =>
    file.endsWith(".kicad_sch"),
  );
  const board = smokeExample.projectFiles.find((file) =>
    file.endsWith(".kicad_pcb"),
  );
  const outputDir = mkdtempSync(join(tmpdir(), "kicad-examples-"));

  try {
    const erc = spawnSync(
      "kicad-cli",
      [
        "sch",
        "erc",
        "--format",
        "json",
        "--output",
        join(outputDir, `${smokeExample.id}-erc.json`),
        "--severity-all",
        "--exit-code-violations",
        join(projectRoot, schematic),
      ],
      { encoding: "utf8" },
    );
    if (erc.status !== 0) {
      errors.push(`kicad-cli ERC failed for ${smokeExample.id}: ${erc.stderr}`);
    }

    const drc = spawnSync(
      "kicad-cli",
      [
        "pcb",
        "drc",
        "--format",
        "json",
        "--output",
        join(outputDir, `${smokeExample.id}-drc.json`),
        "--severity-all",
        "--schematic-parity",
        "--exit-code-violations",
        join(projectRoot, board),
      ],
      { encoding: "utf8" },
    );
    if (drc.status !== 0) {
      errors.push(`kicad-cli DRC failed for ${smokeExample.id}: ${drc.stderr}`);
    }
  } finally {
    rmSync(outputDir, { force: true, recursive: true });
  }
}

const errors = [];
validateRootWiring(errors);
const manifest = validateManifest(errors);
validateExamplesOverview(manifest, errors);

if (manifest) {
  for (const example of manifest.examples ?? []) {
    validateExample(example, errors);
  }

  if (process.argv.includes("--kicad-cli")) {
    runKiCadSmoke(manifest, errors);
  }
}

if (errors.length > 0) {
  console.error("Examples contract violations found:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  console.error("Run `corepack pnpm run check:examples` after fixing.");
  process.exit(1);
}

console.log(
  `Examples contract is current: ${requiredExampleIds.length} project examples`,
);
