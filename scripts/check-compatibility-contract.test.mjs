import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse as parseYaml } from "yaml";

import {
  validateCompatibilityContract,
  validateEmbeddedExtensionCompatibilityMatrix,
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
