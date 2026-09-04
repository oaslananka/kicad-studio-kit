#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

import { validateKiCad11Readiness } from "./lib/kicad-11-readiness-dashboard.mjs";
import { validateRuntimePolicyMetadata } from "./lib/runtime-policy.mjs";
import { validateMcpProtocolActivation } from "./lib/mcp-protocol-activation.mjs";

export { validateMcpProtocolActivation };

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_ROOT, "..");

const COMPATIBILITY_CONTRACT_FILES = ["compatibility.yaml"];
const DOCS_FILES = [
  "docs/RELEASE-COORDINATION.md",
  "docs/EMERGENCY-RELEASE-FLOW.md",
  "docs/publishing.md",
  "docs/protocol-schemas.md",
  "docs/support-matrix.md",
  "docs/compatibility/runtime-policy.md",
  "docs/compatibility/kicad-11-readiness-dashboard.md",
  "docs/adr/0008-mcp-2026-07-28-protocol-upgrade.md",
  "docs/evidence/mcp-2026-07-28/2026-09-04-review.md",
];

const REQUIRED_FILES = [
  { path: "compatibility.yaml", label: "Compatibility contract" },
  {
    path: ".github/workflows/cross-repo-compatibility.yml",
    label: "Cross-repo compatibility workflow",
  },
  {
    path: "docs/RELEASE-COORDINATION.md",
    label: "Release coordination runbook",
  },
  { path: "docs/EMERGENCY-RELEASE-FLOW.md", label: "Emergency release flow" },
  {
    path: ".github/workflows/runtime-policy-drift.yml",
    label: "Runtime policy drift workflow",
  },
  {
    path: "docs/compatibility/runtime-policy.md",
    label: "Runtime policy documentation",
  },
  {
    path: "docs/compatibility/kicad-11-readiness-dashboard.md",
    label: "KiCad 11 readiness dashboard",
  },
];

function readFile(filePath) {
  return fs.readFileSync(path.join(REPO_ROOT, filePath), "utf8");
}

function fileExists(filePath) {
  return fs.existsSync(path.join(REPO_ROOT, filePath));
}

