import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { normalizeSonarLcov } from "./prepare-sonar-lcov.mjs";

function fixture(lcov) {
  const root = mkdtempSync(path.join(os.tmpdir(), "kicad-sonar-lcov-"));
  const source = path.join(root, "apps/vscode-extension/src/viewer.ts");
  const report = path.join(root, "apps/vscode-extension/coverage/lcov.info");
  mkdirSync(path.dirname(source), { recursive: true });
  mkdirSync(path.dirname(report), { recursive: true });
  writeFileSync(source, "export const ready = true;\n");
  writeFileSync(report, lcov);
  return { root, report };
}

test("#706 maps relative Jest SF paths to repository-root files", () => {
  const { root, report } = fixture(
    "TN:\nSF:src/viewer.ts\nDA:1,1\nend_of_record\n",
  );
  try {
    assert.equal(normalizeSonarLcov(root), 1);
    assert.match(
      readFileSync(report, "utf8"),
      /^SF:apps\/vscode-extension\/src\/viewer.ts$/mu,
    );
    assert.equal(normalizeSonarLcov(root), 1, "normalization is idempotent");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#706 missing source fails closed before writing the report", () => {
  const input = "SF:src/untracked.ts\nDA:1,1\n";
  const { root, report } = fixture(input);
  try {
    assert.throws(() => normalizeSonarLcov(root), /unresolvable or unsafe/iu);
    assert.equal(readFileSync(report, "utf8"), input);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#706 traversal fails closed before writing the report", () => {
  const input = "SF:src/../../private.ts\nDA:1,1\n";
  const { root, report } = fixture(input);
  try {
    assert.throws(() => normalizeSonarLcov(root), /unresolvable or unsafe/iu);
    assert.equal(readFileSync(report, "utf8"), input);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#706 missing SF records fail closed", () => {
  const { root, report } = fixture("TN:\nend_of_record\n");
  try {
    assert.ok(existsSync(report));
    assert.throws(
      () => normalizeSonarLcov(root),
      /Missing LCOV source records/iu,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
