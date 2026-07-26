import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export const REQUIRED_READINESS_DIMENSIONS = [
  "cli",
  "ipc",
  "vscodeUx",
  "mcpIntegration",
  "tests",
  "docs",
];

const READINESS_STATES = new Set(["complete", "ready-for-canary", "blocked"]);
const UPSTREAM_STATES = new Set(["nightly", "release-candidate", "stable"]);
const OVERALL_STATES = new Set(["blocked", "ready", "promoted"]);
const PROMOTION_STATES = new Set(["blocked", "ready", "promoted"]);
const SNAPSHOT_STATES = new Set(["pending", "captured", "verified"]);
const CHECKLIST_STATES = new Set(["pending", "complete"]);

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function addMissingString(errors, value, label) {
  if (!nonEmptyString(value))
    errors.push(`${label} must be a non-empty string`);
}

function validateEvidenceEntry({ entry, label, repoRoot, errors }) {
  if (!nonEmptyString(entry)) {
    errors.push(`${label} must contain non-empty evidence entries`);
    return;
  }
  if (entry.startsWith("path:")) {
    const relativePath = entry.slice("path:".length);
    const resolvedRoot = path.resolve(repoRoot);
    const resolvedPath = path.resolve(resolvedRoot, relativePath);
    if (
      resolvedPath !== resolvedRoot &&
      !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)
    ) {
      errors.push(`${label} references a path outside the repository`);
      return;
    }
    if (!relativePath || !fs.existsSync(resolvedPath)) {
      errors.push(`${label} references missing path ${relativePath}`);
    }
    return;
  }
  if (entry.startsWith("source:https://")) return;
  if (entry.startsWith("command:")) return;
  if (entry.startsWith("policy:kicadIpcReadiness.")) return;
  errors.push(`${label} contains unsupported evidence entry ${entry}`);
}

function validateEvidence({ evidence, label, repoRoot, errors }) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    errors.push(`${label} must contain at least one evidence entry`);
    return;
  }
  for (const entry of evidence) {
    validateEvidenceEntry({ entry, label, repoRoot, errors });
  }
}

function validateDimension({ key, dimension, repoRoot, errors }) {
  const label = `kicadIpcReadiness.dashboard.dimensions.${key}`;
  if (!dimension || typeof dimension !== "object") {
    errors.push(`${label} is required`);
    return;
  }
  addMissingString(errors, dimension.label, `${label}.label`);
  addMissingString(errors, dimension.owner, `${label}.owner`);
  addMissingString(errors, dimension.summary, `${label}.summary`);
  if (!READINESS_STATES.has(dimension.status)) {
    errors.push(
      `${label}.status must be complete, ready-for-canary, or blocked`,
    );
  }
  if (dimension.status !== "complete" && !nonEmptyString(dimension.blocker)) {
    errors.push(`${label}.blocker is required for incomplete readiness states`);
  }
  validateEvidence({
    evidence: dimension.evidence,
    label: `${label}.evidence`,
    repoRoot,
    errors,
  });
}

function validateDimensions({ dimensions, repoRoot, errors }) {
  if (!dimensions || typeof dimensions !== "object") {
    errors.push("kicadIpcReadiness.dashboard.dimensions is required");
    return;
  }
  for (const key of REQUIRED_READINESS_DIMENSIONS) {
    validateDimension({ key, dimension: dimensions[key], repoRoot, errors });
  }
  for (const key of Object.keys(dimensions)) {
    if (!REQUIRED_READINESS_DIMENSIONS.includes(key)) {
      errors.push(
        `kicadIpcReadiness.dashboard.dimensions.${key} is not supported`,
      );
    }
  }
}

function validateSwigGuard({ swigGuard, repoRoot, errors }) {
  const label = "kicadIpcReadiness.dashboard.swigGuard";
  if (!swigGuard || typeof swigGuard !== "object") {
    errors.push(`${label} is required`);
    return;
  }
  if (swigGuard.status !== "complete") {
    errors.push(`${label}.status must be complete`);
  }
  addMissingString(errors, swigGuard.owner, `${label}.owner`);
  addMissingString(errors, swigGuard.statement, `${label}.statement`);
  validateEvidence({
    evidence: swigGuard.evidence,
    label: `${label}.evidence`,
    repoRoot,
    errors,
  });
  const evidence = Array.isArray(swigGuard.evidence) ? swigGuard.evidence : [];
  if (
    !evidence.includes("policy:kicadIpcReadiness.directPcbnewImports") ||
    !evidence.includes(
      "source:https://dev-docs.kicad.org/en/apis-and-binding/pcbnew/",
    )
  ) {
    errors.push(
      `${label}.evidence must include the direct-import policy and official KiCad deprecation source`,
    );
  }
}

