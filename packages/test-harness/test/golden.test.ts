import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  assertJsonMatchesGolden,
  createTempWorkspace,
  stableJson,
} from "../src/index";

test("stableJson sorts object keys recursively", () => {
  assert.equal(
    stableJson({ z: 1, a: { b: 2, a: 1 } }),
    `{\n  "a": {\n    "a": 1,\n    "b": 2\n  },\n  "z": 1\n}\n`,
  );
});

test("JSON golden assertions compare normalized stable output", () => {
  const workspace = createTempWorkspace();
  try {
    const golden = path.join(workspace.path, "golden.json");
    fs.writeFileSync(golden, stableJson({ a: 1, b: [2] }), "utf8");
    assertJsonMatchesGolden({ b: [2], a: 1 }, golden);
  } finally {
    workspace.cleanup();
  }
});
