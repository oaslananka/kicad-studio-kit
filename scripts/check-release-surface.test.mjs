import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  RELEASE_SURFACES,
  README_MARKER_END,
  README_MARKER_START,
  applyReadmeBaseline,
  collectDrift,
  readAuthoritativeVersion,
  renderReadmeBaseline,
} from "./lib/release-surface.mjs";

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
