const ENFORCEMENT_VALUES = new Set(["report", "error"]);
const RUNTIMES = ["vscode", "python", "kicad"];
const SOURCE_KEYS = [
  "vscodeStable",
  "vscodeInsiders",
  "pythonReleases",
  "kicadDownloads",
];
const VERSION_PATTERN = /^(\d+)\.(\d+)(?:\.(\d+))?$/u;
const STRICT_VERSION_PATTERN = /^\d+\.\d+\.\d+$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const KICAD_PRIMARY_PATTERN = /^(\d+)\.(\d+)\.x$/u;
const KICAD_DOWNLOAD_VERSION_PATTERN = /\bkicad-(\d+\.\d+\.\d+)\b/giu;

function parseNumericVersion(value, label, segments = 2) {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a version string`);
  }
  const match = VERSION_PATTERN.exec(value);
  if (!match || (segments === 3 && match[3] === undefined)) {
    throw new Error(`${label} must be a numeric ${segments}-segment version`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3] ?? 0),
    value,
  };
}

function parseMinorVersion(value, label) {
  const parsed = parseNumericVersion(value, label, 2);
  return `${parsed.major}.${parsed.minor}`;
}

function compareVersions(left, right) {
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) return left[key] - right[key];
  }
  return 0;
}

function compareVersionsDescending(first, second) {
  return compareVersions(second, first);
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function validDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validateHttpsSource(errors, sources, key) {
  const value = sources?.[key];
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") throw new TypeError("not HTTPS");
  } catch {
    errors.push(
      `compatibility.yaml runtimePolicy.sources.${key} must be a valid HTTPS URL`,
    );
  }
}

function validatePolicyEnvelope(errors, policy) {
  if (!validDate(policy.reviewed)) {
    errors.push(
      "compatibility.yaml runtimePolicy.reviewed must be a valid YYYY-MM-DD date",
    );
  }
  for (const key of SOURCE_KEYS) {
    validateHttpsSource(errors, policy.sources, key);
  }
  for (const key of [...RUNTIMES, "sourceUnavailable"]) {
    if (!ENFORCEMENT_VALUES.has(policy.enforcement?.[key])) {
      errors.push(
        `compatibility.yaml runtimePolicy.enforcement.${key} must be report or error`,
      );
    }
  }
}

function validatePolicyThresholds(errors, policy) {
  if (!isNonNegativeInteger(policy.vscode?.maxMinimumMinorLag)) {
    errors.push(
      "compatibility.yaml runtimePolicy.vscode.maxMinimumMinorLag must be a non-negative integer",
    );
  }
  if (
    !isNonNegativeInteger(policy.python?.supportedMinorWindow) ||
    policy.python.supportedMinorWindow < 1
  ) {
    errors.push(
      "compatibility.yaml runtimePolicy.python.supportedMinorWindow must be a positive integer",
    );
  }
  if (!isNonNegativeInteger(policy.kicad?.primaryMajorLag)) {
    errors.push(
      "compatibility.yaml runtimePolicy.kicad.primaryMajorLag must be a non-negative integer",
    );
  }
}

function appendVersionError(errors, value, label, segments) {
  try {
    parseNumericVersion(value, label, segments);
  } catch (error) {
    errors.push(`compatibility.yaml ${error.message}`);
  }
}

function validateVsCodeMetadata(errors, compatibility, extensionPackage) {
  appendVersionError(
    errors,
    compatibility?.vscode?.minimum,
    "vscode.minimum",
    3,
  );
  if (
    compatibility?.vscode?.enginesRange !== extensionPackage?.engines?.vscode
  ) {
    errors.push(
      `apps/vscode-extension/package.json engines.vscode (${String(extensionPackage?.engines?.vscode)}) must match compatibility.yaml vscode.enginesRange (${String(compatibility?.vscode?.enginesRange)})`,
    );
  }
}

function normalizePythonSupported(errors, supportedPython) {
  if (!Array.isArray(supportedPython) || supportedPython.length === 0) {
    errors.push(
      "compatibility.yaml python.supported must be a non-empty array",
    );
    return [];
  }
  const normalized = [];
  for (const value of supportedPython) {
    try {
      normalized.push(parseMinorVersion(value, "python.supported entry"));
    } catch (error) {
      errors.push(`compatibility.yaml ${error.message}`);
    }
  }
  return normalized;
}

function validatePythonWindowSize(errors, normalized, window) {
  if (isNonNegativeInteger(window) && normalized.length !== window) {
    errors.push(
      `compatibility.yaml python.supported must contain exactly runtimePolicy.python.supportedMinorWindow (${window}) entries`,
    );
  }
}

function validatePythonRangeAndPrimary(errors, compatibility, normalized) {
  if (normalized.length === 0) return;
  const expectedRange = `>=${normalized[0]}`;
  if (compatibility.python?.range !== expectedRange) {
    errors.push(
      `compatibility.yaml python.range must start at the first supported minor (${expectedRange})`,
    );
  }
  if (compatibility.python?.primary !== normalized[0]) {
    errors.push(
      `compatibility.yaml python.primary must equal the first supported minor (${normalized[0]})`,
    );
  }
}

function pythonMinorsAreContiguous(normalized) {
  for (let index = 1; index < normalized.length; index++) {
    const previous = parseNumericVersion(
      normalized[index - 1],
      "python.supported",
      2,
    );
    const current = parseNumericVersion(
      normalized[index],
      "python.supported",
      2,
    );
    if (
      current.major !== previous.major ||
      current.minor !== previous.minor + 1
    ) {
      return false;
    }
  }
  return true;
}

function validatePythonMetadata(errors, compatibility, policy) {
  const normalized = normalizePythonSupported(
    errors,
    compatibility?.python?.supported,
  );
  validatePythonWindowSize(
    errors,
    normalized,
    policy.python?.supportedMinorWindow,
  );
  validatePythonRangeAndPrimary(errors, compatibility, normalized);
  if (normalized.length > 0 && !pythonMinorsAreContiguous(normalized)) {
    errors.push(
      "compatibility.yaml python.supported minors must be contiguous and ascending",
    );
  }
}

function validateKiCadMetadata(errors, compatibility) {
  if (!KICAD_PRIMARY_PATTERN.test(compatibility?.kicad?.primary ?? "")) {
    errors.push(
      "compatibility.yaml kicad.primary must use a major.minor.x range",
    );
  }
  appendVersionError(
    errors,
    compatibility?.kicad?.latestVerified,
    "kicad.latestVerified",
    3,
  );
}

export function validateRuntimePolicyMetadata({
  compatibility,
  extensionPackage,
} = {}) {
  const policy = compatibility?.runtimePolicy;
  if (!policy || typeof policy !== "object") {
    return ["compatibility.yaml: missing runtimePolicy object"];
  }

  const errors = [];
  validatePolicyEnvelope(errors, policy);
  validatePolicyThresholds(errors, policy);
  validateVsCodeMetadata(errors, compatibility, extensionPackage);
  validatePythonMetadata(errors, compatibility, policy);
  validateKiCadMetadata(errors, compatibility);
  return errors;
}

export function parseVsCodeStableRelease(payload) {
  if (!Array.isArray(payload)) {
    throw new TypeError("VS Code stable release source must be an array");
  }
  const versions = payload
    .filter(
      (value) =>
        typeof value === "string" && STRICT_VERSION_PATTERN.test(value),
    )
    .map((value) => parseNumericVersion(value, "VS Code stable release", 3));
  if (versions.length === 0) {
    throw new Error("VS Code stable release source returned no versions");
  }
  versions.sort(compareVersionsDescending);
  return versions[0].value;
}

export function parsePythonBugfixWindow(payload) {
  const metadata = payload?.metadata;
  if (!metadata || typeof metadata !== "object") {
    throw new TypeError("Python release source must contain metadata");
  }
  const versions = Object.entries(metadata)
    .filter(([, value]) => value?.status === "bugfix")
    .map(([version]) => parseNumericVersion(version, "Python release", 2))
    .sort(compareVersions)
    .map(({ major, minor }) => `${major}.${minor}`);
  if (versions.length === 0) {
    throw new Error("Python release source returned no bugfix releases");
  }
  return versions;
}

export function parseKiCadStableRelease(html) {
  if (typeof html !== "string") {
    throw new TypeError("KiCad download source must be HTML text");
  }
  const matches = [...html.matchAll(KICAD_DOWNLOAD_VERSION_PATTERN)];
  if (matches.length === 0) {
    throw new Error("KiCad download source returned no stable release version");
  }
  const versions = matches.map((match) =>
    parseNumericVersion(match[1], "KiCad stable release", 3),
  );
  versions.sort(compareVersionsDescending);
  return versions[0].value;
}

function unknownRuntime(runtime, upstream, policy) {
  return {
    runtime,
    status: "unknown",
    enforcement: policy.enforcement.sourceUnavailable,
    message: `Source unavailable or malformed: ${upstream?.error ?? "unknown error"}`,
    details: {},
  };
}

function evaluateVsCode(compatibility, upstream) {
  const policy = compatibility.runtimePolicy;
  if (upstream?.status !== "available") {
    return unknownRuntime("vscode", upstream, policy);
  }
  const minimum = parseNumericVersion(
    compatibility.vscode.minimum,
    "vscode.minimum",
    3,
  );
  const stable = parseNumericVersion(upstream.version, "VS Code stable", 3);
  const majorLineChanged = stable.major !== minimum.major;
  const lag = majorLineChanged ? null : stable.minor - minimum.minor;
  const allowed = policy.vscode.maxMinimumMinorLag;
  const status = majorLineChanged || lag > allowed ? "drift" : "current";
  let message;
  if (status === "current") {
    message = `VS Code minimum ${minimum.value} is within ${allowed} minor(s) of stable ${stable.value}.`;
  } else if (majorLineChanged) {
    message = `VS Code stable ${stable.value} is on a different major line than minimum ${minimum.value}.`;
  } else {
    message = `VS Code minimum ${minimum.value} lag ${lag} exceeds ${allowed} against stable ${stable.value}.`;
  }
  return {
    runtime: "vscode",
    status,
    enforcement: policy.enforcement.vscode,
    message,
    details: {
      minimum: minimum.value,
      stable: stable.value,
      minorLag: lag,
      majorLineChanged,
    },
  };
}

function evaluatePython(compatibility, upstream) {
  const policy = compatibility.runtimePolicy;
  if (upstream?.status !== "available") {
    return unknownRuntime("python", upstream, policy);
  }
  const window = policy.python.supportedMinorWindow;
  const upstreamVersions = [...upstream.versions]
    .map((version) =>
      parseNumericVersion(version, "Python upstream version", 2),
    )
    .sort(compareVersions)
    .slice(-window)
    .map(({ major, minor }) => `${major}.${minor}`);
  const declared = compatibility.python.supported;
  const status =
    JSON.stringify(declared) === JSON.stringify(upstreamVersions)
      ? "current"
      : "drift";
  return {
    runtime: "python",
    status,
    enforcement: policy.enforcement.python,
    message:
      status === "current"
        ? `Python supported window matches bugfix releases ${upstreamVersions.join(", ")}.`
        : `Python supported window ${declared.join(", ")} differs from bugfix releases ${upstreamVersions.join(", ")}.`,
    details: { declared, upstream: upstreamVersions },
  };
}

function evaluateKiCad(compatibility, upstream) {
  const policy = compatibility.runtimePolicy;
  if (upstream?.status !== "available") {
    return unknownRuntime("kicad", upstream, policy);
  }
  const primaryMatch = KICAD_PRIMARY_PATTERN.exec(compatibility.kicad.primary);
  const primary = {
    major: Number(primaryMatch[1]),
    minor: Number(primaryMatch[2]),
  };
  const stable = parseNumericVersion(upstream.version, "KiCad stable", 3);
  const verified = parseNumericVersion(
    compatibility.kicad.latestVerified,
    "kicad.latestVerified",
    3,
  );
  const majorLag = stable.major - primary.major;
  const allowed = policy.kicad.primaryMajorLag;
  const status = majorLag > allowed ? "drift" : "current";
  const patchFreshness =
    compareVersions(verified, stable) < 0 ? "behind" : "current";
  return {
    runtime: "kicad",
    status,
    enforcement: policy.enforcement.kicad,
    message:
      status === "current"
        ? `KiCad primary ${compatibility.kicad.primary} matches stable major ${stable.major}; verified baseline ${verified.value} is ${patchFreshness} versus KiCad stable patch ${stable.value}.`
        : `KiCad primary ${compatibility.kicad.primary} major lag ${majorLag} exceeds ${allowed} against stable ${stable.value}; verified patch is ${verified.value}.`,
    details: {
      primary: compatibility.kicad.primary,
      stable: stable.value,
      latestVerified: verified.value,
      majorLag,
      patchFreshness,
    },
  };
}

function determineOverallStatus(runtimes) {
  if (runtimes.some(({ status }) => status === "unknown")) return "unknown";
  if (runtimes.some(({ status }) => status === "drift")) return "drift";
  return "current";
}

export function evaluateRuntimePolicy({ compatibility, upstream } = {}) {
  const runtimes = [
    evaluateVsCode(compatibility, upstream?.vscode),
    evaluatePython(compatibility, upstream?.python),
    evaluateKiCad(compatibility, upstream?.kicad),
  ];
  const exitCode = runtimes.some(
    ({ status, enforcement }) =>
      status !== "current" && enforcement === "error",
  )
    ? 1
    : 0;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: determineOverallStatus(runtimes),
    exitCode,
    runtimes,
  };
}

function label(runtime) {
  return { vscode: "VS Code", python: "Python", kicad: "KiCad" }[runtime];
}

export function renderRuntimePolicyMarkdown(report) {
  const escapedPipe = String.raw`\|`;
  const rows = report.runtimes
    .map(
      (item) =>
        `| ${label(item.runtime)} | ${item.status} | ${item.enforcement} | ${item.message.replaceAll("|", escapedPipe)} |`,
    )
    .join("\n");
  return `# Runtime Policy Drift Report

Overall status: **${report.status}**

| Runtime | Status | Enforcement | Evidence |
| --- | --- | --- | --- |
${rows}
`;
}
