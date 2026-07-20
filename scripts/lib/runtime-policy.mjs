const ENFORCEMENT_VALUES = new Set(["report", "error"]);
const RUNTIMES = ["vscode", "python", "kicad"];

function parseNumericVersion(value, label, segments = 2) {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a version string`);
  }
  const match = value.match(/^(\d+)\.(\d+)(?:\.(\d+))?$/u);
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

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function validateHttpsSource(errors, sources, key) {
  const value = sources?.[key];
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") throw new Error("not HTTPS");
  } catch {
    errors.push(
      `compatibility.yaml runtimePolicy.sources.${key} must be a valid HTTPS URL`,
    );
  }
}

export function validateRuntimePolicyMetadata({
  compatibility,
  extensionPackage,
} = {}) {
  const errors = [];
  const policy = compatibility?.runtimePolicy;
  if (!policy || typeof policy !== "object") {
    return ["compatibility.yaml: missing runtimePolicy object"];
  }

  if (!validDate(policy.reviewed)) {
    errors.push(
      "compatibility.yaml runtimePolicy.reviewed must be a valid YYYY-MM-DD date",
    );
  }

  for (const key of [
    "vscodeStable",
    "vscodeInsiders",
    "pythonReleases",
    "kicadDownloads",
  ]) {
    validateHttpsSource(errors, policy.sources, key);
  }

  for (const key of [...RUNTIMES, "sourceUnavailable"]) {
    if (!ENFORCEMENT_VALUES.has(policy.enforcement?.[key])) {
      errors.push(
        `compatibility.yaml runtimePolicy.enforcement.${key} must be report or error`,
      );
    }
  }

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

  try {
    parseNumericVersion(compatibility?.vscode?.minimum, "vscode.minimum", 3);
  } catch (error) {
    errors.push(`compatibility.yaml ${error.message}`);
  }
  if (
    compatibility?.vscode?.enginesRange !== extensionPackage?.engines?.vscode
  ) {
    errors.push(
      `apps/vscode-extension/package.json engines.vscode (${String(extensionPackage?.engines?.vscode)}) must match compatibility.yaml vscode.enginesRange (${String(compatibility?.vscode?.enginesRange)})`,
    );
  }

  const supportedPython = compatibility?.python?.supported;
  if (!Array.isArray(supportedPython) || supportedPython.length === 0) {
    errors.push(
      "compatibility.yaml python.supported must be a non-empty array",
    );
  } else {
    const normalized = [];
    for (const value of supportedPython) {
      try {
        normalized.push(parseMinorVersion(value, "python.supported entry"));
      } catch (error) {
        errors.push(`compatibility.yaml ${error.message}`);
      }
    }
    if (
      isNonNegativeInteger(policy.python?.supportedMinorWindow) &&
      normalized.length !== policy.python.supportedMinorWindow
    ) {
      errors.push(
        `compatibility.yaml python.supported must contain exactly runtimePolicy.python.supportedMinorWindow (${policy.python.supportedMinorWindow}) entries`,
      );
    }
    if (normalized.length > 0) {
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
          errors.push(
            "compatibility.yaml python.supported minors must be contiguous and ascending",
          );
          break;
        }
      }
    }
  }

  if (!/^\d+\.\d+\.x$/u.test(compatibility?.kicad?.primary ?? "")) {
    errors.push(
      "compatibility.yaml kicad.primary must use a major.minor.x range",
    );
  }
  try {
    parseNumericVersion(
      compatibility?.kicad?.latestVerified,
      "kicad.latestVerified",
      3,
    );
  } catch (error) {
    errors.push(`compatibility.yaml ${error.message}`);
  }

  return errors;
}

export function parseVsCodeStableRelease(payload) {
  if (!Array.isArray(payload)) {
    throw new Error("VS Code stable release source must be an array");
  }
  const versions = payload.map((value) =>
    parseNumericVersion(value, "VS Code stable release", 3),
  );
  if (versions.length === 0) {
    throw new Error("VS Code stable release source returned no versions");
  }
  versions.sort((left, right) => compareVersions(right, left));
  return versions[0].value;
}

export function parsePythonBugfixWindow(payload) {
  const metadata = payload?.metadata;
  if (!metadata || typeof metadata !== "object") {
    throw new Error("Python release source must contain metadata");
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
    throw new Error("KiCad download source must be HTML text");
  }
  const matches = [...html.matchAll(/\bkicad-(\d+\.\d+\.\d+)\b/giu)];
  if (matches.length === 0) {
    throw new Error("KiCad download source returned no stable release version");
  }
  const versions = matches.map((match) =>
    parseNumericVersion(match[1], "KiCad stable release", 3),
  );
  versions.sort((left, right) => compareVersions(right, left));
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
  const lag =
    stable.major === minimum.major
      ? stable.minor - minimum.minor
      : Number.POSITIVE_INFINITY;
  const allowed = policy.vscode.maxMinimumMinorLag;
  const status = lag > allowed ? "drift" : "current";
  return {
    runtime: "vscode",
    status,
    enforcement: policy.enforcement.vscode,
    message:
      status === "current"
        ? `VS Code minimum ${minimum.value} is within ${allowed} minor(s) of stable ${stable.value}.`
        : `VS Code minimum ${minimum.value} lag ${String(lag)} exceeds ${allowed} against stable ${stable.value}.`,
    details: { minimum: minimum.value, stable: stable.value, minorLag: lag },
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
  const primaryMatch = compatibility.kicad.primary.match(/^(\d+)\.(\d+)\.x$/u);
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
        ? `KiCad primary ${compatibility.kicad.primary} matches stable major ${stable.major}; KiCad stable patch ${stable.value} is ${patchFreshness} versus verified ${verified.value}.`
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

export function evaluateRuntimePolicy({ compatibility, upstream } = {}) {
  const runtimes = [
    evaluateVsCode(compatibility, upstream?.vscode),
    evaluatePython(compatibility, upstream?.python),
    evaluateKiCad(compatibility, upstream?.kicad),
  ];
  const hasUnknown = runtimes.some(({ status }) => status === "unknown");
  const hasDrift = runtimes.some(({ status }) => status === "drift");
  const exitCode = runtimes.some(
    ({ status, enforcement }) =>
      status !== "current" && enforcement === "error",
  )
    ? 1
    : 0;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: hasUnknown ? "unknown" : hasDrift ? "drift" : "current",
    exitCode,
    runtimes,
  };
}

function label(runtime) {
  return { vscode: "VS Code", python: "Python", kicad: "KiCad" }[runtime];
}

export function renderRuntimePolicyMarkdown(report) {
  const rows = report.runtimes
    .map(
      (item) =>
        `| ${label(item.runtime)} | ${item.status} | ${item.enforcement} | ${item.message.replaceAll("|", "\\|")} |`,
    )
    .join("\n");
  return `# Runtime Policy Drift Report

Overall status: **${report.status}**

| Runtime | Status | Enforcement | Evidence |
| --- | --- | --- | --- |
${rows}
`;
}