function validateSnapshots({ snapshots, errors }) {
  const label = "kicadIpcReadiness.dashboard.requiredSnapshots";
  if (!Array.isArray(snapshots) || snapshots.length < 5) {
    errors.push(`${label} must define at least five critical CLI snapshots`);
    return;
  }
  const ids = new Set();
  for (const snapshot of snapshots) {
    const itemLabel = `${label}.${String(snapshot?.id)}`;
    addMissingString(errors, snapshot?.id, `${itemLabel}.id`);
    addMissingString(errors, snapshot?.probe, `${itemLabel}.probe`);
    addMissingString(errors, snapshot?.artifact, `${itemLabel}.artifact`);
    addMissingString(errors, snapshot?.purpose, `${itemLabel}.purpose`);
    if (!SNAPSHOT_STATES.has(snapshot?.status)) {
      errors.push(`${itemLabel}.status must be pending, captured, or verified`);
    }
    if (ids.has(snapshot?.id)) errors.push(`${itemLabel}.id must be unique`);
    ids.add(snapshot?.id);
  }
}

function validateChecklist({ checklist, errors }) {
  const label = "kicadIpcReadiness.dashboard.sameDayChecklist";
  if (!Array.isArray(checklist) || checklist.length < 8) {
    errors.push(`${label} must define at least eight release-day checks`);
    return;
  }
  const ids = new Set();
  for (const item of checklist) {
    const itemLabel = `${label}.${String(item?.id)}`;
    addMissingString(errors, item?.id, `${itemLabel}.id`);
    addMissingString(errors, item?.owner, `${itemLabel}.owner`);
    addMissingString(errors, item?.action, `${itemLabel}.action`);
    if (!CHECKLIST_STATES.has(item?.status)) {
      errors.push(`${itemLabel}.status must be pending or complete`);
    }
    if (ids.has(item?.id)) errors.push(`${itemLabel}.id must be unique`);
    ids.add(item?.id);
  }
}

function validatePromotionEvidence({ dashboard, errors }) {
  if (dashboard.overall === "blocked") return;

  const incompleteDimensions = REQUIRED_READINESS_DIMENSIONS.filter(
    (key) => dashboard.dimensions?.[key]?.status !== "complete",
  );
  if (incompleteDimensions.length > 0) {
    errors.push(
      `KiCad 11 readiness cannot advance while dimensions remain incomplete: ${incompleteDimensions.join(", ")}`,
    );
  }

  const pendingSnapshots = Array.isArray(dashboard.requiredSnapshots)
    ? dashboard.requiredSnapshots.filter(
        (snapshot) => snapshot?.status !== "verified",
      )
    : [];
  if (pendingSnapshots.length > 0) {
    errors.push(
      `KiCad 11 readiness cannot advance while snapshots remain unverified: ${pendingSnapshots
        .map((snapshot) => snapshot?.id)
        .join(", ")}`,
    );
  }

  if (dashboard.promotionState !== "promoted") return;
  const pendingChecklist = Array.isArray(dashboard.sameDayChecklist)
    ? dashboard.sameDayChecklist.filter((item) => item?.status !== "complete")
    : [];
  if (pendingChecklist.length > 0) {
    errors.push(
      `KiCad 11 promotion requires the same-day checklist to be complete: ${pendingChecklist
        .map((item) => item?.id)
        .join(", ")}`,
    );
  }
}

