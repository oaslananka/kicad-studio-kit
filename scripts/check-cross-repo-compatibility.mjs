// Cross-repo compatibility canary — validates published-artifact consumption.
//
// Called by .github/workflows/cross-repo-compatibility.yml and may be run
// locally during development.
//
// Checks:
//   1. packages/protocol-schemas is absent (migration guard)
//   2. @oaslananka/kicad-protocol-schemas resolves from node_modules
//   3. compatibility.yaml declares compatibleMcpPro range (extension → external MCP contract)
//
// Returns 0 on success, 1 on failure.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const PROTOCOL_SCHEMAS_DIR = resolve(REPO_ROOT, "packages", "protocol-schemas");

// ── Helpers ────────────────────────────────────────────────────────────────

function ok(label) {
  console.log(`  ✓ ${label}`);
}

function fail(label, detail) {
  console.error(`  ✗ ${label}: ${detail}`);
  process.exitCode = 1;
}

// ── 1. Guard: packages/protocol-schemas must be absent ─────────────────────

function checkLocalProtocolSchemas() {
  console.log("\n── Guard — packages/protocol-schemas ──");
  const exists = existsSync(PROTOCOL_SCHEMAS_DIR);
  if (exists) {
    fail(
      "packages/protocol-schemas",
      "directory still exists — migration remnant",
    );
  } else {
    ok("packages/protocol-schemas is absent");
  }
}

// ── 2. npm protocol-schemas must resolve ──────────────────────────────────

function checkNpmProtocolSchemas() {
  console.log("\n── npm @oaslananka/kicad-protocol-schemas ──");
  try {
    const pkgPath = resolve(
      REPO_ROOT,
      "node_modules",
      "@oaslananka",
      "kicad-protocol-schemas",
      "package.json",
    );
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    ok(`@oaslananka/kicad-protocol-schemas resolves (v${pkg.version})`);

    // Smoke-test the API surface
    const schemasPkg = awaitImport("@oaslananka/kicad-protocol-schemas");
    ok("import smoke: module loaded");
  } catch (err) {
    fail("resolve/import", err.message);
  }
}

function awaitImport(spec) {
  // Dynamic import within a sync helper; returns the module namespace.
  // We use top-level await below so this works.
  return import(spec);
}

// ── 3. compatibility.yaml references ──────────────────────────────────────

function checkCompatibilityYaml() {
  console.log("\n── compatibility.yaml ──");
  const yamlPath = resolve(REPO_ROOT, "compatibility.yaml");
  try {
    const raw = readFileSync(yamlPath, "utf8");

    // kicad-mcp-pro is external (oaslananka/kicad-mcp-pro); no local product section.
    // The extension declares compatibleMcpPro range in kicad-studio section.
    if (raw.includes("compatibleMcpPro:")) {
      ok(
        "kicad-studio.compatibleMcpPro range declared — extension → external MCP contract",
      );
    } else {
      fail("compatibleMcpPro", "not found in kicad-studio section");
    }
  } catch (err) {
    fail("read compatibility.yaml", err.message);
  }
}

// ── Summary ────────────────────────────────────────────────────────────────

function printSummary() {
  let npmVersion = "?";
  try {
    const pkg = JSON.parse(
      readFileSync(
        resolve(
          REPO_ROOT,
          "node_modules",
          "@oaslananka",
          "kicad-protocol-schemas",
          "package.json",
        ),
        "utf8",
      ),
    );
    npmVersion = pkg.version;
  } catch {
    /* already reported above */
  }

  console.log("\n━━━ Cross-repo Compatibility Canary ━━━");
  console.log(`  npm  @oaslananka/kicad-protocol-schemas:  v${npmVersion}`);
  console.log(
    `  PyPI kicad-mcp-pro:                        checked in workflow`,
  );
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (process.exitCode) {
    console.error("\n❌ Cross-repo compatibility checks FAILED.\n");
  } else {
    console.log("\n✅ All cross-repo compatibility checks passed.\n");
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

(async () => {
  process.exitCode = 0;

  console.log("Cross-repo Compatibility Canary");
  console.log("═".repeat(40));

  checkLocalProtocolSchemas();
  checkCompatibilityYaml();

  // npm check
  console.log("\n── npm @oaslananka/kicad-protocol-schemas ──");
  try {
    const pkgPath = resolve(
      REPO_ROOT,
      "node_modules",
      "@oaslananka",
      "kicad-protocol-schemas",
      "package.json",
    );
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    ok(`@oaslananka/kicad-protocol-schemas resolves (v${pkg.version})`);

    const mod = await import("@oaslananka/kicad-protocol-schemas");
    ok("import smoke: module loaded");
  } catch (err) {
    fail("resolve/import", err.message);
  }

  printSummary();
})();
