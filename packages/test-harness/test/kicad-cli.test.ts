import assert from "node:assert/strict";
import test from "node:test";

import { buildKicadCliArgs, runKicadCli } from "../src/index";

test("builds and redacts KiCad CLI test invocations", () => {
  assert.deepEqual(buildKicadCliArgs("version"), ["version"]);
  const result = runKicadCli({
    executable: process.execPath,
    args: ["-e", "console.log('ok token=secret')"],
    sensitiveValues: ["secret"],
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "ok token=[REDACTED]");
});
