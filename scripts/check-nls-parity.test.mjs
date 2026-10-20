import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { auditEnglishCatalog } from "./check-nls-parity.mjs";

const script = fileURLToPath(
  new URL("./check-nls-parity.mjs", import.meta.url),
);

describe("English-only NLS catalog policy", () => {
  it("checks the actual extension catalog without translations", () => {
    const run = spawnSync(process.execPath, [script], {
      encoding: "utf8",
      cwd: path.resolve(path.dirname(script), ".."),
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /English-only NLS catalog verified/u);
  });

  it("runs the policy when invoked via a symlink", () => {
    const temporary = mkdtempSync(path.join(os.tmpdir(), "studio-nls-link-"));
    try {
      const link = path.join(temporary, "check-nls-parity.mjs");
      symlinkSync(script, link);
      const run = spawnSync(process.execPath, [link], {
        encoding: "utf8",
        cwd: path.resolve(path.dirname(script), ".."),
      });
      assert.equal(run.status, 0, run.stderr);
      assert.match(run.stdout, /English-only NLS catalog verified/u);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("rejects any alternate locale catalog", () => {
    for (const locale of ["tr", "de", "fr", "ja", "es"]) {
      const errors = auditEnglishCatalog({ greeting: "Welcome" }, [
        "package.nls.json",
        `package.nls.${locale}.json`,
      ]);
      assert.equal(errors.length, 1);
      assert.match(errors[0], /Additional locale catalog is prohibited/u);
    }
  });

  it("rejects empty or non-string English messages", () => {
    for (const value of ["", 42, null]) {
      assert.deepEqual(
        auditEnglishCatalog({ greeting: value }, ["package.nls.json"]),
        ["English message must be a nonempty string: greeting"],
      );
    }
  });

  it("rejects invalid English catalog structures", () => {
    for (const value of [null, [], "not-an-object"]) {
      assert.deepEqual(auditEnglishCatalog(value, ["package.nls.json"]), [
        "English message catalog must be a JSON object",
      ]);
    }
  });
});
