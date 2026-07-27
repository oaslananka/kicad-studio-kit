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

test("#497 BOM and Component Search type modules are dependency-free", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const sourceRoot = path.join(repoRoot, "apps", "vscode-extension", "src");
  const graph = buildTypeScriptImportGraph(sourceRoot);
  for (const target of [
    "bom/bomTypes.ts",
    "components/componentSearchTypes.ts",
  ]) {
    assert.deepEqual([...(graph.get(target) ?? [])], []);
    const source = fs.readFileSync(path.join(sourceRoot, target), "utf8");
    assert.doesNotMatch(source, /import/u);
    assert.doesNotMatch(source, /from ["'](?:node:|vscode)/u);
  }
});

test("#497 domain owners do not regress to broad moved-type imports", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const sourceRoot = path.join(repoRoot, "apps", "vscode-extension", "src");
  const targets = [
    "bom/bomExporter.ts",
    "bom/bomParser.ts",
    "bom/bomRisk.ts",
    "bom/bomWebviewManager.ts",
    "components/componentSearch.ts",
    "components/componentSearchCache.ts",
    "components/componentSearchProviders.ts",
    "components/componentSearchRanking.ts",
    "components/componentSearchView.ts",
    "components/lcscClient.ts",
    "components/octopartClient.ts",
    "library/pcmService.ts",
  ];
  for (const target of targets) {
    const source = fs.readFileSync(path.join(sourceRoot, target), "utf8");
    assert.doesNotMatch(source, /from ["']\.\.\/types["']/u);
  }

  const compatibility = fs.readFileSync(
    path.join(sourceRoot, "types.ts"),
    "utf8",
  );
  assert.match(
    compatibility,
    /export type \{[^}]+\} from ["']\.\/bom\/bomTypes["']/su,
  );
  assert.match(
    compatibility,
    /export type \{[^}]+\} from ["']\.\/components\/componentSearchTypes["']/su,
  );
});

test("#497 Component Search provider coordinator uses only reviewed provider-model dependencies", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const sourceRoot = path.join(repoRoot, "apps", "vscode-extension", "src");
  const graph = buildTypeScriptImportGraph(sourceRoot);
  assert.deepEqual(
    [...(graph.get("components/componentSearchProviders.ts") ?? [])],
    ["components/componentSearchTypes.ts"],
  );

  const source = fs.readFileSync(
    path.join(sourceRoot, "components", "componentSearchProviders.ts"),
    "utf8",
  );
  const importSpecifiers = [...source.matchAll(/from ["']([^"']+)["']/gu)].map(
    (match) => match[1],
  );
  assert.deepEqual(importSpecifiers.toSorted(), ["./componentSearchTypes"]);
  assert.doesNotMatch(source, /from ["'](?:node:|vscode)/u);
});

test("#497 Component Search ranking model uses only reviewed result-model dependencies", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const sourceRoot = path.join(repoRoot, "apps", "vscode-extension", "src");
  const graph = buildTypeScriptImportGraph(sourceRoot);
  assert.deepEqual(
    [...(graph.get("components/componentSearchRanking.ts") ?? [])],
    [
      "bom/bomTypes.ts",
      "components/componentSearchTypes.ts",
      "components/componentSearchView.ts",
    ],
  );

  const source = fs.readFileSync(
    path.join(sourceRoot, "components", "componentSearchRanking.ts"),
    "utf8",
  );
  const importSpecifiers = [...source.matchAll(/from ["']([^"']+)["']/gu)].map(
    (match) => match[1],
  );
  assert.deepEqual(importSpecifiers.toSorted(), [
    "../bom/bomTypes",
    "./componentSearchTypes",
    "./componentSearchView",
  ]);
  assert.doesNotMatch(source, /from ["'](?:node:|vscode)/u);
});

test("#492 protocol lifecycle uses only reviewed protocol and transport dependencies", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const sourceRoot = path.join(repoRoot, "apps", "vscode-extension", "src");
  const graph = buildTypeScriptImportGraph(sourceRoot);
  assert.deepEqual(
    [...(graph.get("mcp/protocol/protocolLifecycle.ts") ?? [])],
    [
      "mcp/protocol/protocolAdapter.ts",
      "mcp/transport/httpJsonRpcTransport.ts",
    ],
  );

  const source = fs.readFileSync(
    path.join(sourceRoot, "mcp", "protocol", "protocolLifecycle.ts"),
    "utf8",
  );
  const importSpecifiers = [...source.matchAll(/from ["']([^"']+)["']/gu)].map(
    (match) => match[1],
  );
  assert.deepEqual(importSpecifiers.toSorted(), [
    "../transport/httpJsonRpcTransport",
    "./protocolAdapter",
  ]);
  assert.doesNotMatch(source, /from ["'](?:node:|vscode)/u);
});

test("#492 VS Code protocol session adapter depends only on the lifecycle contract", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const sourceRoot = path.join(repoRoot, "apps", "vscode-extension", "src");
  const graph = buildTypeScriptImportGraph(sourceRoot);
  assert.deepEqual(
    [...(graph.get("mcp/adapters/vscodeProtocolSessionStore.ts") ?? [])],
    ["mcp/protocol/protocolLifecycle.ts"],
  );

  const source = fs.readFileSync(
    path.join(sourceRoot, "mcp", "adapters", "vscodeProtocolSessionStore.ts"),
    "utf8",
  );
  const importSpecifiers = [...source.matchAll(/from ["']([^"']+)["']/gu)].map(
    (match) => match[1],
  );
  assert.deepEqual(importSpecifiers, ["../protocol/protocolLifecycle"]);
  assert.doesNotMatch(source, /from ["'](?:node:|vscode)/u);
});

test("#492 MCP client delegates protocol lifecycle ownership", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      "apps",
      "vscode-extension",
      "src",
      "mcp",
      "mcpClient.ts",
    ),
    "utf8",
  );
  assert.match(source, /from ["']\.\/protocol\/protocolLifecycle["']/u);
  assert.match(
    source,
    /from ["']\.\/adapters\/vscodeProtocolSessionStore["']/u,
  );
  assert.doesNotMatch(
    source,
    /MCP_SESSION_ID_KEY|protocolReadyPromise|nextRpcId|MCP-Session-Id/u,
  );
});

test("#497 project state store uses only reviewed project-domain dependencies", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const sourceRoot = path.join(repoRoot, "apps", "vscode-extension", "src");
  const graph = buildTypeScriptImportGraph(sourceRoot);
  assert.deepEqual(
    [...(graph.get("state/projectStateStore.ts") ?? [])],
    ["types.ts", "workspace/projectContext.ts"],
  );

  const source = fs.readFileSync(
    path.join(sourceRoot, "state", "projectStateStore.ts"),
    "utf8",
  );
  const importSpecifiers = [...source.matchAll(/from ["']([^"']+)["']/gu)].map(
    (match) => match[1],
  );
  assert.deepEqual(importSpecifiers.toSorted(), [
    "../types",
    "../workspace/projectContext",
    "vscode",
  ]);
  assert.doesNotMatch(source, /from ["']node:/u);
});

test("#497 diagnostic state store uses only reviewed diagnostic-domain dependencies", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const sourceRoot = path.join(repoRoot, "apps", "vscode-extension", "src");
  const graph = buildTypeScriptImportGraph(sourceRoot);
  assert.deepEqual(
    [...(graph.get("state/diagnosticStateStore.ts") ?? [])],
    ["types.ts"],
  );

  const source = fs.readFileSync(
    path.join(sourceRoot, "state", "diagnosticStateStore.ts"),
    "utf8",
  );
  const importSpecifiers = [...source.matchAll(/from ["']([^"']+)["']/gu)].map(
    (match) => match[1],
  );
  assert.deepEqual(importSpecifiers.toSorted(), ["../types", "vscode"]);
  assert.doesNotMatch(source, /from ["']node:/u);
});

test("#497 export state store uses only reviewed export-domain dependencies", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const sourceRoot = path.join(repoRoot, "apps", "vscode-extension", "src");
  const graph = buildTypeScriptImportGraph(sourceRoot);
  assert.deepEqual(
    [...(graph.get("state/exportStateStore.ts") ?? [])],
    ["utils/secrets.ts"],
  );

  const source = fs.readFileSync(
    path.join(sourceRoot, "state", "exportStateStore.ts"),
    "utf8",
  );
  const importSpecifiers = [...source.matchAll(/from ["']([^"']+)["']/gu)].map(
    (match) => match[1],
  );
  assert.deepEqual(importSpecifiers.toSorted(), ["../utils/secrets", "vscode"]);
  assert.doesNotMatch(source, /from ["']node:/u);
});

test("#497 MCP state store uses only reviewed MCP-domain dependencies", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const sourceRoot = path.join(repoRoot, "apps", "vscode-extension", "src");
  const graph = buildTypeScriptImportGraph(sourceRoot);
  assert.deepEqual(
    [...(graph.get("state/mcpStateStore.ts") ?? [])],
    ["types.ts", "utils/secrets.ts"],
  );

  const source = fs.readFileSync(
    path.join(sourceRoot, "state", "mcpStateStore.ts"),
    "utf8",
  );
  const importSpecifiers = [...source.matchAll(/from ["']([^"']+)["']/gu)].map(
    (match) => match[1],
  );
  assert.deepEqual(importSpecifiers.toSorted(), [
    "../types",
    "../utils/secrets",
    "vscode",
  ]);
  assert.doesNotMatch(source, /from ["']node:/u);
});

test("#497 viewer state store uses only reviewed viewer-domain dependencies", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const sourceRoot = path.join(repoRoot, "apps", "vscode-extension", "src");
  const graph = buildTypeScriptImportGraph(sourceRoot);
  assert.deepEqual(
    [...(graph.get("state/viewerStateStore.ts") ?? [])],
    [
      "providers/viewer/viewerEngine.ts",
      "types.ts",
      "utils/secrets.ts",
      "workspace/projectContext.ts",
    ],
  );

  const source = fs.readFileSync(
    path.join(sourceRoot, "state", "viewerStateStore.ts"),
    "utf8",
  );
  const importSpecifiers = [...source.matchAll(/from ["']([^"']+)["']/gu)].map(
    (match) => match[1],
  );
  assert.deepEqual(importSpecifiers.toSorted(), [
    "../providers/viewer/viewerEngine",
    "../types",
    "../utils/secrets",
    "../workspace/projectContext",
    "vscode",
  ]);
  assert.doesNotMatch(source, /from ["']node:/u);
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
    "components/componentSearchRanking.ts",
    "components/componentSearchProviders.ts",
    "library/pcmService.ts",
    "library/pcmCatalog.ts",
    "library/pcmArchive.ts",
    "library/pcmPersistence.ts",
    "library/pcmLibraryTable.ts",
    "state/stateStores.ts",
    "state/diagnosticStateStore.ts",
    "state/exportStateStore.ts",
    "state/projectStateStore.ts",
    "state/mcpStateStore.ts",
    "state/viewerStateStore.ts",
    "mcp/protocol/protocolLifecycle.ts",
    "mcp/adapters/vscodeProtocolSessionStore.ts",
  ]) {
    assert.match(
      architectureDoc,
      new RegExp(target.replaceAll(".", "\\."), "u"),
    );
  }
  assert.match(architectureDoc, /^---\nsearch: false\n---/u);
  assert.match(architectureDoc, /160 TypeScript modules/u);
  assert.match(architectureDoc, /0 import cycles/u);
});
