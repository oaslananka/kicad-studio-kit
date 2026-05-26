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
