import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCreateCommitRequest,
  parseGitStatus,
} from "./lib/github-signed-commit.mjs";

test("signed commit request separates additions and deletions", () => {
  const request = buildCreateCommitRequest({
    repository: "oaslananka/kicad-studio-kit",
    branch: "release-please--branches--main--components--vscode-extension",
    expectedHeadOid: "a".repeat(40),
    headline: "chore(main): release vscode-extension 1.10.0",
    changes: [
      { path: "docs/versions.md", contents: Buffer.from("version 1.10.0\n") },
      { path: "docs/retired.md", deleted: true },
    ],
  });

  assert.match(request.query, /createCommitOnBranch/);
  assert.deepEqual(request.variables.input.branch, {
    repositoryNameWithOwner: "oaslananka/kicad-studio-kit",
    branchName: "release-please--branches--main--components--vscode-extension",
  });
  assert.equal(request.variables.input.expectedHeadOid, "a".repeat(40));
  assert.deepEqual(request.variables.input.fileChanges.additions, [
    {
      path: "docs/versions.md",
      contents: Buffer.from("version 1.10.0\n").toString("base64"),
    },
  ]);
  assert.deepEqual(request.variables.input.fileChanges.deletions, [
    { path: "docs/retired.md" },
  ]);
});

test("git status parser classifies generated modifications and deletions", () => {
  const status = [
    " M docs/versions.md",
    "?? docs/new.md",
    "D  docs/retired.md",
    "",
  ].join("\0");

  assert.deepEqual(parseGitStatus(status), [
    { path: "docs/versions.md", deleted: false },
    { path: "docs/new.md", deleted: false },
    { path: "docs/retired.md", deleted: true },
  ]);
});

test("git status parser rejects rename and copy records", () => {
  assert.throws(
    () => parseGitStatus("R  docs/old.md\0docs/new.md\0"),
    /rename or copy entries are not supported/,
  );
});
