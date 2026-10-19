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
  "tool-effect-manifest.schema.json",
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
  assert.equal(packageJson.main, "dist/index.js");
  assert.equal(packageJson.types, "dist/index.d.ts");
  assert.deepEqual(packageJson.files, ["dist/", "schemas/", "README.md"]);

  const rootPackage = readJson(path.join(repoRoot, "package.json"));
  const extensionPackage = readJson(
    path.join(repoRoot, "apps/vscode-extension/package.json"),
  );
  const expectedVersion =
    rootPackage.devDependencies["@oaslananka/kicad-protocol-schemas"];
  assert.match(expectedVersion, /^\d+\.\d+\.\d+$/u);
  assert.equal(
    extensionPackage.dependencies["@oaslananka/kicad-protocol-schemas"],
    expectedVersion,
  );
  assert.equal(packageJson.version, expectedVersion);
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
  assert.equal(typeof pkg.validateToolEffectManifest, "function");
});

test("#777 published schema v2 validates reviewed tool effects and rejects malformed metadata", async () => {
  const { validateToolEffectManifest } =
    await import("@oaslananka/kicad-protocol-schemas");
  const toolEffectSchema = readJson(
    path.join(npmPackageRoot(), "schemas", "tool-effect-manifest.schema.json"),
  );
  const repository =
    toolEffectSchema.properties.source.properties.repository.const;
  assert.equal(typeof repository, "string");
  const manifest = {
    schemaVersion: "2.0.0",
    source: {
      repository,
      version: "4.3.0",
      reviewed_source_sha: "a".repeat(40),
    },
    tools: [
      {
        name: "kicad_get_version",
        arguments: [],
        effects: ["read"],
        path_arguments: [],
        argument_shapes: [],
        destructive: false,
        idempotent: true,
        supports_dry_run: false,
        supports_rollback: false,
        transaction_support: "none",
        verification_requirements: ["source_review"],
        reviewed_source_paths: ["src/tools/version.py"],
      },
    ],
  };
  assert.equal(validateToolEffectManifest(manifest).valid, true);
  assert.equal(
    validateToolEffectManifest({
      ...manifest,
      source: { ...manifest.source, reviewed_source_sha: "not-a-sha" },
    }).valid,
    false,
  );
  assert.equal(
    validateToolEffectManifest({
      ...manifest,
      tools: [{ ...manifest.tools[0], unsafe_extra_field: true }],
    }).valid,
    false,
  );
  assert.equal(
    validateToolEffectManifest({
      ...manifest,
      tools: [{ ...manifest.tools[0], effects: ["arbitrary_effect"] }],
    }).valid,
    false,
  );
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
        `^https://oaslananka.github.io/(kicad-studio-kit|kicad-mcp|kicad-mcp-pro)/schemas/${escapeRegExp(schemaFile)}$`,
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
