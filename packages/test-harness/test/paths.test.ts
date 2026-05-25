import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  findRepoRoot,
  kicadFixturePath,
  kicadFixtureRoot,
  normalizePathForSnapshot,
  toPosixPath,
} from "../src/index";

test("resolves repository and KiCad fixture paths", () => {
  const repoRoot = findRepoRoot();
  assert.equal(path.basename(repoRoot), "kicad-studio-kit");
  assert.equal(
    normalizePathForSnapshot(kicadFixtureRoot(repoRoot), repoRoot),
    "apps/vscode-extension/test/fixtures/kicad",
  );
  assert.match(
    kicadFixturePath("clean-led-kicad10", "clean-led-kicad10.kicad_pro"),
    /clean-led-kicad10/,
  );
});

test("normalizes Windows and POSIX separators for snapshots", () => {
  assert.equal(toPosixPath("alpha\\beta/gamma"), "alpha/beta/gamma");
});
