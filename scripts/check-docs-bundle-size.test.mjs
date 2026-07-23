import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DOCS_CHUNK_MAX_BYTES,
  DOCS_SEARCH_CHUNK_MAX_BYTES,
  validateDocsBundle,
} from "./check-docs-bundle-size.mjs";

function createFixture(assets) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-bundle-"));
  const assetsRoot = path.join(root, "assets", "chunks");
  fs.mkdirSync(assetsRoot, { recursive: true });
  for (const [name, bytes] of Object.entries(assets)) {
    fs.writeFileSync(path.join(assetsRoot, name), Buffer.alloc(bytes));
  }
  return root;
}

test("#531 accepts measured search and ordinary documentation chunks", () => {
  const root = createFixture({
    "@localSearchIndexroot.fixture.js": DOCS_SEARCH_CHUNK_MAX_BYTES,
    "framework.fixture.js": DOCS_CHUNK_MAX_BYTES,
  });
  try {
    assert.deepEqual(validateDocsBundle(root).errors, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("#531 rejects an oversized local-search index", () => {
  const root = createFixture({
    "@localSearchIndexroot.fixture.js": DOCS_SEARCH_CHUNK_MAX_BYTES + 1,
  });
  try {
    assert.match(validateDocsBundle(root).errors[0], /local search chunk/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("#531 rejects an oversized ordinary documentation chunk", () => {
  const root = createFixture({
    "@localSearchIndexroot.fixture.js": 1,
    "framework.fixture.js": DOCS_CHUNK_MAX_BYTES + 1,
  });
  try {
    assert.match(validateDocsBundle(root).errors[0], /documentation chunk/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("#531 fails closed when the local-search asset is missing", () => {
  const root = createFixture({ "framework.fixture.js": 1 });
  try {
    assert.match(validateDocsBundle(root).errors[0], /local search chunk/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("#531 root documentation scripts retain bundle-policy tests and enforcement", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  const bundleCheck = packageJson.scripts?.["check:docs-bundle"];

  assert.equal(typeof bundleCheck, "string");
  assert.match(bundleCheck, /scripts\/docs-search-index\.test\.mjs/u);
  assert.match(bundleCheck, /scripts\/check-docs-bundle-size\.test\.mjs/u);
  assert.match(bundleCheck, /scripts\/check-docs-bundle-size\.mjs/u);
  assert.match(packageJson.scripts?.["docs:build"] ?? "", /check:docs-bundle/u);
  assert.match(
    packageJson.scripts?.["check:docs-site"] ?? "",
    /check:docs-bundle/u,
  );
});
