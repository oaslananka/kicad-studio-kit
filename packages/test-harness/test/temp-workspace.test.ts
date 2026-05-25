import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { createTempWorkspace, kicadFixturePath } from "../src/index";

test("copies fixture directories into disposable workspaces", () => {
  const workspace = createTempWorkspace({
    sourcePath: kicadFixturePath("clean-led-kicad10"),
  });

  try {
    assert.equal(
      fs.existsSync(path.join(workspace.path, "clean-led-kicad10.kicad_pro")),
      true,
    );
  } finally {
    workspace.cleanup();
  }

  assert.equal(fs.existsSync(workspace.path), false);
});
