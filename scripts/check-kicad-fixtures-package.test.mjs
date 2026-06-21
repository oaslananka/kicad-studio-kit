import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const requiredFixtureIds = [
  "clean-led-kicad10",
  "stale-diagnostics-kicad10",
  "kicad-10-0-3-regressions",
  "erc-power-pin-error",
  "drc-courtyard-error",
  "unconnected-pcb",
  "missing-netlist",
  "empty-board",
  "empty-project-kicad10",
  "no-dru-file",
  "multi-sheet-schematic",
  "large-board",
  "malformed-sch",
  "malformed-pcb",
  "paths-with-spaces",
  "unicode-path-çöğü",
  "multi-root-workspace",
];

const expectedFileNames = [
  "project-tree.snapshot.json",
  "diagnostics.snapshot.json",
  "status.snapshot.json",
  "erc-report.json",
  "drc-report.json",
  "bom.csv",
  "netlist.net",
  "board-stats.txt",
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

test("OASLANA-53 shared package owns the deterministic KiCad fixture corpus", () => {
  const packageJson = readJson("packages/kicad-fixtures/package.json");
  assert.equal(packageJson.name, "@oaslananka/kicad-fixtures");
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.main, "dist/index.js");
  assert.equal(packageJson.types, "dist/index.d.ts");

  const workspace = readText("pnpm-workspace.yaml");
  assert.match(workspace, /packages\/kicad-fixtures/u);

  const manifest = readJson("packages/kicad-fixtures/manifest.json");
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.trackingIssue, "OASLANA-53");
  assert.equal(manifest.githubIssue, 54);
  assert.equal(manifest.root, "packages/kicad-fixtures/fixtures");
  assert.equal(manifest.expectedRoot, "packages/kicad-fixtures/expected");
  assert.equal(manifest.fixtureCount, requiredFixtureIds.length);
  assert.deepEqual(manifest.expectedFiles, expectedFileNames);
  assert.deepEqual(
    manifest.fixtures.map((fixture) => fixture.semanticName),
    requiredFixtureIds,
  );

  for (const fixture of manifest.fixtures) {
    assert.equal(
      fixture.path,
      `packages/kicad-fixtures/fixtures/${fixture.id}`,
    );
    assert.equal(
      fixture.expectedPath,
      `packages/kicad-fixtures/expected/${fixture.id}`,
    );
    assert.ok(
      fs.existsSync(repoPath(fixture.path, fixture.projectFile)),
      `${fixture.id} project file must exist`,
    );
    for (const schematicFile of fixture.schematicFiles) {
      assert.ok(
        fs.existsSync(repoPath(fixture.path, schematicFile)),
        `${fixture.id} schematic file ${schematicFile} must exist`,
      );
    }
    if (fixture.boardFile) {
      assert.ok(
        fs.existsSync(repoPath(fixture.path, fixture.boardFile)),
        `${fixture.id} board file must exist`,
      );
    }
    if (fixture.designRulesFile) {
      assert.ok(
        fs.existsSync(repoPath(fixture.path, fixture.designRulesFile)),
        `${fixture.id} design-rules file must exist`,
      );
    }
    for (const expectedFile of expectedFileNames) {
      assert.ok(
        fs.existsSync(repoPath(fixture.expectedPath, expectedFile)),
        `${fixture.id} expected ${expectedFile} must exist`,
      );
    }
  }

  assert.equal(
    fs.existsSync(repoPath("apps/vscode-extension/test/fixtures/kicad")),
    false,
    "product workspaces must not keep a private duplicate KiCad corpus",
  );

  const regressionFixture = manifest.fixtures.find(
    (fixture) => fixture.id === "kicad-10-0-3-regressions",
  );
  assert.ok(regressionFixture, "KiCad 10.0.3 regression fixture must exist");
  assert.equal(regressionFixture.regressionCoverage.kicadVersion, "10.0.3");
  assert.deepEqual(regressionFixture.regressionCoverage.importers, [
    "pads_import_edge_case_fixture",
    "allegro_import_capability_probe",
  ]);
  assert.ok(
    fs.existsSync(
      repoPath(
        regressionFixture.path,
        "importers",
        "pads-zone-intersection.asc",
      ),
    ),
  );
});

test("OASLANA-53 fixture package documents metadata and regeneration workflow", () => {
  const readme = readText("packages/kicad-fixtures/README.md");
  for (const phrase of [
    "Fixture metadata",
    "expected DRC/ERC/BOM/netlist state",
    "supported KiCad versions",
    "corepack pnpm run fixtures:kicad:generate",
    "corepack pnpm run test:fixtures",
  ]) {
    assert.match(
      readme,
      new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"),
    );
  }
});