function gitDiffNames(range) {
  const output = execFileSync("git", ["diff", "--name-only", range], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return output.split(/\r?\n/).filter(Boolean);
}

function detectChangedFiles(options = {}) {
  if (options.changedFiles && options.changedFiles.length > 0) {
    return options.changedFiles;
  }
  const baseSha = options.baseSha || process.env.GITHUB_BASE_SHA || "";
  const headSha = options.headSha || process.env.GITHUB_HEAD_SHA || "";
  const eventName = options.eventName || process.env.GITHUB_EVENT_NAME || "";

  if (eventName === "pull_request" || eventName === "pull_request_target") {
    if (baseSha) {
      return gitDiffNames(`${baseSha}...${headSha || "HEAD"}`);
    }
  }
  if (eventName === "push") {
    const before = options.before || process.env.GITHUB_EVENT_BEFORE || "";
    if (before && !/^0{40}$/.test(before)) {
      const sha = options.sha || process.env.GITHUB_SHA || "HEAD";
      return gitDiffNames(`${before}..${sha}`);
    }
  }
  return [];
}

function checkContractExists(errors) {
  for (const file of REQUIRED_FILES) {
    if (!fileExists(file.path)) {
      errors.push(`${file.path}: missing required ${file.label}`);
    }
  }
}

function checkCompatibilityYamlReferences(errors) {
  if (!fileExists("compatibility.yaml")) return;
  const content = readFile("compatibility.yaml");

  if (!content.includes("mcp:")) {
    errors.push("compatibility.yaml: missing mcp: section");
  }
  if (!content.includes("protocolVersion:")) {
    errors.push("compatibility.yaml: missing mcp.protocolVersion");
  }
  // kicad-mcp-pro is now owned by KiCad MCP Pro repo; no longer
  // expected in compatibility.yaml in this monorepo.
  if (!content.includes("products:")) {
    errors.push("compatibility.yaml: missing products: section");
  }
}

function checkProductVersionAlignment(errors) {
  if (!fileExists("compatibility.yaml")) return;

  const compatibility = parseYaml(readFile("compatibility.yaml"));
  const extensionPackage = JSON.parse(
    readFile("apps/vscode-extension/package.json"),
  );
  const compatibilityVersion =
    compatibility.products?.["kicad-studio"]?.version;

  if (compatibilityVersion !== extensionPackage.version) {
    errors.push(
      `compatibility.yaml products.kicad-studio.version must match apps/vscode-extension/package.json (${extensionPackage.version}), found ${String(compatibilityVersion)}`,
    );
  }
}

function extractTsStringLiteral(source, pattern, label, errors) {
  const match = source.match(pattern);
  if (!match) {
    errors.push(
      `apps/vscode-extension/src/mcp/compatibilityMatrix.ts: missing ${label}`,
    );
    return undefined;
  }
  return match[1];
}

function expectEqual(errors, label, actual, expected) {
  if (actual !== expected) {
    errors.push(
      `apps/vscode-extension/src/mcp/compatibilityMatrix.ts ${label} must match compatibility.yaml/package metadata: expected ${String(expected)}, found ${String(actual)}`,
    );
  }
}

export function validateEmbeddedExtensionCompatibilityMatrix({
  compatibility,
  extensionPackage,
  matrixSource,
} = {}) {
  const errors = [];
  if (!compatibility || !extensionPackage || !matrixSource) {
    errors.push(
      "apps/vscode-extension/src/mcp/compatibilityMatrix.ts: embedded matrix validation requires compatibility metadata, extension package metadata, and matrix source",
    );
    return errors;
  }

  const compatibleMcpPro =
    compatibility.products?.["kicad-studio"]?.compatibleMcpPro ?? {};
  const expectedValues = {
    kicadPrimary: compatibility.kicad?.primary,
    protocolVersion: compatibility.mcp?.protocolVersion,
    toolSchema: compatibility.mcp?.toolSchema,
    kicadStudioVersion: extensionPackage.version,
    mcpRequired: compatibleMcpPro.required,
    mcpRecommended: compatibleMcpPro.recommended,
    mcpTestedAgainst: compatibleMcpPro.testedAgainst,
    kicadMcpProVersion: compatibleMcpPro.testedAgainst,
    compatibleExtensionTestedAgainst: extensionPackage.version,
    boardReadyOpsRequired: compatibility.supportAxes?.boardReadyOps?.required,
    boardReadyOpsTestedAgainst:
      compatibility.supportAxes?.boardReadyOps?.testedAgainst?.version,
  };

  const actualValues = {
    kicadPrimary: extractTsStringLiteral(
      matrixSource,
      /kicad:\s*\{[\s\S]*?primary:\s*'([^']+)'/u,
      "kicad.primary",
      errors,
    ),
    protocolVersion: extractTsStringLiteral(
      matrixSource,
      /mcp:\s*\{[\s\S]*?protocolVersion:\s*'([^']+)'/u,
      "mcp.protocolVersion",
      errors,
    ),
    toolSchema: extractTsStringLiteral(
      matrixSource,
      /mcp:\s*\{[\s\S]*?toolSchema:\s*'([^']+)'/u,
      "mcp.toolSchema",
      errors,
    ),
    kicadStudioVersion: extractTsStringLiteral(
      matrixSource,
      /kicadStudio:\s*\{[\s\S]*?version:\s*'([^']+)'/u,
      "products.kicadStudio.version",
      errors,
    ),
    mcpRequired: extractTsStringLiteral(
      matrixSource,
      /compatibleMcpPro:\s*\{[\s\S]*?required:\s*'([^']+)'/u,
      "products.kicadStudio.compatibleMcpPro.required",
      errors,
    ),
    mcpRecommended: extractTsStringLiteral(
      matrixSource,
      /compatibleMcpPro:\s*\{[\s\S]*?recommended:\s*'([^']+)'/u,
      "products.kicadStudio.compatibleMcpPro.recommended",
      errors,
    ),
    mcpTestedAgainst: extractTsStringLiteral(
      matrixSource,
      /compatibleMcpPro:\s*\{[\s\S]*?testedAgainst:\s*'([^']+)'/u,
      "products.kicadStudio.compatibleMcpPro.testedAgainst",
      errors,
    ),
    kicadMcpProVersion: extractTsStringLiteral(
      matrixSource,
      /kicadMcpPro:\s*\{[\s\S]*?version:\s*'([^']+)'/u,
      "products.kicadMcpPro.version",
      errors,
    ),
    compatibleExtensionTestedAgainst: extractTsStringLiteral(
      matrixSource,
      /compatibleExtension:\s*\{[\s\S]*?testedAgainst:\s*'([^']+)'/u,
      "products.kicadMcpPro.compatibleExtension.testedAgainst",
      errors,
    ),
    boardReadyOpsRequired: extractTsStringLiteral(
      matrixSource,
      /boardReadyOps:\s*\{[\s\S]*?required:\s*'([^']+)'/u,
      "supportAxes.boardReadyOps.required",
      errors,
    ),
    boardReadyOpsTestedAgainst: extractTsStringLiteral(
      matrixSource,
      /boardReadyOps:\s*\{[\s\S]*?testedAgainst:\s*'([^']+)'/u,
      "supportAxes.boardReadyOps.testedAgainst",
      errors,
    ),
  };

  for (const [key, expected] of Object.entries(expectedValues)) {
    expectEqual(errors, key, actualValues[key], expected);
  }

  return errors;
}

