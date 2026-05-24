#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("root package wires the examples contract into repository checks", () => {
  const packageJson = JSON.parse(
    readFileSync(join(repoRoot, "package.json"), "utf8"),
  );

  assert.equal(
    packageJson.scripts["check:examples"],
    "node scripts/check-examples.mjs && node --test scripts/check-examples.test.mjs",
  );
  assert.match(packageJson.scripts.check, /pnpm run check:examples/u);
});

test("user-facing examples satisfy the OASLANA-77 repository contract", () => {
  execFileSync(process.execPath, ["scripts/check-examples.mjs"], {
    cwd: repoRoot,
    stdio: "pipe",
  });
});
