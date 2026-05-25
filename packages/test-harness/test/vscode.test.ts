import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  createExtensionTestWorkspace,
  createVsCodeExtensionLaunchArgs,
  extensionDevelopmentPath,
  extensionTestsPath,
} from "../src/index";

test("builds VS Code extension integration launch arguments", () => {
  const repoRoot = path.join("tmp", "repo");
  const args = createVsCodeExtensionLaunchArgs({
    repoRoot,
    workspacePath: path.join(repoRoot, "fixture"),
    extensionTestsPath: path.join(repoRoot, "tests"),
    extraArgs: ["--disable-extensions"],
  });

  assert.deepEqual(args, [
    "--extensionDevelopmentPath",
    path.join(repoRoot, "apps", "vscode-extension"),
    "--extensionTestsPath",
    path.join(repoRoot, "tests"),
    path.join(repoRoot, "fixture"),
    "--disable-extensions",
  ]);
  assert.equal(
    extensionDevelopmentPath({ repoRoot }),
    path.join(repoRoot, "apps", "vscode-extension"),
  );
  assert.equal(
    extensionTestsPath({ repoRoot }),
    path.join(repoRoot, "apps", "vscode-extension", "out", "test"),
  );
});

test("creates disposable VS Code extension workspaces from fixtures", () => {
  const workspace = createExtensionTestWorkspace({ prefix: "kicad-vscode-" });

  try {
    assert.match(path.basename(workspace.path), /^kicad-vscode-/u);
  } finally {
    workspace.cleanup();
  }
});