function checkEmbeddedExtensionCompatibilityMatrix(errors) {
  if (
    !fileExists("compatibility.yaml") ||
    !fileExists("apps/vscode-extension/package.json") ||
    !fileExists("apps/vscode-extension/src/mcp/compatibilityMatrix.ts")
  ) {
    return;
  }

  const compatibility = parseYaml(readFile("compatibility.yaml"));
  const extensionPackage = JSON.parse(
    readFile("apps/vscode-extension/package.json"),
  );
  const matrixSource = readFile(
    "apps/vscode-extension/src/mcp/compatibilityMatrix.ts",
  );

  errors.push(
    ...validateEmbeddedExtensionCompatibilityMatrix({
      compatibility,
      extensionPackage,
      matrixSource,
    }),
  );
}

function checkStudioConsumesPublishedPackage(errors) {
  const extensionPkgPath = "apps/vscode-extension/package.json";
  const extensionPkg = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, extensionPkgPath), "utf8"),
  );

  const allDeps = {
    ...(extensionPkg.dependencies || {}),
    ...(extensionPkg.devDependencies || {}),
  };

  if (!allDeps["@oaslananka/kicad-protocol-schemas"]) {
    errors.push(
      `${extensionPkgPath}: must depend on published @oaslananka/kicad-protocol-schemas`,
    );
  }

  for (const depName of Object.keys(allDeps)) {
    if (
      depName.includes("protocol-schemas") &&
      !depName.startsWith("@oaslananka/kicad-protocol-schemas")
    ) {
      errors.push(
        `${extensionPkgPath}: unexpected protocol-schemas dependency: ${depName}`,
      );
    }
  }
}

function checkLocalProtocolSchemasAbsent(errors) {
  const localPaths = [
    "packages/protocol-schemas",
    "packages/kicad-protocol-schemas",
    "apps/protocol-schemas",
  ];
  for (const dirPath of localPaths) {
    if (fs.existsSync(path.join(REPO_ROOT, dirPath))) {
      errors.push(
        `${dirPath}: local protocol-schemas must remain absent; use published @oaslananka/kicad-protocol-schemas`,
      );
    }
  }
}

function parseKiCadPatchVersion(value) {
  if (typeof value !== "string") return undefined;
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)(?:-rc(\d+))?$/u);
  if (!match) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    rc: match[4] === undefined ? undefined : Number(match[4]),
  };
}

function comparePatchVersions(left, right) {
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) return left[key] - right[key];
  }
  return 0;
}

