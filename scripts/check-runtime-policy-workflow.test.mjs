import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse as parseYaml } from "yaml";

const workflowPath = ".github/workflows/runtime-policy-drift.yml";
const docsPath = "docs/compatibility/runtime-policy.md";

test("#494 scheduled runtime policy workflow is manual, weekly, and least privilege", () => {
  const source = fs.readFileSync(workflowPath, "utf8");
  const workflow = parseYaml(source);

  assert.ok(Object.hasOwn(workflow.on, "workflow_dispatch"));
  assert.equal(workflow.on.schedule.length, 1);
  assert.equal(workflow.permissions.contents, "read");
  assert.equal(workflow.jobs.drift["runs-on"], "ubuntu-24.04");
  assert.match(
    source,
    /node scripts\/check-runtime-policy\.mjs[\s\S]*?--fetch/u,
  );
  assert.match(source, /--json runtime-policy-report\.json/u);
  assert.match(source, /GITHUB_STEP_SUMMARY/u);
  assert.match(source, /actions\/upload-artifact@[0-9a-f]{40}/u);
  assert.doesNotMatch(source, /issues:\s*write/u);
});

test("#494 runtime policy documentation explains deterministic and network gates", () => {
  const docs = fs.readFileSync(docsPath, "utf8");
  assert.match(docs, /^# Runtime Policy Enforcement$/mu);
  assert.match(docs, /check:compatibility-contract/u);
  assert.match(docs, /scheduled and manual/iu);
  assert.match(docs, /unknown/u);
  assert.match(docs, /report/u);
  assert.match(docs, /error/u);
});
