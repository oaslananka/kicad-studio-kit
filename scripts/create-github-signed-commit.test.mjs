import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildCreateCommitRequest,
  parseGitStatus,
} from "./lib/github-signed-commit.mjs";
import * as signedCommitHelpers from "./lib/github-signed-commit.mjs";

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

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
  assert.match(request.query, /signature\s*\{\s*isValid\s+state/u);
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

test("signed commit request rejects unsafe repository and branch values", () => {
  const base = {
    expectedHeadOid: "a".repeat(40),
    headline: "chore(repo): sync generated surfaces",
    changes: [{ path: "docs/versions.md", contents: Buffer.from("ok\n") }],
  };

  assert.throws(
    () =>
      buildCreateCommitRequest({
        ...base,
        repository: "oaslananka/../other",
        branch: "main",
      }),
    /owner\/name/u,
  );
  assert.throws(
    () =>
      buildCreateCommitRequest({
        ...base,
        repository: "oaslananka/kicad-studio-kit",
        branch: "release\nbranch",
      }),
    /safe Git branch name/u,
  );
});

test("signed commit request reports non-buffer content as a type error", () => {
  assert.throws(
    () =>
      buildCreateCommitRequest({
        repository: "oaslananka/kicad-studio-kit",
        branch: "main",
        expectedHeadOid: "a".repeat(40),
        headline: "chore(repo): sync generated surfaces",
        changes: [{ path: "docs/versions.md", contents: "not-a-buffer" }],
      }),
    TypeError,
  );
});

test("signed commit CLI uses its fixed GraphQL request helper", () => {
  const source = fs.readFileSync(
    path.join(REPO_ROOT, "scripts/create-github-signed-commit.mjs"),
    "utf8",
  );
  assert.match(source, /await githubGraphqlRequest\(\{/u);
  assert.doesNotMatch(source, /\bgithubRequest\(/u);
});

test("release diff parser captures tracked additions and deletions", () => {
  assert.equal(typeof signedCommitHelpers.parseGitNameStatus, "function");
  assert.deepEqual(
    signedCommitHelpers.parseGitNameStatus(
      "M\0docs/versions.md\0A\0docs/new.md\0D\0docs/retired.md\0",
    ),
    [
      { path: "docs/versions.md", deleted: false },
      { path: "docs/new.md", deleted: false },
      { path: "docs/retired.md", deleted: true },
    ],
  );
});

test("signed release shadow branch is created from the base without rewriting refs", async () => {
  assert.equal(
    typeof signedCommitHelpers.createReleaseBranchFromBase,
    "function",
  );

  const calls = [];
  const result = await signedCommitHelpers.createReleaseBranchFromBase({
    repository: "oaslananka/kicad-studio-kit",
    branch: "release-please/branches/main/components/vscode-extension",
    baseOid: "1111111111111111111111111111111111111111",
    headline: "chore(kicad-studio): release vscode-extension 1.10.3",
    changes: [
      {
        path: "apps/vscode-extension/package.json",
        contents: Buffer.from("{}"),
      },
    ],
    createRef: async (input) => calls.push(["createRef", input]),
    deleteRef: async (input) => calls.push(["deleteRef", input]),
    createCommit: async (request) => {
      calls.push(["createCommit", request]);
      return { oid: "2222222222222222222222222222222222222222" };
    },
  });

  assert.equal(result.oid, "2222222222222222222222222222222222222222");
  assert.equal(calls[0][0], "createRef");
  assert.deepEqual(calls[0][1], {
    repository: "oaslananka/kicad-studio-kit",
    branch: "release-please/branches/main/components/vscode-extension",
    sha: "1111111111111111111111111111111111111111",
  });
  assert.equal(calls[1][0], "createCommit");
  assert.equal(
    calls[1][1].variables.input.expectedHeadOid,
    "1111111111111111111111111111111111111111",
  );
  assert.equal(
    calls.some(([name]) => name === "deleteRef"),
    false,
  );
});

test("signed release shadow branch cleans up its new ref when commit creation fails", async () => {
  const calls = [];
  const failure = new Error("commit failed");

  await assert.rejects(
    signedCommitHelpers.createReleaseBranchFromBase({
      repository: "oaslananka/kicad-studio-kit",
      branch: "release-please/branches/main/components/vscode-extension",
      baseOid: "1111111111111111111111111111111111111111",
      headline: "chore(kicad-studio): release vscode-extension 1.10.3",
      changes: [
        {
          path: "apps/vscode-extension/package.json",
          contents: Buffer.from("{}"),
        },
      ],
      createRef: async () => calls.push("createRef"),
      deleteRef: async () => calls.push("deleteRef"),
      createCommit: async () => {
        calls.push("createCommit");
        throw failure;
      },
    }),
    (error) => error === failure,
  );

  assert.deepEqual(calls, ["createRef", "createCommit", "deleteRef"]);
});

test("release branch rewrite creates one commit from the base ref", async () => {
  assert.equal(typeof signedCommitHelpers.rewriteReleaseBranch, "function");
  const calls = [];
  const result = await signedCommitHelpers.rewriteReleaseBranch({
    repository: "oaslananka/kicad-studio-kit",
    branch: "release-please--branches--main--components--vscode-extension",
    baseOid: "a".repeat(40),
    expectedHeadOid: "b".repeat(40),
    headline:
      "chore(main): release vscode-extension 1.10.1\n\nSigned-off-by: oaslananka <info@oaslananka.dev>",
    changes: [{ path: "docs/versions.md", contents: Buffer.from("1.10.1\n") }],
    getRemoteHead: async () => "b".repeat(40),
    forceUpdateRef: async ({ sha }) => calls.push(["force", sha]),
    createCommit: async (request) => {
      calls.push(["commit", request.variables.input.expectedHeadOid]);
      return { oid: "c".repeat(40) };
    },
  });

  assert.deepEqual(calls, [
    ["force", "a".repeat(40)],
    ["commit", "a".repeat(40)],
  ]);
  assert.deepEqual(result, { oid: "c".repeat(40) });
});

test("release branch rewrite rejects stale heads and rolls back commit failures", async () => {
  assert.equal(typeof signedCommitHelpers.rewriteReleaseBranch, "function");
  const base = {
    repository: "oaslananka/kicad-studio-kit",
    branch: "release-please--branches--main--components--vscode-extension",
    baseOid: "a".repeat(40),
    expectedHeadOid: "b".repeat(40),
    headline: "chore(main): release vscode-extension 1.10.1",
    changes: [{ path: "docs/versions.md", contents: Buffer.from("1.10.1\n") }],
  };

  await assert.rejects(
    signedCommitHelpers.rewriteReleaseBranch({
      ...base,
      branch: "main",
      getRemoteHead: async () =>
        assert.fail("must reject before remote access"),
      forceUpdateRef: async () => assert.fail("must reject before ref update"),
      createCommit: async () =>
        assert.fail("must reject before commit creation"),
    }),
    /restricted to Release Please branches/u,
  );

  await assert.rejects(
    signedCommitHelpers.rewriteReleaseBranch({
      ...base,
      getRemoteHead: async () => "d".repeat(40),
      forceUpdateRef: async () => assert.fail("must not rewrite a stale ref"),
      createCommit: async () => assert.fail("must not create on a stale ref"),
    }),
    /remote release branch moved/u,
  );

  const calls = [];
  await assert.rejects(
    signedCommitHelpers.rewriteReleaseBranch({
      ...base,
      getRemoteHead: async () => "b".repeat(40),
      forceUpdateRef: async ({ sha }) => calls.push(sha),
      createCommit: async () => {
        throw new Error("synthetic create failure");
      },
    }),
    /synthetic create failure/u,
  );
  assert.deepEqual(calls, ["a".repeat(40), "b".repeat(40)]);
});