function validateKiCadPatchCanary({ canary, stableVersion, repoRoot }) {
  const errors = [];
  if (canary === undefined) return errors;

  if (canary?.state !== "preview" || canary?.blocking !== false) {
    errors.push("kicad.patchCanary must remain preview-only and non-blocking");
  }

  const canaryVersion = parseKiCadPatchVersion(canary?.version);
  if (!canaryVersion || canaryVersion.rc === undefined) {
    errors.push("kicad.patchCanary.version must be an rc patch version");
  } else if (
    stableVersion &&
    comparePatchVersions(canaryVersion, stableVersion) <= 0
  ) {
    errors.push(
      "kicad.patchCanary.version must be newer than kicad.latestVerified",
    );
  }

  const reportedVersion = canaryVersion
    ? `${canaryVersion.major}.${canaryVersion.minor}.${canaryVersion.patch}`
    : undefined;
  if (canary?.reportedVersion !== reportedVersion) {
    errors.push(
      `kicad.patchCanary.reportedVersion must match the prerelease base version (${String(reportedVersion)})`,
    );
  }

  if (
    typeof canary?.releaseNotes !== "string" ||
    !canary.releaseNotes.startsWith("https://www.kicad.org/")
  ) {
    errors.push(
      "kicad.patchCanary.releaseNotes must reference the official KiCad website",
    );
  }

  if (
    canary?.owner !== "KiCad MCP Pro" ||
    canary?.ownerDocumentation !== "https://oaslananka.github.io/kicad-mcp-pro/"
  ) {
    errors.push(
      "kicad.patchCanary ownership must remain with the KiCad MCP Pro compatibility product",
    );
  }

  if (
    typeof canary?.evidence !== "string" ||
    !fs.existsSync(path.join(repoRoot, canary.evidence))
  ) {
    errors.push(
      `kicad.patchCanary.evidence must reference an existing file, found ${String(canary?.evidence)}`,
    );
  }

  return errors;
}

export function validateKiCadPatchBaseline({
  compatibility,
  repoRoot = REPO_ROOT,
} = {}) {
  const errors = [];
  const stable = compatibility?.kicad?.latestVerified;
  const parity = compatibility?.kicad10FeatureParity;
  const baseline = parity?.baseline;

  if (stable !== baseline) {
    errors.push(
      `kicad10FeatureParity.baseline must match kicad.latestVerified (${String(stable)}), found ${String(baseline)}`,
    );
  }

  const stableVersion = parseKiCadPatchVersion(stable);
  if (!stableVersion || stableVersion.rc !== undefined) {
    errors.push(
      "kicad.latestVerified must be a stable major.minor.patch version",
    );
  }

  const documentation = parity?.documentation;
  if (
    typeof documentation !== "string" ||
    !fs.existsSync(path.join(repoRoot, documentation))
  ) {
    errors.push(
      `kicad10FeatureParity.documentation must reference an existing file, found ${String(documentation)}`,
    );
  }

  if (
    typeof stable === "string" &&
    (!String(parity?.sources?.releaseNotes ?? "").includes(stable) ||
      !String(parity?.sources?.releaseTag ?? "").endsWith(`/${stable}`))
  ) {
    errors.push(
      "kicad10FeatureParity release notes and release tag must match kicad.latestVerified",
    );
  }

  const stableEvidence = parity?.sources?.canaryEvidence;
  if (
    typeof stableEvidence !== "string" ||
    !fs.existsSync(path.join(repoRoot, stableEvidence))
  ) {
    errors.push(
      `kicad10FeatureParity.sources.canaryEvidence must reference an existing file, found ${String(stableEvidence)}`,
    );
  }

  errors.push(
    ...validateKiCadPatchCanary({
      canary: compatibility?.kicad?.patchCanary,
      stableVersion,
      repoRoot,
    }),
  );

  return errors;
}

