import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

import {
  REQUIRED_READINESS_DIMENSIONS,
  renderKiCad11ReadinessDashboard,
  validateKiCad11Readiness,
} from "./lib/kicad-11-readiness-dashboard.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const compatibility = parse(
  fs.readFileSync(path.join(repoRoot, "compatibility.yaml"), "utf8"),
);

function cloneContract() {
  return structuredClone(compatibility);
}

test("#377 repository KiCad 11 readiness contract is complete", () => {
  assert.deepEqual(validateKiCad11Readiness({ compatibility, repoRoot }), []);
  assert.deepEqual(validateKiCad11Readiness({ compatibility }), []);
});

test("#377 dashboard requires every product readiness dimension", () => {
  const fixture = cloneContract();
  delete fixture.kicadIpcReadiness.dashboard.dimensions.mcpIntegration;

  const errors = validateKiCad11Readiness({
    compatibility: fixture,
    repoRoot,
  });

  assert.deepEqual(REQUIRED_READINESS_DIMENSIONS, [
    "cli",
    "ipc",
    "vscodeUx",
    "mcpIntegration",
    "tests",
    "docs",
  ]);
  assert.ok(errors.some((error) => error.includes("mcpIntegration")));
});

test("#377 nightly upstream state cannot claim KiCad 11 promotion", () => {
  const fixture = cloneContract();
  fixture.kicadIpcReadiness.dashboard.promotionState = "ready";

  assert.ok(
    validateKiCad11Readiness({ compatibility: fixture, repoRoot }).some(
      (error) => error.includes("nightly") && error.includes("blocked"),
    ),
  );
});

test("#377 official release candidates can advance readiness without validator changes", () => {
  const fixture = cloneContract();
  const dashboard = fixture.kicadIpcReadiness.dashboard;
  dashboard.upstreamState = "release-candidate";
  dashboard.overall = "ready";
  dashboard.promotionState = "ready";
  for (const dimension of Object.values(dashboard.dimensions)) {
    dimension.status = "complete";
    delete dimension.blocker;
  }
  for (const snapshot of dashboard.requiredSnapshots) {
    snapshot.status = "verified";
  }

  assert.deepEqual(
    validateKiCad11Readiness({ compatibility: fixture, repoRoot }),
    [],
  );
});

test("#377 readiness cannot advance while dimensions or snapshots remain pending", () => {
  const fixture = cloneContract();
  fixture.kicadIpcReadiness.dashboard.upstreamState = "release-candidate";
  fixture.kicadIpcReadiness.dashboard.overall = "ready";
  fixture.kicadIpcReadiness.dashboard.promotionState = "ready";

  const errors = validateKiCad11Readiness({
    compatibility: fixture,
    repoRoot,
  });

  assert.ok(errors.some((error) => error.includes("dimensions")));
  assert.ok(errors.some((error) => error.includes("snapshots")));
});

test("#377 stable promotion requires the same-day checklist to be complete", () => {
  const fixture = cloneContract();
  const dashboard = fixture.kicadIpcReadiness.dashboard;
  dashboard.upstreamState = "stable";
  dashboard.overall = "promoted";
  dashboard.promotionState = "promoted";
  for (const dimension of Object.values(dashboard.dimensions)) {
    dimension.status = "complete";
    delete dimension.blocker;
  }
  for (const snapshot of dashboard.requiredSnapshots) {
    snapshot.status = "verified";
  }

  assert.ok(
    validateKiCad11Readiness({ compatibility: fixture, repoRoot }).some(
      (error) => error.includes("same-day checklist"),
    ),
  );

  for (const item of dashboard.sameDayChecklist) {
    item.status = "complete";
  }
  assert.ok(
    validateKiCad11Readiness({ compatibility: fixture, repoRoot }).some(
      (error) => error.includes("promoted") && error.includes("blocker"),
    ),
  );
  delete dashboard.blocker;
  assert.deepEqual(
    validateKiCad11Readiness({ compatibility: fixture, repoRoot }),
    [],
  );
});

test("#377 evidence paths cannot escape the repository", () => {
  const fixture = cloneContract();
  fixture.kicadIpcReadiness.dashboard.dimensions.cli.evidence.push(
    "path:../../../../etc/passwd",
  );

  assert.ok(
    validateKiCad11Readiness({ compatibility: fixture, repoRoot }).some(
      (error) => error.includes("outside the repository"),
    ),
  );
});

