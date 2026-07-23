import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_ROOT, "../..");
export const RETIRED_DEPENDENCY_POLICY_PATH =
  ".github/retired-dependency-manifests.json";

function normalizedRelativePath(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//u, "");
  if (
    path.posix.isAbsolute(normalized) ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    return null;
  }
  return path.posix.normalize(normalized);
}

function readPolicy(root) {
  return JSON.parse(
    fs.readFileSync(path.join(root, RETIRED_DEPENDENCY_POLICY_PATH), "utf8"),
  );
}

export function loadRetiredDependencyPolicy(root = REPO_ROOT) {
  return readPolicy(root);
}

function validateManifestEntry(entry, index) {
  const errors = [];
  const label = `retired dependency manifest #${index + 1}`;
  const manifestPath = normalizedRelativePath(entry?.path);
  const directory = normalizedRelativePath(entry?.directory);
  if (!manifestPath) errors.push(`${label} path must be a safe relative path`);
  if (!directory)
    errors.push(`${label} directory must be a safe relative path`);
  if (manifestPath && directory && !manifestPath.startsWith(`${directory}/`)) {
    errors.push(`${label} path must be contained by its retired directory`);
  }
  if (
    entry?.ownerDocumentation !== "https://oaslananka.github.io/kicad-mcp-pro/"
  ) {
    errors.push(
      `${label} ownerDocumentation must identify the external KiCad MCP Pro documentation`,
    );
  }
  if (!/^DGM_[A-Za-z0-9_-]+$/u.test(entry?.graphNodeId ?? "")) {
    errors.push(
      `${label} graphNodeId must be a DependencyGraphManifest node ID`,
    );
  }
  if (!/^[0-9a-f]{40}$/u.test(entry?.removalCommit ?? "")) {
    errors.push(`${label} removalCommit must be a full commit SHA`);
  }
  if (entry?.dismissalReason !== "not_used") {
    errors.push(`${label} dismissalReason must be not_used`);
  }
  if (
    !Array.isArray(entry?.allowedResidualDependencyCounts) ||
    entry.allowedResidualDependencyCounts.length !== 2 ||
    entry.allowedResidualDependencyCounts[0] !== 0 ||
    entry.allowedResidualDependencyCounts[1] !== 183
  ) {
    errors.push(
      `${label} allowedResidualDependencyCounts must remain [0, 183]`,
    );
  }
  if (entry?.residueDisposition !== "github-native-python-graph-residue") {
    errors.push(
      `${label} residueDisposition must identify the native Python graph residue`,
    );
  }
  return errors;
}

function validatePolicyHeader(value) {
  const errors = [];
  if (value?.schemaVersion !== 1) {
    errors.push("retired dependency policy schemaVersion must be 1");
  }
  if (value?.repository !== "oaslananka/kicad-studio-kit") {
    errors.push(
      "retired dependency policy repository must match this repository",
    );
  }
  return errors;
}

function validateRetiredPathState(root, entry, seenPaths) {
  const errors = [];
  const manifestPath = normalizedRelativePath(entry?.path);
  const directory = normalizedRelativePath(entry?.directory);
  if (manifestPath) {
    if (seenPaths.has(manifestPath)) {
      errors.push(
        `duplicate retired dependency manifest path: ${manifestPath}`,
      );
    }
    seenPaths.add(manifestPath);
    if (fs.existsSync(path.join(root, manifestPath))) {
      errors.push(
        `${manifestPath} is retired and must not exist in this repository`,
      );
    }
  }
  if (directory && fs.existsSync(path.join(root, directory))) {
    errors.push(
      `${directory} is retired and must not exist in this repository`,
    );
  }
  return errors;
}

export function validateRetiredDependencyPolicy(
  root = REPO_ROOT,
  policy = null,
) {
  let value = policy;
  if (!value) {
    try {
      value = readPolicy(root);
    } catch (error) {
      return [
        `Missing or invalid ${RETIRED_DEPENDENCY_POLICY_PATH}: ${error.message}`,
      ];
    }
  }
  const errors = validatePolicyHeader(value);
  const manifests = Array.isArray(value?.manifests) ? value.manifests : [];
  if (manifests.length === 0) {
    errors.push("retired dependency policy must declare at least one manifest");
  }
  const seenPaths = new Set();
  for (const [index, entry] of manifests.entries()) {
    errors.push(
      ...validateManifestEntry(entry, index),
      ...validateRetiredPathState(root, entry, seenPaths),
    );
  }
  return errors;
}

function graphStatus(graphManifest, dependencyCount, allowedCounts) {
  if (!graphManifest) return "absent";
  if (dependencyCount === 0) return "empty-residue";
  if (allowedCounts.includes(dependencyCount)) return "frozen-residue";
  return "unexpected";
}