function validateStudioCliAxis({ compatibility, cli }) {
  const errors = [];
  const stable = Array.isArray(cli?.stable) ? cli.stable : [];
  if (stable.length !== 1 || stable[0] !== compatibility?.kicad?.primary) {
    errors.push(
      `supportAxes.studioCli.kicad.stable must contain only kicad.primary (${String(compatibility?.kicad?.primary)})`,
    );
  }
  for (const state of ["stable", "deprecated", "preview", "dropped"]) {
    if (!Array.isArray(cli?.[state])) {
      errors.push(`supportAxes.studioCli.kicad.${state} must be an array`);
    }
  }
  const lifecycleRanges = [
    "stable",
    "deprecated",
    "preview",
    "dropped",
  ].flatMap((state) => (Array.isArray(cli?.[state]) ? cli[state] : []));
  if (new Set(lifecycleRanges).size !== lifecycleRanges.length) {
    errors.push(
      "supportAxes.studioCli.kicad lifecycle ranges must not overlap",
    );
  }
  const legacyDeprecated = (compatibility?.kicad?.supported ?? [])
    .filter((entry) => entry?.state === "deprecated")
    .map((entry) => entry.range);
  if (
    JSON.stringify(cli?.deprecated ?? []) !== JSON.stringify(legacyDeprecated)
  ) {
    errors.push(
      "supportAxes.studioCli.kicad.deprecated must match deprecated kicad.supported lines",
    );
  }
  return errors;
}

function validateMcpServerAxis({
  compatibility,
  mcpServer,
  publishedArtifacts,
}) {
  const errors = [];
  const legacyMcp =
    compatibility?.products?.["kicad-studio"]?.compatibleMcpPro ?? {};
  for (const key of ["required", "recommended"]) {
    if (mcpServer[key] !== legacyMcp[key]) {
      errors.push(
        `supportAxes.mcpServer.${key} must match products.kicad-studio.compatibleMcpPro.${key}`,
      );
    }
  }
  if (mcpServer.testedAgainst?.version !== legacyMcp.testedAgainst) {
    errors.push(
      "supportAxes.mcpServer.testedAgainst.version must match products.kicad-studio.compatibleMcpPro.testedAgainst",
    );
  }
  if (mcpServer.testedAgainst?.registry !== "pypi") {
    errors.push("supportAxes.mcpServer.testedAgainst.registry must be pypi");
  }
  if (
    publishedArtifacts.mcpServerVersion &&
    mcpServer.testedAgainst?.version !== publishedArtifacts.mcpServerVersion
  ) {
    errors.push(
      `supportAxes.mcpServer.testedAgainst.version must match published artifact ${publishedArtifacts.mcpServerVersion}`,
    );
  }
  return errors;
}

function validateMcpProtocolAxis({ compatibility, protocol }) {
  const errors = [];
  if (protocol.active !== compatibility?.mcp?.protocolVersion) {
    errors.push(
      "supportAxes.mcpProtocol.active must match mcp.protocolVersion",
    );
  }
  if (protocol.next !== compatibility?.mcp?.nextProtocolVersion) {
    errors.push(
      "supportAxes.mcpProtocol.next must match mcp.nextProtocolVersion",
    );
  }
  if (protocol.activationState !== compatibility?.mcp?.activation?.state) {
    errors.push(
      "supportAxes.mcpProtocol.activationState must match mcp.activation.state",
    );
  }
  return errors;
}

function validateBoardReadyOpsAxis({ boardReadyOps, publishedArtifacts }) {
  const errors = [];
  if (boardReadyOps.package !== "boardreadyops") {
    errors.push("supportAxes.boardReadyOps.package must be boardreadyops");
  }
  if (boardReadyOps.testedAgainst?.registry !== "npm") {
    errors.push("supportAxes.boardReadyOps.testedAgainst.registry must be npm");
  }
  if (boardReadyOps.reports?.findingsSchema !== 1) {
    errors.push("supportAxes.boardReadyOps.reports.findingsSchema must be 1");
  }
  if (boardReadyOps.reports?.evidenceBundleSchema !== 2) {
    errors.push(
      "supportAxes.boardReadyOps.reports.evidenceBundleSchema must be 2",
    );
  }
  if (
    publishedArtifacts.boardReadyOpsVersion &&
    boardReadyOps.testedAgainst?.version !==
      publishedArtifacts.boardReadyOpsVersion
  ) {
    errors.push(
      `supportAxes.boardReadyOps.testedAgainst.version must match published artifact ${publishedArtifacts.boardReadyOpsVersion}`,
    );
  }
  return errors;
}

