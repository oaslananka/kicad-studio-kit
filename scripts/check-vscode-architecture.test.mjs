import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildTypeScriptImportGraph,
  extractRelativeImportSpecifiers,
  findImportCycles,
} from "./lib/typescript-import-graph.mjs";
import { validateVscodeArchitecture } from "./check-vscode-architecture.mjs";

function createFixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vscode-architecture-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  return root;
}

test("#497 extracts static relative imports and ignores packages", () => {
  assert.deepEqual(
    extractRelativeImportSpecifiers(`
      import type { A } from './a';
      export { B } from "../b";
      const c = import('./c');
      import './side-effect';
      import fs from 'node:fs';
    `),
    ["./a", "../b", "./side-effect", "./c"],
  );
});

test("#497 resolves index modules and reports an acyclic graph", () => {
  const root = createFixture({
    "a.ts": "import { b } from './b'; export const a = b;",
    "b/index.ts": "export const b = 1;",
  });
  try {
    const graph = buildTypeScriptImportGraph(root);
    assert.deepEqual(findImportCycles(graph), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("#497 reports every member of a production import cycle", () => {
  const root = createFixture({
    "a.ts": "import { b } from './b'; export const a = b;",
    "b.ts": "import { c } from './c'; export const b = c;",
    "c.ts": "import { a } from './a'; export const c = a;",
  });
  try {
    const cycles = findImportCycles(buildTypeScriptImportGraph(root));
    assert.deepEqual(cycles, [["a.ts", "b.ts", "c.ts"]]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("#497 repository production graph contains no cycles", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  assert.deepEqual(validateVscodeArchitecture(repoRoot).cycles, []);
});

test("#497 PCM catalog model has no production dependencies", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const sourceRoot = path.join(repoRoot, "apps", "vscode-extension", "src");
  const graph = buildTypeScriptImportGraph(sourceRoot);
  assert.deepEqual([...(graph.get("library/pcmCatalog.ts") ?? [])], []);

  const source = fs.readFileSync(
    path.join(sourceRoot, "library", "pcmCatalog.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /\b(?:import\s*(?:\(|[\s{*])|require\s*\()/u);
});

test("#497 PCM archive adapter depends only on reviewed Node built-ins", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const sourceRoot = path.join(repoRoot, "apps", "vscode-extension", "src");
  const graph = buildTypeScriptImportGraph(sourceRoot);
  assert.deepEqual([...(graph.get("library/pcmArchive.ts") ?? [])], []);

  const source = fs.readFileSync(
    path.join(sourceRoot, "library", "pcmArchive.ts"),
    "utf8",
  );
  const importSpecifiers = [...source.matchAll(/from ["']([^"']+)["']/gu)].map(
    (match) => match[1],
  );
  assert.deepEqual(importSpecifiers.toSorted(), [
    "node:crypto",
    "node:fs",
    "node:path",
    "node:zlib",
  ]);
  assert.doesNotMatch(source, /from ["'](?:vscode|\.)/u);
});

test("#497 PCM persistence adapter uses only reviewed filesystem and catalog dependencies", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const sourceRoot = path.join(repoRoot, "apps", "vscode-extension", "src");
  const graph = buildTypeScriptImportGraph(sourceRoot);
  assert.deepEqual(
    [...(graph.get("library/pcmPersistence.ts") ?? [])],
    ["library/pcmCatalog.ts"],
  );

  const source = fs.readFileSync(
    path.join(sourceRoot, "library", "pcmPersistence.ts"),
    "utf8",
  );
  const importSpecifiers = [...source.matchAll(/from ["']([^"']+)["']/gu)].map(
    (match) => match[1],
  );
  assert.deepEqual(importSpecifiers.toSorted(), [
    "./pcmCatalog",
    "node:fs",
    "node:path",
  ]);
  assert.doesNotMatch(source, /from ["']vscode["']/u);
});

test("#497 PCM library-table adapter uses only reviewed filesystem and catalog dependencies", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const sourceRoot = path.join(repoRoot, "apps", "vscode-extension", "src");
  const graph = buildTypeScriptImportGraph(sourceRoot);
  assert.deepEqual(
    [...(graph.get("library/pcmLibraryTable.ts") ?? [])],
    ["library/pcmCatalog.ts"],
  );

  const source = fs.readFileSync(
    path.join(sourceRoot, "library", "pcmLibraryTable.ts"),
    "utf8",
  );
  const importSpecifiers = [...source.matchAll(/from ["']([^"']+)["']/gu)].map(
    (match) => match[1],
  );
  assert.deepEqual(importSpecifiers.toSorted(), [
    "./pcmCatalog",
    "node:fs",
    "node:path",
  ]);
  assert.doesNotMatch(source, /from ["']vscode["']/u);
});

test("#497 root check cannot silently drop the architecture guard", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  assert.match(
    packageJson.scripts?.["check:vscode-architecture"] ?? "",
    /check-vscode-architecture/u,
  );
  assert.match(packageJson.scripts?.check ?? "", /check:vscode-architecture/u);

  const architectureDoc = fs.readFileSync(
    path.join(repoRoot, "docs", "architecture", "vscode-hotspots.md"),
    "utf8",
  );
  for (const target of [
    "providers/viewerHtml.ts",
    "providers/viewer/viewerControllerScript.ts",
    "cli/exportCommands.ts",
    "cli/exportCommandBuilder.ts",
    "components/componentSearch.ts",
    "components/componentSearchView.ts",
    "library/pcmService.ts",
    "library/pcmCatalog.ts",
    "library/pcmArchive.ts",
    "library/pcmPersistence.ts",
    "library/pcmLibraryTable.ts",
    "state/stateStores.ts",
  ]) {
    assert.match(
      architectureDoc,
      new RegExp(target.replaceAll(".", "\\."), "u"),
    );
  }
  assert.match(architectureDoc, /149 TypeScript modules/u);
  assert.match(architectureDoc, /0 import cycles/u);
});