function validateDashboardHeader({
  dashboard,
  compatibility,
  repoRoot,
  errors,
}) {
  if (!dashboard || typeof dashboard !== "object") {
    errors.push("kicadIpcReadiness.dashboard is required");
    return;
  }
  if (!OVERALL_STATES.has(dashboard.overall)) {
    errors.push(
      "kicadIpcReadiness.dashboard.overall must be blocked, ready, or promoted",
    );
  }
  if (!UPSTREAM_STATES.has(dashboard.upstreamState)) {
    errors.push(
      "kicadIpcReadiness.dashboard.upstreamState must be nightly, release-candidate, or stable",
    );
  }
  validateEvidence({
    evidence: dashboard.upstreamEvidence,
    label: "kicadIpcReadiness.dashboard.upstreamEvidence",
    repoRoot,
    errors,
  });
  if (!PROMOTION_STATES.has(dashboard.promotionState)) {
    errors.push(
      "kicadIpcReadiness.dashboard.promotionState must be blocked, ready, or promoted",
    );
  }
  if (
    dashboard.upstreamState === "nightly" &&
    (dashboard.overall !== "blocked" || dashboard.promotionState !== "blocked")
  ) {
    errors.push(
      "KiCad 11 nightly upstream state requires overall and promotionState to remain blocked",
    );
  }
  if (dashboard.overall !== dashboard.promotionState) {
    errors.push(
      "kicadIpcReadiness.dashboard.overall and promotionState must remain aligned",
    );
  }
  if (
    dashboard.promotionState === "promoted" &&
    dashboard.upstreamState !== "stable"
  ) {
    errors.push("KiCad 11 promotion requires the upstream state to be stable");
  }
  if (dashboard.stableBaseline !== compatibility?.kicad?.latestVerified) {
    errors.push(
      "kicadIpcReadiness.dashboard.stableBaseline must match kicad.latestVerified",
    );
  }
  if (dashboard.targetRange !== "11.0.x") {
    errors.push("kicadIpcReadiness.dashboard.targetRange must remain 11.0.x");
  }
  if (dashboard.overall === "promoted") {
    if (nonEmptyString(dashboard.blocker)) {
      errors.push(
        "kicadIpcReadiness.dashboard.blocker must be absent after KiCad 11 is promoted",
      );
    }
  } else {
    addMissingString(
      errors,
      dashboard.blocker,
      "kicadIpcReadiness.dashboard.blocker",
    );
  }
  addMissingString(
    errors,
    dashboard.issue,
    "kicadIpcReadiness.dashboard.issue",
  );
}

export function validateKiCad11Readiness({
  compatibility,
  repoRoot = DEFAULT_REPO_ROOT,
} = {}) {
  const errors = [];
  const readiness = compatibility?.kicadIpcReadiness;
  if (!readiness || typeof readiness !== "object") {
    return ["kicadIpcReadiness is required"];
  }
  const dashboard = readiness.dashboard;
  validateDashboardHeader({ dashboard, compatibility, repoRoot, errors });
  if (!dashboard || typeof dashboard !== "object") return errors;
  validateDimensions({ dimensions: dashboard.dimensions, repoRoot, errors });
  validateSwigGuard({ swigGuard: dashboard.swigGuard, repoRoot, errors });
  validateSnapshots({ snapshots: dashboard.requiredSnapshots, errors });
  validateChecklist({ checklist: dashboard.sameDayChecklist, errors });
  validatePromotionEvidence({ dashboard, errors });
  if (
    readiness.directPcbnewImports?.policy !== "forbidden-in-production" ||
    !Array.isArray(readiness.directPcbnewImports?.allowedPaths) ||
    readiness.directPcbnewImports.allowedPaths.length !== 0
  ) {
    errors.push(
      "kicadIpcReadiness.directPcbnewImports must forbid production use with an empty allowlist",
    );
  }
  return errors;
}

function escapeCell(value) {
  return String(value ?? "")
    .replace(/\\/gu, "\\\\")
    .replace(/\r?\n/gu, " ")
    .replace(/\|/gu, "\\|");
}

function renderTable(headers, rows) {
  return [
    `| ${headers.map(escapeCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
  ].join("\n");
}

function renderEvidenceEntry(entry) {
  if (entry.startsWith("source:")) {
    const url = entry.slice("source:".length);
    return `[official source](${url})`;
  }
  if (entry.startsWith("command:")) {
    return `\`${entry.slice("command:".length)}\``;
  }
  if (entry.startsWith("policy:")) {
    return `\`${entry.slice("policy:".length)}\``;
  }
  if (entry.startsWith("path:docs/compatibility/")) {
    return `[\`${entry.slice("path:".length)}\`](./${entry.slice("path:docs/compatibility/".length)})`;
  }
  if (entry.startsWith("path:docs/")) {
    return `[\`${entry.slice("path:".length)}\`](../${entry.slice("path:docs/".length)})`;
  }
  return `\`${entry.slice("path:".length)}\``;
}

