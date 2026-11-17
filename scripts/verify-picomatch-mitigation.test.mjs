import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { assessAudit } from "./verify-picomatch-mitigation.mjs";

const affected = {
  id: 1247710,
  github_advisory_id: "GHSA-fc5q-39xc-vjpf",
  module_name: "picomatch",
  severity: "high",
  findings: [{ version: "2.3.2" }, { version: "4.0.7" }],
};
const report = (entries) => ({
  metadata: {
    vulnerabilities: {
      high: Object.values(entries).filter(
        (advisory) => advisory.severity === "high",
      ).length,
      critical: Object.values(entries).filter(
        (advisory) => advisory.severity === "critical",
      ).length,
    },
  },
  advisories: entries,
});

test("accepts a clean audit", () => {
  assert.equal(assessAudit(report({})), 0);
});

test("recognizes exactly the patched advisory and versions", () => {
  assert.equal(assessAudit(report({ 1247710: affected })), 1);
});

test("rejects unknown high vulnerability even beside recognized advisory", () => {
  const other = {
    ...affected,
    github_advisory_id: "GHSA-other",
    module_name: "other",
  };
  assert.throws(
    () => assessAudit(report({ 1247710: affected, 123: other })),
    /Unmitigated/,
  );
});

test("rejects a new vulnerable picomatch version not patched", () => {
  const other = { ...affected, findings: [{ version: "4.0.8" }] };
  assert.throws(() => assessAudit(report({ 1: other })), /Unmitigated/);
});

test("rejects altered picomatch advisory identity", () => {
  const other = { ...affected, github_advisory_id: "GHSA-unreviewed" };
  assert.throws(() => assessAudit(report({ 1: other })), /Unmitigated/);
});

test("rejects invalid audit data instead of silently passing", () => {
  assert.throws(() => assessAudit({}), /Missing/);
});

test("rejects missing high/critical entries reported by audit metadata", () => {
  const incomplete = report({});
  incomplete.metadata.vulnerabilities.high = 1;
  assert.throws(() => assessAudit(incomplete), /omits declared/);
});

test("security entrypoints use mitigated auditing while preserving a raw registry diagnostic", () => {
  const extension = JSON.parse(
    readFileSync(
      new URL("../apps/vscode-extension/package.json", import.meta.url),
    ),
  );
  assert.equal(extension.scripts["audit:ci"], "pnpm audit --audit-level high");
  for (const entrypoint of ["local-security.sh", "local-security.ps1"]) {
    const script = readFileSync(
      new URL(
        `../apps/vscode-extension/scripts/${entrypoint}`,
        import.meta.url,
      ),
      "utf8",
    );
    assert.match(
      script,
      /node scripts\/verify-picomatch-mitigation\.mjs --audit/u,
    );
    assert.doesNotMatch(script, /(?:corepack )?pnpm audit --audit-level high/u);
  }
});
