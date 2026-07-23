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
    "cli/exportCommands.ts",
    "components/componentSearch.ts",
    "library/pcmService.ts",
    "state/stateStores.ts",
  ]) {
    assert.match(
      architectureDoc,
      new RegExp(target.replaceAll(".", "\\."), "u"),
    );
  }
  assert.match(architectureDoc, /142 TypeScript modules/u);
  assert.match(architectureDoc, /0 import cycles/u);
});
