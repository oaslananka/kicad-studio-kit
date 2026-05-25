import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  copyDirectory,
  createTempWorkspace,
  kicadFixturePath,
} from "../src/index";

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

test("preserves symbolic links when copying workspaces", () => {
  const sourceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "kicad-test-harness-source-"),
  );
  const targetRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "kicad-test-harness-target-"),
  );

  try {
    fs.mkdirSync(path.join(sourceRoot, "real-dir"));
    fs.writeFileSync(path.join(sourceRoot, "real-dir", "nested.txt"), "ok");

    try {
      fs.symlinkSync("real-dir", path.join(sourceRoot, "linked-dir"), "dir");
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "EPERM"
      ) {
        return;
      }
      throw error;
    }

    copyDirectory(sourceRoot, targetRoot);

    const copiedLink = path.join(targetRoot, "linked-dir");
    assert.equal(fs.lstatSync(copiedLink).isSymbolicLink(), true);
    assert.equal(
      fs.readFileSync(path.join(copiedLink, "nested.txt"), "utf8"),
      "ok",
    );
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
});