export function validateCompatibilityAxes({
  compatibility,
  publishedArtifacts = {},
} = {}) {
  const errors = [];
  const axes = compatibility?.supportAxes;
  for (const axis of [
    "studioCli",
    "mcpServer",
    "mcpProtocol",
    "boardReadyOps",
  ]) {
    if (!axes?.[axis]) {
      errors.push(`supportAxes.${axis} is required`);
    }
  }
  if (!axes) return errors;

  errors.push(
    ...validateStudioCliAxis({
      compatibility,
      cli: axes.studioCli?.kicad,
    }),
    ...validateMcpServerAxis({
      compatibility,
      mcpServer: axes.mcpServer ?? {},
      publishedArtifacts,
    }),
    ...validateMcpProtocolAxis({
      compatibility,
      protocol: axes.mcpProtocol ?? {},
    }),
    ...validateBoardReadyOpsAxis({
      boardReadyOps: axes.boardReadyOps ?? {},
      publishedArtifacts,
    }),
  );
  return errors;
}

function checkRuntimePolicyMetadata(errors, options = {}) {
  if (
    !fileExists("compatibility.yaml") ||
    !fileExists("apps/vscode-extension/package.json")
  ) {
    return;
  }
  const compatibility =
    options.runtimePolicyCompatibility ??
    parseYaml(readFile("compatibility.yaml"));
  const extensionPackage =
    options.runtimePolicyExtensionPackage ??
    JSON.parse(readFile("apps/vscode-extension/package.json"));
  errors.push(
    ...validateRuntimePolicyMetadata({ compatibility, extensionPackage }),
  );
}

function checkDocsChangedWithContract(errors, changedFiles) {
  const contractChanged = changedFiles.some((file) =>
    COMPATIBILITY_CONTRACT_FILES.some(
      (cf) => file === cf || file.startsWith(cf),
    ),
  );
  if (!contractChanged) return;

  const docsChanged = changedFiles.some((file) =>
    DOCS_FILES.some((df) => file === df),
  );
  if (!docsChanged) {
    errors.push(
      "compatibility.yaml changed but no matching docs update found. " +
        "When the compatibility contract changes, update at least one of: " +
        DOCS_FILES.join(", "),
    );
  }
}

export function validateCompatibilityContract(options = {}) {
  const errors = [];
  const changedFiles = detectChangedFiles(options);

  checkContractExists(errors);
  checkCompatibilityYamlReferences(errors);
  checkProductVersionAlignment(errors);
  checkEmbeddedExtensionCompatibilityMatrix(errors);
  checkStudioConsumesPublishedPackage(errors);
  checkLocalProtocolSchemasAbsent(errors);
  checkRuntimePolicyMetadata(errors, options);
  if (fileExists("compatibility.yaml")) {
    const compatibility = parseYaml(readFile("compatibility.yaml"));
    errors.push(
      ...validateKiCadPatchBaseline({ compatibility }),
      ...validateCompatibilityAxes({
        compatibility,
        publishedArtifacts: options.publishedArtifacts ?? {
          mcpServerVersion: process.env.KICAD_MCP_PRO_PUBLISHED_VERSION,
          boardReadyOpsVersion: process.env.BOARDREADYOPS_PUBLISHED_VERSION,
        },
      }),
      ...validateMcpProtocolActivation({
        compatibility,
        repoRoot: REPO_ROOT,
      }),
      ...validateKiCad11Readiness({ compatibility, repoRoot: REPO_ROOT }),
    );
  }
  checkDocsChangedWithContract(errors, changedFiles);

  return errors;
}

function parseCliArgs(argv) {
  const options = { changedFiles: [] };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--base") {
      options.baseSha = argv[++index];
    } else if (arg === "--head") {
      options.headSha = argv[++index];
    } else if (arg === "--event") {
      options.eventName = argv[++index];
    } else if (arg === "--before") {
      options.before = argv[++index];
    } else if (arg === "--sha") {
      options.sha = argv[++index];
    } else if (arg === "--files") {
      while (argv[index + 1] && !argv[index + 1].startsWith("--")) {
        options.changedFiles.push(argv[++index]);
      }
    } else {
      options.changedFiles.push(arg);
    }
  }
  return options;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseCliArgs(process.argv.slice(2));
  const errors = validateCompatibilityContract(options);
  if (errors.length > 0) {
    console.error("Compatibility contract validation failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
  }
}