test("#377 promoted dashboards render without stale blocker text", () => {
  const fixture = cloneContract();
  const dashboard = fixture.kicadIpcReadiness.dashboard;
  dashboard.upstreamState = "stable";
  dashboard.overall = "promoted";
  dashboard.promotionState = "promoted";
  delete dashboard.blocker;
  for (const dimension of Object.values(dashboard.dimensions)) {
    dimension.status = "complete";
    delete dimension.blocker;
  }
  for (const snapshot of dashboard.requiredSnapshots) {
    snapshot.status = "verified";
  }
  for (const item of dashboard.sameDayChecklist) {
    item.status = "complete";
  }

  const markdown = renderKiCad11ReadinessDashboard(fixture);
  assert.doesNotMatch(markdown, /undefined/u);
  assert.match(markdown, /Current blocker:\*\* None/u);
});

test("#377 incomplete readiness states require actionable blockers", () => {
  const fixture = cloneContract();
  fixture.kicadIpcReadiness.dashboard.dimensions.cli.blocker = "";

  assert.ok(
    validateKiCad11Readiness({ compatibility: fixture, repoRoot }).some(
      (error) => error.includes("cli") && error.includes("blocker"),
    ),
  );
});

test("#377 SWIG claim, CLI snapshots, and same-day checklist fail closed", () => {
  const fixture = cloneContract();
  fixture.kicadIpcReadiness.dashboard.upstreamEvidence = [];
  fixture.kicadIpcReadiness.dashboard.swigGuard.evidence = [];
  fixture.kicadIpcReadiness.dashboard.requiredSnapshots = [];
  fixture.kicadIpcReadiness.dashboard.sameDayChecklist = [];

  const errors = validateKiCad11Readiness({
    compatibility: fixture,
    repoRoot,
  });

  assert.ok(errors.some((error) => error.includes("upstreamEvidence")));
  assert.ok(errors.some((error) => error.includes("swigGuard.evidence")));
  assert.ok(errors.some((error) => error.includes("requiredSnapshots")));
  assert.ok(errors.some((error) => error.includes("sameDayChecklist")));
});

test("#377 root contract and docs generator cannot drop the readiness dashboard", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  const generator = fs.readFileSync(
    path.join(repoRoot, "scripts/generate-docs-site.mjs"),
    "utf8",
  );
  const generatedPath = path.join(
    repoRoot,
    "docs/compatibility/kicad-11-readiness-dashboard.md",
  );

  assert.match(
    packageJson.scripts["check:compatibility-contract"],
    /scripts\/kicad-11-readiness-dashboard\.test\.mjs/u,
  );
  assert.match(generator, /validateKiCad11Readiness/u);
  assert.match(generator, /renderKiCad11ReadinessDashboard/u);
  assert.match(generator, /compatibility\/kicad-11-readiness-dashboard\.md/u);
  assert.equal(
    fs.readFileSync(generatedPath, "utf8"),
    `${renderKiCad11ReadinessDashboard(compatibility).trimEnd()}\n`,
  );
});

test("#377 generated dashboard exposes truthful readiness and promotion gates", () => {
  const markdown = renderKiCad11ReadinessDashboard(compatibility);

  assert.match(
    markdown,
    /^---\nsearch: false\n---\n\n# KiCad 11 Readiness Dashboard/mu,
  );
  assert.match(markdown, /Overall readiness \| `blocked`/u);
  assert.match(markdown, /Upstream state \| `nightly`/u);
  assert.match(markdown, /No production `pcbnew` \/ SWIG dependency/u);
  for (const label of [
    "KiCad CLI",
    "IPC API",
    "VS Code extension UX",
    "MCP integration",
    "Tests",
    "Documentation",
  ]) {
    assert.match(markdown, new RegExp(label, "u"));
  }
  assert.match(markdown, /Critical CLI Snapshot Contract/u);
  assert.match(markdown, /Same-Day Stable Release Checklist/u);
  assert.match(markdown, /KiCad 10\.0\.5 remains primary/u);
});
