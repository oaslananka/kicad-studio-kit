import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateRuntimePolicy,
  parseKiCadStableRelease,
  parsePythonBugfixWindow,
  parseVsCodeStableRelease,
  renderRuntimePolicyMarkdown,
  validateRuntimePolicyMetadata,
} from "./lib/runtime-policy.mjs";

function makeCompatibility() {
  return {
    kicad: { primary: "10.0.x", latestVerified: "10.0.3" },
    vscode: { minimum: "1.128.0", enginesRange: "^1.128.0" },
    python: {
      range: ">=3.13",
      primary: "3.13",
      supported: ["3.13", "3.14"],
    },
    runtimePolicy: {
      reviewed: "2026-07-20",
      sources: {
        vscodeStable:
          "https://update.code.visualstudio.com/api/releases/stable",
        vscodeInsiders:
          "https://update.code.visualstudio.com/api/update/linux-x64/insider/latest",
        pythonReleases: "https://peps.python.org/api/python-releases.json",
        kicadDownloads: "https://www.kicad.org/download/linux/",
      },
      enforcement: {
        vscode: "report",
        python: "report",
        kicad: "report",
        sourceUnavailable: "report",
      },
      vscode: {
        maxMinimumMinorLag: 1,
        loweringRequiresChangelog: "apps/vscode-extension/CHANGELOG.md",
      },
      python: { supportedMinorWindow: 2 },
      kicad: {
        primaryMajorLag: 0,
        loweringRequiresChangelogs: ["apps/vscode-extension/CHANGELOG.md"],
      },
    },
  };
}

const extensionPackage = { engines: { vscode: "^1.128.0" } };

test("#494 validates deterministic runtime policy metadata", () => {
  assert.deepEqual(
    validateRuntimePolicyMetadata({
      compatibility: makeCompatibility(),
      extensionPackage,
    }),
    [],
  );
});

test("#494 rejects malformed and internally inconsistent runtime policy metadata", () => {
  const compatibility = makeCompatibility();
  compatibility.runtimePolicy.reviewed = "not-a-date";
  compatibility.runtimePolicy.enforcement.python = "ignore";
  compatibility.runtimePolicy.vscode.maxMinimumMinorLag = -1;
  compatibility.runtimePolicy.python.supportedMinorWindow = 3;
  compatibility.runtimePolicy.kicad.primaryMajorLag = "zero";
  compatibility.vscode.enginesRange = "^1.127.0";

  const errors = validateRuntimePolicyMetadata({
    compatibility,
    extensionPackage,
  }).join("\n");

  assert.match(errors, /runtimePolicy\.reviewed/u);
  assert.match(errors, /runtimePolicy\.enforcement\.python/u);
  assert.match(errors, /maxMinimumMinorLag/u);
  assert.match(errors, /supportedMinorWindow/u);
  assert.match(errors, /primaryMajorLag/u);
  assert.match(errors, /engines\.vscode/u);
});

test("#494 parses authoritative VS Code, Python, and KiCad source shapes", () => {
  assert.equal(parseVsCodeStableRelease(["1.129.1", "1.129.0"]), "1.129.1");
  assert.deepEqual(
    parsePythonBugfixWindow({
      metadata: {
        3.12: { status: "security" },
        3.13: { status: "bugfix" },
        3.14: { status: "bugfix" },
        3.15: { status: "prerelease" },
      },
    }),
    ["3.13", "3.14"],
  );
  assert.equal(
    parseKiCadStableRelease(
      '<a href="https://downloads.kicad.org/kicad-10.0.4-x86_64.AppImage">Download</a>',
    ),
    "10.0.4",
  );
});

test("#494 source parsers fail closed for malformed upstream data", () => {
  assert.throws(() => parseVsCodeStableRelease({}), /VS Code/u);
  assert.throws(
    () => parsePythonBugfixWindow({ metadata: { 3.14: {} } }),
    /Python/u,
  );
  assert.throws(() => parseKiCadStableRelease("no release here"), /KiCad/u);
});

test("#494 reports current runtime policy when all upstream data is within policy", () => {
  const report = evaluateRuntimePolicy({
    compatibility: makeCompatibility(),
    upstream: {
      vscode: { status: "available", version: "1.129.1" },
      python: { status: "available", versions: ["3.13", "3.14"] },
      kicad: { status: "available", version: "10.0.3" },
    },
  });

  assert.equal(report.status, "current");
  assert.deepEqual(
    report.runtimes.map(({ runtime, status }) => ({ runtime, status })),
    [
      { runtime: "vscode", status: "current" },
      { runtime: "python", status: "current" },
      { runtime: "kicad", status: "current" },
    ],
  );
  assert.equal(report.exitCode, 0);
});

test("#494 reports VS Code, Python, and KiCad drift with patch freshness evidence", () => {
  const report = evaluateRuntimePolicy({
    compatibility: makeCompatibility(),
    upstream: {
      vscode: { status: "available", version: "1.131.0" },
      python: { status: "available", versions: ["3.14", "3.15"] },
      kicad: { status: "available", version: "11.0.1" },
    },
  });

  assert.equal(report.status, "drift");
  assert.match(report.runtimes[0].message, /lag 3 exceeds 1/u);
  assert.match(report.runtimes[1].message, /3\.14, 3\.15/u);
  assert.match(report.runtimes[2].message, /major lag 1 exceeds 0/u);
  assert.equal(report.runtimes[2].details.patchFreshness, "behind");
  assert.equal(report.exitCode, 0, "report enforcement is non-blocking");
});

test("#494 promotes explicitly configured upstream drift to a failure", () => {
  const compatibility = makeCompatibility();
  compatibility.runtimePolicy.enforcement.vscode = "error";

  const report = evaluateRuntimePolicy({
    compatibility,
    upstream: {
      vscode: { status: "available", version: "1.131.0" },
      python: { status: "available", versions: ["3.13", "3.14"] },
      kicad: { status: "available", version: "10.0.3" },
    },
  });

  assert.equal(report.exitCode, 1);
  assert.equal(report.runtimes[0].enforcement, "error");
});

test("#494 reports unavailable sources as unknown instead of current", () => {
  const report = evaluateRuntimePolicy({
    compatibility: makeCompatibility(),
    upstream: {
      vscode: { status: "unknown", error: "timeout" },
      python: { status: "available", versions: ["3.13", "3.14"] },
      kicad: { status: "available", version: "10.0.3" },
    },
  });

  assert.equal(report.status, "unknown");
  assert.equal(report.runtimes[0].status, "unknown");
  assert.match(report.runtimes[0].message, /timeout/u);
  assert.equal(report.exitCode, 0);
});

test("#494 renders a readable workflow summary", () => {
  const report = evaluateRuntimePolicy({
    compatibility: makeCompatibility(),
    upstream: {
      vscode: { status: "available", version: "1.129.1" },
      python: { status: "available", versions: ["3.13", "3.14"] },
      kicad: { status: "available", version: "10.0.4" },
    },
  });

  const markdown = renderRuntimePolicyMarkdown(report);
  assert.match(markdown, /^# Runtime Policy Drift Report/mu);
  assert.match(markdown, /\| VS Code \| current \| report \|/u);
  assert.match(markdown, /KiCad stable patch 10\.0\.4/u);
});
