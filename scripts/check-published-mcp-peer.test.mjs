import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import YAML from "yaml";
import { validateLatestPublishedMcp } from "./check-published-mcp-peer.mjs";

const canonical = YAML.parse(readFileSync("compatibility.yaml", "utf8"));
const tested = canonical.supportAxes.mcpServer.testedAgainst.version;

test("published compatible same version retains testedAgainst", () => {
  assert.equal(validateLatestPublishedMcp(canonical, tested), tested);
});

test("newer published in-range version still undergoes real-pair canary", () => {
  const newer = "4.99.0";
  assert.equal(validateLatestPublishedMcp(canonical, newer), tested);
});

test("latest outside supported range fails closed", () => {
  assert.throws(
    () => validateLatestPublishedMcp(canonical, "5.0.0"),
    /outside the supported range/u,
  );
});

test("a registry rollback behind testedAgainst fails closed", () => {
  assert.throws(
    () => validateLatestPublishedMcp(canonical, "4.3.0"),
    /older than testedAgainst/u,
  );
});

test("malformed and prerelease versions are not accepted", () => {
  for (const version of ["latest", "4.8", "4.8.0-rc.1", "", undefined]) {
    assert.throws(
      () => validateLatestPublishedMcp(canonical, version),
      /exact stable version/u,
    );
  }
});

test("invalid recorded testedAgainst or unsupported range is refused", () => {
  const wrong = structuredClone(canonical);
  wrong.supportAxes.mcpServer.testedAgainst.version = "5.0.0";
  assert.throws(
    () => validateLatestPublishedMcp(wrong, "5.0.0"),
    /outside the supported range/u,
  );
  wrong.supportAxes.mcpServer.required = "not-a-range";
  assert.throws(
    () => validateLatestPublishedMcp(wrong, "5.0.0"),
    /range is missing or invalid/u,
  );
});

test("canary still tests latest signed published artifacts and real-pair protocols", () => {
  const workflow = readFileSync(
    ".github/workflows/cross-repo-compatibility.yml",
    "utf8",
  );
  assert.match(
    workflow,
    /Verify published PyPI files and source-tag attestations/u,
  );
  assert.match(
    workflow,
    /Canary Studio real-pair protocols \(published PyPI\)/u,
  );
  assert.match(workflow, /KICAD_MCP_PRO_LATEST_VERSION:/u);
  assert.match(workflow, /node scripts\/check-published-mcp-peer\.mjs/u);
  assert.match(workflow, /steps\.mcp-window\.outputs\.tested_version/u);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/u);
});

test("CLI outputs only the pinned stable version for the workflow", () => {
  const run = spawnSync(
    process.execPath,
    ["scripts/check-published-mcp-peer.mjs"],
    {
      env: { ...process.env, KICAD_MCP_PRO_LATEST_VERSION: tested },
      encoding: "utf8",
    },
  );
  assert.equal(run.status, 0);
  assert.equal(run.stdout.trim(), tested);
  assert.equal(run.stderr.trim(), "");
});

test("CLI reports a compatible latest version as a notice, not a tested claim", () => {
  const run = spawnSync(
    process.execPath,
    ["scripts/check-published-mcp-peer.mjs"],
    {
      env: { ...process.env, KICAD_MCP_PRO_LATEST_VERSION: "4.99.0" },
      encoding: "utf8",
    },
  );
  assert.equal(run.status, 0);
  assert.equal(run.stdout.trim(), tested);
  assert.match(run.stderr, /::notice::Latest published MCP 4\.99\.0/u);
});

test("CLI refuses unsupported and missing latest versions", () => {
  for (const latest of ["5.0.0", ""]) {
    const run = spawnSync(
      process.execPath,
      ["scripts/check-published-mcp-peer.mjs"],
      {
        env: { ...process.env, KICAD_MCP_PRO_LATEST_VERSION: latest },
        encoding: "utf8",
      },
    );
    assert.equal(run.status, 1);
    assert.equal(run.stdout, "");
    assert.match(
      run.stderr,
      /outside the supported range|exact stable version/u,
    );
  }
});
