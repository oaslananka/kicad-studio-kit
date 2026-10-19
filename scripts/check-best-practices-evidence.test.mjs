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

test("README badges separate historic Silver evidence from current status", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const header = readme.split("</div>", 1)[0];

  assert.doesNotMatch(header, /Historical OpenSSF Best Practices Silver/u);
  assert.match(
    readme,
    /\*\*Historical OpenSSF Best Practices Silver \(MIT-licensed period\):\*\*/u,
  );
  assert.match(readme, /not presented as a current FLOSS badge/u);

  const deepWikiLink = "https://deepwiki.com/oaslananka/kicad-studio-kit";
  assert.equal(readme.split('href="' + deepWikiLink + '"').length - 1, 1);
  assert.match(header, /https:\/\/img\.shields\.io\/badge\/Ask-DeepWiki-/u);
  assert.doesNotMatch(header, /src="https:\/\/deepwiki\.com\/badge\.svg"/u);
});