function renderEvidence(evidence) {
  return evidence.map(renderEvidenceEntry).join("; ");
}

export function renderKiCad11ReadinessDashboard(compatibility) {
  const readiness = compatibility.kicadIpcReadiness;
  const dashboard = readiness.dashboard;
  const dimensionRows = REQUIRED_READINESS_DIMENSIONS.map((key) => {
    const dimension = dashboard.dimensions[key];
    return [
      dimension.label,
      `\`${dimension.status}\``,
      dimension.owner,
      dimension.summary,
      renderEvidence(dimension.evidence),
      dimension.blocker ?? "—",
    ];
  });
  const snapshotRows = dashboard.requiredSnapshots.map((snapshot) => [
    snapshot.id,
    `\`${snapshot.probe}\``,
    `\`${snapshot.artifact}\``,
    `\`${snapshot.status}\``,
    snapshot.purpose,
  ]);
  const blockerText =
    dashboard.blocker ?? "None — all promotion gates are complete.";
  const checklistRows = dashboard.sameDayChecklist.map((item, index) => [
    String(index + 1),
    item.id,
    item.owner,
    `\`${item.status}\``,
    item.action,
  ]);

  return `---
search: false
---

# KiCad 11 Readiness Dashboard

Machine-maintained from \`compatibility.yaml.kicadIpcReadiness\`. Refresh with
\`corepack pnpm run docs:generate\`.

KiCad ${dashboard.stableBaseline} remains primary and release-blocking. This
page tracks preparation for ${dashboard.targetRange}; it does not claim KiCad 11
support before the official RC or stable canary and published-artifact gates pass.

## Current Gate

<!-- prettier-ignore -->
${renderTable(
  ["Item", "State"],
  [
    ["Reviewed", `\`${readiness.reviewed}\``],
    ["Stable baseline", `\`${dashboard.stableBaseline}\``],
    ["Target line", `\`${dashboard.targetRange}\``],
    ["Upstream state", `\`${dashboard.upstreamState}\``],
    ["Overall readiness", `\`${dashboard.overall}\``],
    ["Promotion state", `\`${dashboard.promotionState}\``],
    ["Tracking issue", `[${dashboard.issue}](${dashboard.issue})`],
  ],
)}

**Current blocker:** ${blockerText}

Upstream evidence: ${renderEvidence(dashboard.upstreamEvidence)}.

## Readiness Dimensions

<!-- prettier-ignore -->
${renderTable(
  ["Area", "Status", "Owner", "Current result", "Evidence", "Blocker"],
  dimensionRows,
)}

## No production \`pcbnew\` / SWIG dependency

**Status:** \`${dashboard.swigGuard.status}\` — ${dashboard.swigGuard.statement}

Owner: ${dashboard.swigGuard.owner}. Evidence: ${renderEvidence(
    dashboard.swigGuard.evidence,
  )}.

The repository contract keeps \`directPcbnewImports.policy\` set to
\`forbidden-in-production\` with an empty allowlist. Native guard execution is
owned by KiCad MCP Pro; this extension repository keeps the claim visible and
release-reviewable.

## Critical CLI Snapshot Contract

The first KiCad 11 nightly/RC evidence bundle must retain these command outputs
so command-surface drift can be reviewed in the pull request rather than inferred
from a pass/fail badge.

<!-- prettier-ignore -->
${renderTable(
  ["Snapshot", "Canary probe", "Expected artifact", "Status", "Purpose"],
  snapshotRows,
)}

## Same-Day Stable Release Checklist

<!-- prettier-ignore -->
${renderTable(["Step", "ID", "Owner", "Status", "Action"], checklistRows)}

## Promotion Rule

KiCad 11 may move to a secondary or primary support line only after the official
RC or stable artifact is identified, the owning KiCad MCP Pro CLI/IPC canary and
this repository's cross-product gates pass, critical snapshots are attached, the
SWIG guard remains clean, and the support matrix plus changelog are updated in
the same reviewed change.
`;
}
