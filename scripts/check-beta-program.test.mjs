import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

test("beta program documentation and intake surfaces are wired", () => {
  const betaProgram = readText("docs/beta-program.md");
  const contributors = readText("CONTRIBUTORS.md");
  const discussionForm = readText(
    ".github/DISCUSSION_TEMPLATE/beta-feedback.yml",
  );
  const rootPackage = readJson("package.json");
  const extensionPackage = readJson("apps/vscode-extension/package.json");
  const englishNls = readJson("apps/vscode-extension/package.nls.json");
  const turkishNls = readJson("apps/vscode-extension/package.nls.tr.json");
  const packageExtensionScript = readText(
    "apps/vscode-extension/scripts/package-extension.js",
  );
  const workflow = readText(".github/workflows/publish-extension.yml");
  const rootLabels = readText(".github/labels.yml");

  for (const expected of [
    "beta-feedback",
    "KiCad Studio: Send Feedback",
    "source:beta",
    "2-week beta cycles",
    "10-20 beta testers",
    "weekly async email digest",
    "KiCad Studio Beta",
    "KiCad Studio Stable",
    "no NDA",
  ]) {
    assert.match(betaProgram, new RegExp(expected, "iu"));
  }

  assert.match(contributors, /Beta tester recognition/iu);
  assert.match(discussionForm, /labels:\s*\["source:beta"\]/u);
  assert.match(discussionForm, /id:\s*operating-systems/u);
  assert.match(discussionForm, /id:\s*workflow/u);
  assert.match(discussionForm, /id:\s*consent/u);
  assert.match(rootLabels, /name:\s*source:beta/u);

  assert.equal(
    rootPackage.scripts["test:beta-program"],
    "node --test scripts/check-beta-program.test.mjs",
  );
  assert.equal(
    rootPackage.scripts["check:beta-program"],
    "node scripts/check-beta-program.mjs && pnpm run test:beta-program",
  );
  assert.match(rootPackage.scripts.check, /check:beta-program/u);

  assert.ok(
    extensionPackage.contributes.commands.some(
      (command) => command.command === "kicadstudio.sendFeedback",
    ),
  );
  assert.ok(
    extensionPackage.contributes.menus.commandPalette.some(
      (item) => item.command === "kicadstudio.sendFeedback",
    ),
  );
  assert.equal(
    englishNls["kicadstudio.contributes.commands.92.title"],
    "KiCad Studio: Send Feedback",
  );
  assert.equal(
    turkishNls["kicadstudio.contributes.commands.92.title"],
    "KiCad Studio: Geri Bildirim Gönder",
  );

  assert.match(workflow, /KICAD_STUDIO_EXTENSION_PRE_RELEASE/u);
  assert.match(workflow, /--pre-release/u);
  assert.match(packageExtensionScript, /KICAD_STUDIO_EXTENSION_PRE_RELEASE/u);
  assert.match(
    packageExtensionScript,
    /process\.argv\.includes\('--pre-release'\)/u,
  );
  assert.match(
    packageExtensionScript,
    /\.\.\.\(isPreRelease \? \['--pre-release'\] : \[\]\)/u,
  );
  assert.match(workflow, /-beta\./u);
});
