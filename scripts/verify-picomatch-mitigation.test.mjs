import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  assessAudit,
  runAudit,
  verifyFilesAndLock,
  verifyRuntime,
} from "./verify-picomatch-mitigation.mjs";

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

test("frozen installation retains both source patches and bounded matching", () => {
  const installed = verifyFilesAndLock();
  assert.deepEqual(
    installed.map((entry) => entry.version),
    ["2.3.2", "4.0.7"],
  );
  assert.doesNotThrow(() => verifyRuntime(installed));
});

function runWithReport(advisories, status, override = {}) {
  const messages = [];
  const execute = (executable, args, options) => {
    assert.equal(executable, process.execPath);
    assert.match(args[0], /corepack\.js$/u);
    assert.deepEqual(args.slice(1), [
      "pnpm",
      "audit",
      "--audit-level",
      "high",
      "--json",
    ]);
    assert.equal(options.encoding, "utf8");
    assert.equal(options.timeout, 120_000);
    return { status, stdout: JSON.stringify(report(advisories)), stderr: "" };
  };
  runAudit({
    date: "2026-11-18",
    execute,
    log: (line) => messages.push(line),
    ...override,
  });
  return messages;
}

test("audits via the selected Node runtime, accepting a clean result", () => {
  const messages = runWithReport({}, 0);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /no other HIGH\/CRITICAL/u);
});

test("reports the sole patched advisory without disguising registry status", () => {
  const messages = runWithReport({ 1247710: affected }, 1);
  assert.equal(messages.length, 2);
  assert.match(messages[1], /NOT an upstream fix/u);
});

test("fails if audit reports unknown high risks or inconsistent status", () => {
  const other = { ...affected, github_advisory_id: "GHSA-unpatched" };
  assert.throws(() => runWithReport({ unknown: other }, 1), /Unmitigated/u);
  assert.throws(() => runWithReport({}, 1), /failed without a recognized/u);
  assert.throws(
    () => runWithReport({ 1247710: affected }, 0),
    /failed without a recognized/u,
  );
});

test("fails closed on unavailable or malformed audit output", () => {
  assert.throws(() => runWithReport({}, 2), /failed operationally/u);
  assert.throws(
    () =>
      runWithReport({}, 1, {
        execute: () => ({ status: 1, stdout: "malformed", stderr: "" }),
      }),
    /no valid JSON/u,
  );
  assert.throws(
    () =>
      runWithReport({}, 1, {
        execute: () => ({ status: null, error: new Error("audit timeout") }),
      }),
    /audit could not complete/u,
  );
});

test("expires the temporary exception without running the audit", () => {
  assert.throws(
    () =>
      runWithReport({}, 0, {
        date: "2027-02-18",
        execute: () => {
          throw new Error("Must not execute expired audit");
        },
      }),
    /expired/u,
  );
});
