import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse as parseYaml } from "yaml";

import {
  validateCompatibilityContract,
  validateEmbeddedExtensionCompatibilityMatrix,
  validateKiCadPatchBaseline,
} from "./check-compatibility-contract.mjs";

const compatibility = parseYaml(fs.readFileSync("compatibility.yaml", "utf8"));
const extensionPackage = JSON.parse(
  fs.readFileSync("apps/vscode-extension/package.json", "utf8"),
);
const matrixSource = fs.readFileSync(
  "apps/vscode-extension/src/mcp/compatibilityMatrix.ts",
  "utf8",
);

test("embedded extension compatibility matrix matches compatibility metadata", () => {
  assert.deepEqual(
    validateEmbeddedExtensionCompatibilityMatrix({
      compatibility,
      extensionPackage,
      matrixSource,
    }),
    [],
  );
});

test("embedded extension compatibility matrix rejects product-version drift", () => {
  // Inject drift relative to the current authoritative version so this test
  // never needs a manual bump on release (the kicadStudio version equals
  // extensionPackage.version and is the first `version: '...'` in the matrix).
  const driftedSource = matrixSource.replace(
    `version: '${extensionPackage.version}'`,
    "version: '0.0.0'",
  );
  assert.notEqual(
    driftedSource,
    matrixSource,
    "drift fixture must actually mutate the matrix source",
  );

  assert.match(
    validateEmbeddedExtensionCompatibilityMatrix({
      compatibility,
      extensionPackage,
      matrixSource: driftedSource,
    }).join("\n"),
    /kicadStudioVersion/u,
  );
});

test("repository compatibility contract validates current state", () => {
  assert.deepEqual(validateCompatibilityContract(), []);
});

test("#494 compatibility contract rejects malformed runtime policy metadata", () => {
  const malformed = structuredClone(compatibility);
  malformed.runtimePolicy.enforcement.vscode = "ignore";

  assert.match(
    validateCompatibilityContract({
      runtimePolicyCompatibility: malformed,
      runtimePolicyExtensionPackage: extensionPackage,
    }).join("\n"),
    /runtimePolicy\.enforcement\.vscode/u,
  );
});

test("#558 final KiCad 10.0.5 baseline is aligned and has no active patch preview", () => {
  assert.equal(compatibility.kicad.latestVerified, "10.0.5");
  assert.equal(compatibility.kicad10FeatureParity.baseline, "10.0.5");
  assert.equal(
    compatibility.kicad10FeatureParity.sources.canaryEvidence,
    "docs/evidence/kicad-10-0-5/2026-07-26/summary.md",
  );
  assert.equal(compatibility.kicad.patchCanary, undefined);
  assert.deepEqual(validateKiCadPatchBaseline({ compatibility }), []);
});

test("#558 verified stable patches do not require an active prerelease canary", () => {
  const stableOnly = structuredClone(compatibility);
  delete stableOnly.kicad.patchCanary;

  assert.deepEqual(
    validateKiCadPatchBaseline({ compatibility: stableOnly }),
    [],
  );
});

test("#491 rejects stable parity drift", () => {
  const drifted = structuredClone(compatibility);
  drifted.kicad10FeatureParity.baseline = "10.0.3";

  assert.match(
    validateKiCadPatchBaseline({ compatibility: drifted }).join("\n"),
    /kicad10FeatureParity\.baseline must match kicad\.latestVerified/u,
  );
});

test("#491 keeps future patch release candidates non-blocking", () => {
  const blocking = structuredClone(compatibility);
  blocking.kicad.patchCanary = {
    version: "10.0.6-rc1",
    reportedVersion: "10.0.6",
    state: "preview",
    blocking: true,
    owner: "KiCad MCP Pro",
    ownerDocumentation: "https://oaslananka.github.io/kicad-mcp-pro/",
    releaseNotes:
      "https://www.kicad.org/blog/2026/08/KiCad-Version-10.0.6-Release-Candidate-1-Available/",
    evidence: "docs/evidence/kicad-10-0-5-rc1/2026-07-21/summary.md",
  };

  assert.match(
    validateKiCadPatchBaseline({ compatibility: blocking }).join("\n"),
    /kicad\.patchCanary must remain preview-only and non-blocking/u,
  );
});

test("#491 requires reviewable stable canary evidence", () => {
  const missingEvidence = structuredClone(compatibility);
  missingEvidence.kicad10FeatureParity.sources.canaryEvidence =
    "docs/evidence/missing.md";

  assert.match(
    validateKiCadPatchBaseline({ compatibility: missingEvidence }).join("\n"),
    /sources\.canaryEvidence must reference an existing file/u,
  );
});
