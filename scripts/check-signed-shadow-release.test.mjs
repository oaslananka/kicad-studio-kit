import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  selectSignedShadowRelease,
  extractSignedReleaseNotes,
  verifySignedReleaseVersion,
} from "./check-signed-shadow-release.mjs";

const repository = "oaslananka/kicad-studio-kit";
const mergeSha = "e11c06c951e38bc426b71a3e637a62924deb6b45";
const pr = {
  title: "chore(main): release vscode-extension 1.17.1",
  merged_at: "2026-10-19T20:04:32Z",
  merge_commit_sha: mergeSha,
  base: { ref: "main", repo: { full_name: repository } },
  head: {
    ref: "release-please/branches/main/components/vscode-extension-r39314083445",
    sha: "7eb5047e72f2456a0239bcea4f738659aca449db",
    repo: { full_name: repository },
  },
};

test("October 2026 signed PR #799 is identified only via its exact merged SHA", () => {
  assert.deepEqual(selectSignedShadowRelease([pr], repository, mergeSha), {
    version: "1.17.1",
    tag: "vscode-extension-v1.17.1",
    headSha: pr.head.sha,
    isPrerelease: false,
  });
});

test("rejects lookalike release titles, branches, sources, unmerged and ambiguous PRs", () => {
  for (const patch of [
    { title: "chore(main): release vscode-extension 1.17.1; echo bad" },
    {
      head: {
        ...pr.head,
        ref: "release-please/branches/main/components/vscode-extension",
      },
    },
    {
      head: {
        ...pr.head,
        ref: "release-please/branches/main/components/vscode-extension-rBAD",
      },
    },
    { head: { ...pr.head, repo: { full_name: "another/repo" } } },
    { base: { ...pr.base, ref: "dev" } },
    { merged_at: null },
  ]) {
    assert.throws(
      () =>
        selectSignedShadowRelease([{ ...pr, ...patch }], repository, mergeSha),
      /not a trusted signed release shadow/u,
    );
  }
  assert.throws(
    () => selectSignedShadowRelease([pr, pr], repository, mergeSha),
    /exactly one/u,
  );
  assert.throws(
    () => selectSignedShadowRelease([pr], repository, "0".repeat(40)),
    /exactly one/u,
  );
  assert.throws(
    () => selectSignedShadowRelease([], repository, "bad sha"),
    /full merged commit SHA/u,
  );
});

test("prereleases retain suffix and stay marked prerelease", () => {
  const modified = {
    ...pr,
    title: "chore(main): release vscode-extension 1.18.0-beta.1",
  };
  const result = selectSignedShadowRelease([modified], repository, mergeSha);
  assert.equal(result.tag, "vscode-extension-v1.18.0-beta.1");
  assert.equal(result.isPrerelease, true);
});

test("version must match manifest and extension package", () => {
  verifySignedReleaseVersion(
    { "apps/vscode-extension": "1.17.1" },
    { version: "1.17.1" },
    "1.17.1",
  );
  assert.throws(
    () =>
      verifySignedReleaseVersion(
        { "apps/vscode-extension": "1.17.0" },
        { version: "1.17.1" },
        "1.17.1",
      ),
    /disagree/u,
  );
});

test("notes come only from matching changelog section", () => {
  const changelog = readFileSync(
    new URL("../apps/vscode-extension/CHANGELOG.md", import.meta.url),
    "utf8",
  );
  const notes = extractSignedReleaseNotes(changelog, "1.17.1");
  assert.match(notes, /^## \[1\.17\.1\]/u);
  assert.doesNotMatch(notes, /## \[1\.17\.0\]/u);
  assert.ok(notes.length > 80);
  assert.throws(
    () => extractSignedReleaseNotes(changelog, "999.999.999"),
    /Missing changelog/u,
  );
});

test("CLI validates a real shaped merged release event and writes canonical notes", () => {
  const dir = mkdtempSync(join(tmpdir(), "studio-signed-shadow-"));
  try {
    const prs = join(dir, "prs.json");
    const manifest = join(dir, "manifest.json");
    const pkg = join(dir, "package.json");
    const notes = join(dir, "notes.md");
    const output = join(dir, "output");
    writeFileSync(prs, JSON.stringify([pr]));
    writeFileSync(
      manifest,
      JSON.stringify({ "apps/vscode-extension": "1.17.1" }),
    );
    writeFileSync(pkg, JSON.stringify({ version: "1.17.1" }));
    const cmd = [
      fileURLToPath(
        new URL("./check-signed-shadow-release.mjs", import.meta.url),
      ),
      prs,
      repository,
      mergeSha,
      manifest,
      pkg,
      fileURLToPath(
        new URL("../apps/vscode-extension/CHANGELOG.md", import.meta.url),
      ),
      notes,
      output,
    ];
    const run = spawnSync(process.execPath, cmd, { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    assert.match(
      readFileSync(output, "utf8"),
      /^tag=vscode-extension-v1\.17\.1/mu,
    );
    assert.match(readFileSync(notes, "utf8"), /^## \[1\.17\.1\]/u);
    writeFileSync(
      manifest,
      JSON.stringify({ "apps/vscode-extension": "1.17.0" }),
    );
    const invalid = spawnSync(process.execPath, cmd, { encoding: "utf8" });
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /disagree/u);
    writeFileSync(
      manifest,
      JSON.stringify({ "apps/vscode-extension": "1.17.1" }),
    );
    writeFileSync(prs, JSON.stringify([{ ...pr, merged_at: null }]));
    const unmerged = spawnSync(process.execPath, cmd, { encoding: "utf8" });
    assert.notEqual(unmerged.status, 0);
    assert.match(unmerged.stderr, /not a trusted signed release shadow/u);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
