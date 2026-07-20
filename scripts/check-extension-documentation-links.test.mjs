#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const checkerUrl = pathToFileURL(
  join(repoRoot, "scripts", "check-extension-documentation-links.mjs"),
).href;

async function loadChecker() {
  return import(`${checkerUrl}?test=${Date.now()}-${Math.random()}`);
}

function createFixture(source) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "kicad-doc-links-"));
  const sourceRoot = join(fixtureRoot, "apps", "vscode-extension", "src");
  mkdirSync(sourceRoot, { recursive: true });
  writeFileSync(join(sourceRoot, "example.ts"), source, "utf8");
  return fixtureRoot;
}

test("root package wires the extension documentation link gate (#488)", () => {
  const packageJson = JSON.parse(
    readFileSync(join(repoRoot, "package.json"), "utf8"),
  );

  assert.equal(
    packageJson.scripts["check:extension-doc-links"],
    "node scripts/check-extension-documentation-links.mjs && node --test scripts/check-extension-documentation-links.test.mjs",
  );
  assert.match(
    packageJson.scripts.check,
    /pnpm run check:extension-doc-links/u,
  );
});

test("accepts an existing own-repository documentation target (#488)", async (t) => {
  const fixtureRoot = createFixture(
    "export const url = 'https://github.com/oaslananka/kicad-studio-kit/blob/main/docs/guide.md';\n",
  );
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));
  mkdirSync(join(fixtureRoot, "docs"), { recursive: true });
  writeFileSync(join(fixtureRoot, "docs", "guide.md"), "# Guide\n", "utf8");

  const { collectExtensionDocumentationLinkErrors } = await loadChecker();

  assert.deepEqual(
    collectExtensionDocumentationLinkErrors({ repoRoot: fixtureRoot }),
    [],
  );
});

test("reports source line and missing target for drift (#488)", async (t) => {
  const fixtureRoot = createFixture(
    [
      "export const first = true;",
      "export const url = 'https://github.com/oaslananka/kicad-studio-kit/blob/main/docs/missing.md';",
      "",
    ].join("\n"),
  );
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

  const { collectExtensionDocumentationLinkErrors } = await loadChecker();
  const errors = collectExtensionDocumentationLinkErrors({
    repoRoot: fixtureRoot,
  });

  assert.equal(errors.length, 1);
  assert.match(errors[0], /apps\/vscode-extension\/src\/example\.ts:2/u);
  assert.match(errors[0], /docs\/missing\.md/u);
});

test("rejects encoded repository path traversal (#488)", async (t) => {
  const fixtureRoot = createFixture(
    "export const url = 'https://github.com/oaslananka/kicad-studio-kit/blob/main/docs/%2E%2E/secret.md';\n",
  );
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

  const { collectExtensionDocumentationLinkErrors } = await loadChecker();
  const errors = collectExtensionDocumentationLinkErrors({
    repoRoot: fixtureRoot,
  });

  assert.equal(errors.length, 1);
  assert.match(errors[0], /unsafe repository documentation target/u);
});
