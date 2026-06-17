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
  const driftedSource = matrixSource.replace(
    "version: '1.8.0'",
    "version: '0.0.0'",
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
