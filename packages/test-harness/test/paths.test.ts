import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  findRepoRoot,
  kicadExpectedPath,
  kicadExpectedRoot,
  kicadFixturePath,
  kicadFixtureRoot,
  normalizePathForSnapshot,
  toPosixPath,
} from "../src/index";

test("resolves repository and KiCad fixture paths", () => {
  const repoRoot = findRepoRoot();
  assert.equal(fs.existsSync(path.join(repoRoot, "pnpm-workspace.yaml")), true);
  assert.equal(
    normalizePathForSnapshot(kicadFixtureRoot(repoRoot), repoRoot),
    "packages/kicad-fixtures/fixtures",
  );
  assert.equal(
    normalizePathForSnapshot(kicadExpectedRoot(repoRoot), repoRoot),
    "packages/kicad-fixtures/expected",
  );
  assert.match(
    kicadFixturePath("clean-led-kicad10", "clean-led-kicad10.kicad_pro"),
    /clean-led-kicad10/,
  );
  assert.match(
    kicadFixturePath(
      "empty-project-kicad10",
      "empty-project-kicad10.kicad_pro",
    ),
    /empty-project-kicad10/,
  );
  assert.match(
    kicadExpectedPath("clean-led-kicad10", "project-tree.snapshot.json"),
    /project-tree\.snapshot\.json/,
  );
});

test("normalizes Windows and POSIX separators for snapshots", () => {
  assert.equal(toPosixPath("alpha\\beta/gamma"), "alpha/beta/gamma");
});
