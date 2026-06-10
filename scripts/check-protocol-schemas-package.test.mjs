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

function npmPackageRoot() {
  // resolve to dist/index.js, then go up 2 levels to package root
  const resolved = new URL(
    import.meta.resolve("@oaslananka/kicad-protocol-schemas"),
  );
  if (resolved.protocol !== "file:") {
    throw new Error(
      `@oaslananka/kicad-protocol-schemas not found locally (${resolved.href})`,
    );
  }
  return path.dirname(path.dirname(fileURLToPath(resolved)));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

test("OASLANA-52 protocol schemas are consumed from npm package", () => {
  const pkgRoot = npmPackageRoot();
  const packageJson = readJson(path.join(pkgRoot, "package.json"));

  assert.equal(packageJson.name, "@oaslananka/kicad-protocol-schemas");
  assert.equal(packageJson.version, "1.1.1");
  assert.equal(packageJson.main, "dist/index.js");
  assert.equal(packageJson.types, "dist/index.d.ts");
  assert.deepEqual(packageJson.files, ["dist/", "schemas/", "README.md"]);

  const rootPackage = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  assert.equal(
    rootPackage.devDependencies["@oaslananka/kicad-protocol-schemas"],
    "1.1.1",
  );
  assert.match(
    rootPackage.scripts["check:protocol-schemas"],
    /check-protocol-schemas-package.test.mjs/u,
  );
  assert.match(rootPackage.scripts.check, /pnpm run check:protocol-schemas/u);
});

test("#342 published protocol schema package exposes the validator API used by consumers", async () => {
  const pkg = await import("@oaslananka/kicad-protocol-schemas");

  assert.equal(typeof pkg.validateProtocolPayload, "function");
  assert.equal(typeof pkg.protocolSchemaPath, "function");
});

test("OASLANA-52 npm-installed package owns every required compatibility schema", () => {
  const schemasDir = path.join(npmPackageRoot(), "schemas");
  const schemas = fs
    .readdirSync(schemasDir)
    .filter((file) => file.endsWith(".schema.json"))
    .sort();

  assert.deepEqual(schemas, requiredSchemaFiles);

  for (const schemaFile of requiredSchemaFiles) {
    const schema = readJson(path.join(schemasDir, schemaFile));
    assert.equal(
      schema.$schema,
      "https://json-schema.org/draft/2020-12/schema",
    );
    assert.match(
      schema.$id,
      new RegExp(
        `^https://oaslananka.github.io/(kicad-studio-kit|kicad-mcp)/schemas/${escapeRegExp(schemaFile)}$`,
        "u",
      ),
    );
    assert.equal(schema.type, "object");
    assert.equal(schema["x-kicad-studio-kit"]?.trackingIssue, "OASLANA-52");
    assert.match(
      schema["x-kicad-studio-kit"]?.schemaVersion,
      /^[0-9]+\.[0-9]+\.[0-9]+$/u,
    );
  }
});

test("OASLANA-52 npm-installed README explains schema versioning", () => {
  const readmePath = path.join(npmPackageRoot(), "README.md");
  const readme = fs.readFileSync(readmePath, "utf8");
  for (const phrase of [
    "Schema versioning policy",
    "Breaking schema changes require a major version bump",
    "Migration policy",
  ]) {
    assert.match(readme, new RegExp(escapeRegExp(phrase), "u"));
  }
});
