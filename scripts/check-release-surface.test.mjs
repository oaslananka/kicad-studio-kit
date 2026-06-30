import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  RELEASE_SURFACES,
  README_MARKER_END,
  README_MARKER_START,
  applyCompatibilityMatrixStudioVersion,
  applyCompatibilityMatrixTestedAgainst,
  applyCompatibilityProductVersion,
  applyMarketplaceReadmeVersion,
  applyReadmeBaseline,
  collectDrift,
  readAuthoritativeVersion,
  renderReadmeBaseline,
} from "./lib/release-surface.mjs";

const COMPATIBILITY_YAML = fs.readFileSync("compatibility.yaml", "utf8");
const COMPATIBILITY_MATRIX_TS = fs.readFileSync(
  "apps/vscode-extension/src/mcp/compatibilityMatrix.ts",
  "utf8",
);
const MARKETPLACE_README = fs.readFileSync(
  "apps/vscode-extension/README.md",
  "utf8",
);

function compatibilityProductVersion(content) {
  return content.match(
    /packagePath: "apps\/vscode-extension\/package\.json"\n\s*version: "([^"]+)"/u,
  )?.[1];
}

function matrixStudioVersion(content) {
  return content.match(/kicadStudio: \{\s*\n\s*version: '([^']+)'/u)?.[1];
}

function matrixTestedAgainst(content) {
  return content.match(
    /compatibleExtension: \{[\s\S]*?testedAgainst: '([^']+)'/u,
  )?.[1];
}

function marketplaceReadmeVersion(content) {
  return content.match(/^- Version:\s*`([^`]+)`$/mu)?.[1];
}

function marketplaceReadmeCompatVersion(content) {
  return content.match(
    /^KiCad Studio ([^\s]+) supports `kicad-mcp-pro /mu,
  )?.[1];
}

test("#395 every known release surface matches the authoritative version", () => {
  const version = readAuthoritativeVersion();
  const drift = collectDrift(undefined, version);
  assert.deepEqual(
    drift,
    [],
    `Release surfaces drifted from ${version}:\n${drift
      .map((entry) => `- ${entry.file}: ${entry.actual}`)
      .join("\n")}`,
  );
});

test("#395 README carries the release-surface markers", () => {
  const readme = fs.readFileSync("README.md", "utf8");
  assert.ok(
    readme.includes(README_MARKER_START),
    "README.md must contain the release-surface start marker",
  );
  assert.ok(
    readme.includes(README_MARKER_END),
    "README.md must contain the release-surface end marker",
  );
});

test("#395 README generator is idempotent for the current version", () => {
  const version = readAuthoritativeVersion();
  const readme = fs.readFileSync("README.md", "utf8");
  assert.equal(
    applyReadmeBaseline(readme, version),
    readme,
    "README release surface is stale; run `corepack pnpm run release:surface`",
  );
});

test("#395 drift is detected when a surface goes stale", () => {
  const version = readAuthoritativeVersion();
  const readme = fs.readFileSync("README.md", "utf8");
  // Simulate a forgotten README bump by asking for a version the file does not
  // contain; collectDrift must flag the README rather than pass silently.
  const bogus = `${version}-stale`;
  const drift = collectDrift(undefined, bogus);
  assert.ok(
    drift.some((entry) => entry.file === "README.md"),
    "collectDrift must flag README drift",
  );
  // Sanity: re-rendering with the bogus version changes the file, proving the
  // README block is genuinely generated rather than incidentally matching.
  assert.notEqual(applyReadmeBaseline(readme, bogus), readme);
});

test("#431 compatibility.yaml writer bumps only the kicad-studio version", () => {
  const next = applyCompatibilityProductVersion(COMPATIBILITY_YAML, "9.9.9");
  assert.equal(compatibilityProductVersion(next), "9.9.9");
  // The kicad-mcp-pro testedAgainst field shares the block but must be left alone.
  assert.ok(
    next.includes('testedAgainst: "3.9.2"'),
    "compatibility writer must not touch the kicad-mcp-pro testedAgainst version",
  );
});

test("#431 marketplace README writer bumps both visible version fields", () => {
  const next = applyMarketplaceReadmeVersion(MARKETPLACE_README, "9.9.9");
  assert.equal(marketplaceReadmeVersion(next), "9.9.9");
  assert.equal(marketplaceReadmeCompatVersion(next), "9.9.9");
});

test("#431 compatibilityMatrix.ts writer bumps both extension version fields only", () => {
  let next = applyCompatibilityMatrixStudioVersion(
    COMPATIBILITY_MATRIX_TS,
    "9.9.9",
  );
  next = applyCompatibilityMatrixTestedAgainst(next, "9.9.9");
  assert.equal(matrixStudioVersion(next), "9.9.9");
  assert.equal(matrixTestedAgainst(next), "9.9.9");
  // kicadMcpPro.version must remain the MCP server version, not the extension's.
  assert.match(next, /kicadMcpPro: \{\s*\n\s*version: '3\.9\.2'/u);
});

test("#431 version writers are idempotent at the authoritative version", () => {
  const version = readAuthoritativeVersion();
  assert.equal(
    applyMarketplaceReadmeVersion(MARKETPLACE_README, version),
    MARKETPLACE_README,
  );
  assert.equal(
    applyCompatibilityProductVersion(COMPATIBILITY_YAML, version),
    COMPATIBILITY_YAML,
  );
  let matrix = applyCompatibilityMatrixStudioVersion(
    COMPATIBILITY_MATRIX_TS,
    version,
  );
  matrix = applyCompatibilityMatrixTestedAgainst(matrix, version);
  assert.equal(matrix, COMPATIBILITY_MATRIX_TS);
});

test("#431 version writers refuse to rewrite when the anchor is missing", () => {
  assert.throws(
    () => applyCompatibilityProductVersion("nothing to anchor on", "9.9.9"),
    /could not locate/u,
  );
});

test("#395 release surface list is non-empty and well-formed", () => {
  assert.ok(RELEASE_SURFACES.length >= 2);
  for (const surface of RELEASE_SURFACES) {
    assert.equal(typeof surface.file, "string");
    assert.equal(typeof surface.label, "string");
    assert.equal(typeof surface.extract, "function");
  }
  // The README block render must round-trip through the markers.
  const rendered = renderReadmeBaseline("9.9.9");
  assert.ok(rendered.startsWith(README_MARKER_START));
  assert.ok(rendered.endsWith(README_MARKER_END));
  assert.ok(rendered.includes("`9.9.9`"));
});
