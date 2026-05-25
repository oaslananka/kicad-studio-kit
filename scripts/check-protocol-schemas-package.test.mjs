import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const requiredSchemaFiles = [
  "bom-netlist-summary.schema.json",
  "compatibility-manifest.schema.json",
  "extension-active-context.schema.json",
  "kicad-mcp-server-info.schema.json",
  "mcp-server-health.schema.json",
  "mcp-tool-capability.schema.json",
  "mcp-tool-discovery.schema.json",
  "normalized-diagnostic.schema.json",
];

function repoPath(...segments) {
  return path.join(repoRoot, ...segments);
}

function readText(relativePath) {
  const absolutePath = repoPath(relativePath);
  assert.ok(fs.existsSync(absolutePath), `${relativePath} must exist`);
  return fs.readFileSync(absolutePath, "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

test("OASLANA-52 protocol schemas are a shared workspace package", () => {
  const packageJson = readJson("packages/protocol-schemas/package.json");

  assert.equal(packageJson.name, "@oaslananka/kicad-protocol-schemas");
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.main, "dist/index.js");
  assert.equal(packageJson.types, "dist/index.d.ts");
  assert.deepEqual(packageJson.files, ["dist/", "schemas/", "README.md"]);
  assert.equal(packageJson.scripts.check, "pnpm run format:check && pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build");

  const workspace = readText("pnpm-workspace.yaml");
  assert.match(workspace, /packages\/protocol-schemas/u);

  const rootPackage = readJson("package.json");
  assert.equal(
    rootPackage.scripts["check:protocol-schemas"],
    "node --test scripts/check-protocol-schemas-package.test.mjs && pnpm --dir packages/protocol-schemas run check",
  );
  assert.match(rootPackage.scripts.check, /pnpm run check:protocol-schemas/u);
});

test("OASLANA-52 package owns every required compatibility schema", () => {
  const schemas = fs
    .readdirSync(repoPath("packages/protocol-schemas/schemas"))
    .filter((file) => file.endsWith(".schema.json"))
    .sort();

  assert.deepEqual(schemas, requiredSchemaFiles);

  for (const schemaFile of requiredSchemaFiles) {
    const schema = readJson(`packages/protocol-schemas/schemas/${schemaFile}`);
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.match(
      schema.$id,
      new RegExp(
        `^https://oaslananka.github.io/kicad-studio-kit/schemas/${escapeRegExp(schemaFile)}$`,
        "u",
      ),
    );
    assert.equal(schema.type, "object");
    assert.equal(schema["x-kicad-studio-kit"]?.linearIssue, "OASLANA-52");
    assert.match(
      schema["x-kicad-studio-kit"]?.schemaVersion,
      /^[0-9]+\.[0-9]+\.[0-9]+$/u,
    );
  }
});

test("OASLANA-52 compatibility documentation explains schema versioning", () => {
  const readme = readText("packages/protocol-schemas/README.md");
  for (const phrase of [
    "Schema versioning policy",
    "Breaking schema changes require a major version bump",
    "Migration policy",
    "corepack pnpm run check:protocol-schemas",
    "product-neutral",
  ]) {
    assert.match(readme, new RegExp(escapeRegExp(phrase), "u"));
  }
});