function manifestReport(entry, presentPaths, graphManifests, openAlerts) {
  const graphManifest = graphManifests.find(
    (manifest) => manifest?.filename === entry.path,
  );
  const dependencyCount = Number(graphManifest?.dependenciesCount ?? 0);
  const openAlertCount = openAlerts.filter(
    (alert) => alert?.manifestPath === entry.path,
  ).length;
  const treePresent =
    presentPaths.includes(entry.path) || presentPaths.includes(entry.directory);
  const differences = [];
  if (treePresent) {
    differences.push(`${entry.path} is present in the repository tree`);
  }
  if (
    graphManifest &&
    !entry.allowedResidualDependencyCounts.includes(dependencyCount)
  ) {
    differences.push(
      `${entry.path} has ${dependencyCount} dependency-graph dependencies; expected one of ${entry.allowedResidualDependencyCounts.join(", ")}`,
    );
  }
  if (openAlertCount > 0) {
    differences.push(
      `${entry.path} has ${openAlertCount} open Dependabot alert(s) while retired`,
    );
  }
  return {
    path: entry.path,
    directory: entry.directory,
    ownerDocumentation: entry.ownerDocumentation,
    graphNodeId: entry.graphNodeId,
    removalCommit: entry.removalCommit,
    dismissalReason: entry.dismissalReason,
    residueDisposition: entry.residueDisposition,
    allowedResidualDependencyCounts: entry.allowedResidualDependencyCounts,
    treeStatus: treePresent ? "present" : "absent",
    graphStatus: graphStatus(
      graphManifest,
      dependencyCount,
      entry.allowedResidualDependencyCounts,
    ),
    graphDependencyCount: dependencyCount,
    openAlertCount,
    status: differences.length === 0 ? "current" : "drift",
    differences,
  };
}

export function buildRetiredDependencyEvidenceReport({
  policy,
  presentPaths = [],
  graphManifests = [],
  openAlerts = [],
  generatedAt = new Date().toISOString(),
}) {
  const manifests = policy.manifests.map((entry) =>
    manifestReport(entry, presentPaths, graphManifests, openAlerts),
  );
  const status = manifests.every((manifest) => manifest.status === "current")
    ? "current"
    : "drift";
  return {
    schemaVersion: 1,
    generatedAt,
    repository: policy.repository,
    status,
    exitCode: status === "current" ? 0 : 1,
    manifests,
  };
}

function unavailableManifestReport(entry, presentPaths, reason) {
  const treePresent =
    presentPaths.includes(entry.path) || presentPaths.includes(entry.directory);
  const differences = [
    `Live dependency evidence unavailable: ${String(reason).slice(0, 300)}`,
  ];
  if (treePresent) {
    differences.unshift(`${entry.path} is present in the repository tree`);
  }
  return {
    path: entry.path,
    directory: entry.directory,
    ownerDocumentation: entry.ownerDocumentation,
    graphNodeId: entry.graphNodeId,
    removalCommit: entry.removalCommit,
    dismissalReason: entry.dismissalReason,
    residueDisposition: entry.residueDisposition,
    allowedResidualDependencyCounts: entry.allowedResidualDependencyCounts,
    treeStatus: treePresent ? "present" : "absent",
    graphStatus: "unavailable",
    graphDependencyCount: null,
    openAlertCount: null,
    status: "unavailable",
    differences,
  };
}

export function buildUnavailableRetiredDependencyEvidenceReport({
  policy,
  presentPaths = [],
  reason,
  generatedAt = new Date().toISOString(),
}) {
  return {
    schemaVersion: 1,
    generatedAt,
    repository: policy.repository,
    status: "unavailable",
    exitCode: 1,
    manifests: policy.manifests.map((entry) =>
      unavailableManifestReport(entry, presentPaths, reason),
    ),
  };
}

function displayEvidenceValue(value) {
  return value === null || value === undefined ? "unavailable" : String(value);
}

function escapeTable(value) {
  return String(value)
    .replaceAll("|", String.raw`\|`)
    .replaceAll("\n", " ");
}

export function renderRetiredDependencyEvidenceMarkdown(report) {
  const lines = [
    "# Retired Dependency Evidence",
    "",
    `Overall status: **${report.status}**`,
    "",
    "| Manifest | Tree | Dependency graph | Open alerts | Status |",
    "| --- | --- | --- | ---: | --- |",
  ];
  for (const manifest of report.manifests) {
    lines.push(
      `| ${escapeTable(manifest.path)} | ${manifest.treeStatus} | ${manifest.graphStatus} (${displayEvidenceValue(manifest.graphDependencyCount)}) | ${displayEvidenceValue(manifest.openAlertCount)} | ${manifest.status} |`,
    );
    for (const difference of manifest.differences) {
      lines.push(`- ${difference}`);
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}
