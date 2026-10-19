import assert from "node:assert/strict";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const scriptsPath = "scripts/check-docs-site.mjs";

function checkGeneratedDocs() {
  return spawnSync(process.execPath, [scriptsPath, "--generated"], {
    encoding: "utf8",
  });
}

test("docs freshness verifies actual generated screenshots without changed content", () => {
  assert.deepEqual(
    readFileSync("docs/public/screenshots/bom-table.png"),
    readFileSync("apps/vscode-extension/assets/screenshots/bom-table.png"),
  );
  const result = checkGeneratedDocs();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /docs site checks passed/u);
});

test("docs freshness rejects stale binary images and generator restores them", () => {
  const original = readFileSync("docs/public/screenshots/bom-table.png");
  try {
    writeFileSync(
      "docs/public/screenshots/bom-table.png",
      Buffer.from("stale screenshot content"),
    );
    const result = checkGeneratedDocs();
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(
      result.stderr,
      /docs\/public\/screenshots\/bom-table\.png: generated screenshot is stale/u,
    );
    assert.deepEqual(
      readFileSync("docs/public/screenshots/bom-table.png"),
      readFileSync("apps/vscode-extension/assets/screenshots/bom-table.png"),
    );
  } finally {
    writeFileSync("docs/public/screenshots/bom-table.png", original);
  }
});

test("docs freshness rejects a missing binary asset and regenerates it", () => {
  const original = readFileSync("docs/public/screenshots/bom-table.png");
  try {
    unlinkSync("docs/public/screenshots/bom-table.png");
    const result = checkGeneratedDocs();
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(
      result.stderr,
      /docs\/public\/screenshots\/bom-table\.png: generated screenshot is stale/u,
    );
    assert.deepEqual(
      readFileSync("docs/public/screenshots/bom-table.png"),
      readFileSync("apps/vscode-extension/assets/screenshots/bom-table.png"),
    );
  } finally {
    writeFileSync("docs/public/screenshots/bom-table.png", original);
  }
});
