import assert from "node:assert/strict";
import test from "node:test";
import { createBetaProgramChecks } from "./lib/beta-program-checks.mjs";

test("beta program documentation and intake surfaces are wired", () => {
  const checks = createBetaProgramChecks();
  assert.equal(checks.length, 27);
  assert.deepEqual(
    checks.filter((item) => !item.ok),
    [],
  );
});
