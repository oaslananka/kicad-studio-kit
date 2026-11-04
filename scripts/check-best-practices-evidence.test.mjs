import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateBestPracticesEvidence } from "./check-best-practices-evidence.mjs";

test("Best Practices evidence has the repository-controlled scorecard hardening anchors", () => {
  const result = validateBestPracticesEvidence();
  assert.equal(result.projectId, 13405);
  assert.equal(result.currentLicense, "PolyForm-Noncommercial-1.0.0");
  assert.deepEqual(result.requiredStatusChecks, [
    "required",
    "analyze (javascript-typescript)",
    "analyze (python)",
    "security",
    "scan",
    "dependency-review",
  ]);
  assert.ok(result.coverageThreshold.statements >= 80);
  assert.ok(result.coverageThreshold.lines >= 80);
  assert.ok(result.coverageThreshold.functions >= 80);
  assert.deepEqual(result.scorecard, {
    sampleSize: 30,
    branchWarningCount: 5,
    reviewCadence: "quarterly",
  });
});

test("README keeps GitGem while DeepWiki is a plain link and Silver remains historical", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const header = readme.split("</div>", 1)[0];

  assert.doesNotMatch(header, /Historical OpenSSF Best Practices Silver/u);
  assert.match(
    readme,
    /\*\*Historical OpenSSF Best Practices Silver \(MIT-licensed period\):\*\*/u,
  );
  assert.match(readme, /not presented as a current FLOSS badge/u);

  const gitGemBadge =
    "[![GitGem](https://gitgem.org/api/badge/github/oaslananka/kicad-studio-kit.svg)](https://gitgem.org/github/oaslananka/kicad-studio-kit)";
  const deepWikiLink =
    '<a href="https://deepwiki.com/oaslananka/kicad-studio-kit">Ask DeepWiki</a>';
  assert.equal(readme.split(gitGemBadge).length - 1, 1);
  assert.equal(readme.split(deepWikiLink).length - 1, 1);
  assert.doesNotMatch(readme, /deepwiki\.com\/badge\.svg/u);
});
