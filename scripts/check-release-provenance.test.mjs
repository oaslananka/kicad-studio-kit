import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("release provenance policy check passes", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/check-release-provenance.mjs"],
    {
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Release provenance check passed/);
});

test("release provenance policy is also exercised in the Sonar c8 process", async () => {
  // CLI smoke executes in a child process. Import the same validator so c8
  // measures real policy branches rather than reporting zero new coverage.
  await import("./check-release-provenance.mjs");
});
