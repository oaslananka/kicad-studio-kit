import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsDir, "..");
const script = path.join(scriptsDir, "check-nls-parity.mjs");
const englishFile = path.join(
  repoRoot,
  "apps/vscode-extension/package.nls.json",
);

function withCatalog(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-nls-"));
  try {
    fs.copyFileSync(englishFile, path.join(dir, "package.nls.json"));
    return callback(dir, () =>
      spawnSync(process.execPath, [script], {
        encoding: "utf8",
        env: { ...process.env, STUDIO_NLS_TEST_DIRECTORY: dir },
      }),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("English-only NLS catalog validation", () => {
  it("accepts the English source message catalog", () => {
    withCatalog((_dir, check) => {
      const result = check();
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /English-only NLS catalog verified/u);
    });
  });

  it("rejects translation catalogs for any locale", () => {
    withCatalog((dir, check) => {
      for (const locale of ["tr", "de", "fr", "ja", "es"]) {
        const filename = `package.nls.${locale}.json`;
        fs.writeFileSync(path.join(dir, filename), "{}");
        const result = check();
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /Additional locale catalog is prohibited/u);
        fs.rmSync(path.join(dir, filename));
      }
    });
  });

  it("rejects empty or non-string English messages", () => {
    withCatalog((dir, check) => {
      const file = path.join(dir, "package.nls.json");
      for (const value of ["", 42, null]) {
        fs.writeFileSync(file, JSON.stringify({ sample: value }));
        const result = check();
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /nonempty string/u);
      }
    });
  });

  it("fails when the English catalog is missing", () => {
    withCatalog((dir, check) => {
      fs.rmSync(path.join(dir, "package.nls.json"));
      const result = check();
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /must be readable/u);
    });
  });
});
