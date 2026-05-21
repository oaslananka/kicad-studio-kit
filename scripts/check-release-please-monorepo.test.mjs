import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  parseConventionalSubject,
  runSyntheticReleasePleaseDryRun,
  validateCommitScopeCoverage,
  validatePrTitle,
  validateRepositoryPolicy,
} from "./check-release-please-monorepo.mjs";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("release-please manifest mode is product-scoped and version aligned", () => {
  const result = validateRepositoryPolicy(REPO_ROOT);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.productPaths, {
    "kicad-studio": ["apps/vscode-extension"],
    "kicad-mcp-pro": ["packages/mcp-server", "packages/mcp-npm"],
  });
  assert.deepEqual(result.changelogPaths, {
    "apps/vscode-extension": "apps/vscode-extension/CHANGELOG.md",
    "packages/mcp-server": "packages/mcp-server/CHANGELOG.md",
    "packages/mcp-npm": "packages/mcp-npm/CHANGELOG.md",
  });
});

test("PR title lint accepts only documented product release scopes", () => {
  assert.deepEqual(validatePrTitle("ci(repo): enforce release split"), []);
  assert.deepEqual(
    validatePrTitle("feat(kicad-studio): add viewer export"),
    [],
  );
  assert.deepEqual(
    validatePrTitle("fix(kicad-mcp-pro): harden server info"),
    [],
  );
  assert.deepEqual(validatePrTitle("chore(deps): update release tools"), []);
  assert.deepEqual(
    validatePrTitle("feat(kicad-studio/kicad-mcp-pro): update handshake"),
    [],
  );

  assert.match(
    validatePrTitle("feat(studio): add viewer export").join("\n"),
    /scope "studio" is not allowed/,
  );
  assert.match(
    validatePrTitle("fix: missing scope").join("\n"),
    /must include a scope/,
  );
});

test("commit scope gate rejects a single-scope commit that changes both products", () => {
  const errors = validateCommitScopeCoverage([
    {
      sha: "abc1234",
      subject: "feat(kicad-studio): update shared handshake",
      files: [
        "apps/vscode-extension/src/mcp/client.ts",
        "packages/mcp-server/src/kicad_mcp/server.py",
      ],
    },
  ]);

  assert.equal(errors.length, 1);
  assert.match(errors[0], /touches both product directories/);
  assert.match(errors[0], /kicad-studio\/kicad-mcp-pro/);

  assert.deepEqual(
    validateCommitScopeCoverage([
      {
        sha: "def5678",
        subject: "feat(kicad-studio/kicad-mcp-pro): update shared handshake",
        files: [
          "apps/vscode-extension/src/mcp/client.ts",
          "packages/mcp-server/src/kicad_mcp/server.py",
        ],
      },
    ]),
    [],
  );
});

test("conventional subject parser supports multiple scopes", () => {
  assert.deepEqual(parseConventionalSubject("feat(kicad-studio): add tree"), {
    type: "feat",
    scopes: ["kicad-studio"],
    subject: "add tree",
  });
  assert.deepEqual(
    parseConventionalSubject("feat(kicad-studio,kicad-mcp-pro): add handshake"),
    {
      type: "feat",
      scopes: ["kicad-studio", "kicad-mcp-pro"],
      subject: "add handshake",
    },
  );
});

test("release-please dry-run snapshot keeps MCP-only changes out of extension release", async () => {
  const snapshot = await runSyntheticReleasePleaseDryRun(REPO_ROOT);

  assert.equal(snapshot.pullRequestCount, 1);
  assert.deepEqual(snapshot.titles, [
    "chore(main): release kicad-mcp-pro libraries",
  ]);
  assert.equal(snapshot.includesMcpServerRelease, true);
  assert.equal(snapshot.includesMcpNpmRelease, true);
  assert.equal(snapshot.includesVsCodeExtensionRelease, false);
  assert.equal(snapshot.includesRootOnlyRelease, false);
  assert.deepEqual(snapshot.updatedPaths, [
    ".release-please-manifest.json",
    "packages/mcp-npm/CHANGELOG.md",
    "packages/mcp-npm/package.json",
    "packages/mcp-server/CHANGELOG.md",
    "packages/mcp-server/pyproject.toml",
  ]);
});

test("release-please dry-run snapshot ignores root-only changes", async () => {
  const snapshot = await runSyntheticReleasePleaseDryRun(REPO_ROOT, {
    scenario: "root-only",
  });

  assert.equal(snapshot.pullRequestCount, 0);
  assert.deepEqual(snapshot.titles, []);
  assert.equal(snapshot.includesMcpServerRelease, false);
  assert.equal(snapshot.includesMcpNpmRelease, false);
  assert.equal(snapshot.includesVsCodeExtensionRelease, false);
  assert.equal(snapshot.includesRootOnlyRelease, false);
  assert.deepEqual(snapshot.updatedPaths, []);
});
