import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateDevcontainerRepository } from "./check-devcontainer.mjs";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("devcontainer configuration satisfies the OASLANA-65 contract", () => {
  assert.deepEqual(validateDevcontainerRepository(REPO_ROOT), []);
});

test("root scripts expose devcontainer and dev-doctor checks", () => {
  const packageJson = JSON.parse(
    readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"),
  );

  assert.equal(
    packageJson.scripts["check:devcontainer"],
    "node scripts/check-devcontainer.mjs && node --test scripts/check-devcontainer.test.mjs scripts/dev-doctor.test.mjs",
  );
  assert.equal(
    packageJson.scripts["dev-doctor"],
    "node scripts/dev-doctor.mjs",
  );
  assert.match(packageJson.scripts.check, /pnpm run check:devcontainer/);
});
