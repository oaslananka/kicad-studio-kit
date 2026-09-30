import fs from "node:fs";
import path from "node:path";

const ACTIVATION_STATES = new Set(["blocked", "active"]);
const STATUS_PREFIX = "Status:";
const REGISTRY_NAME = "SUPPORTED_MCP_PROTOCOL_VERSIONS";
const REGISTRY_PATH =
  "apps/vscode-extension/src/mcp/protocol/protocolAdapterRegistry.ts";

function isStableSemver(value) {
  return typeof value === "string" && /^\d+\.\d+\.\d+$/u.test(value);
}

function isIsoDate(value) {
  return (
    typeof value === "string" && /^(?:19|20)\d{2}-\d{2}-\d{2}$/u.test(value)
  );
}

function sourceLines(source) {
  if (typeof source !== "string") return [];
  return source
    .split("\n")
    .map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
}

function readStatus(source) {
  const line = sourceLines(source).find((candidate) =>
    candidate.startsWith(STATUS_PREFIX),
  );
  const status = line?.slice(STATUS_PREFIX.length).trim();
  return status || undefined;
}

function readAdrIndexStatus(source) {
  for (const line of sourceLines(source)) {
    if (!line.startsWith("|")) continue;
    const row = line.endsWith("|") ? line.slice(1, -1) : line.slice(1);
    const cells = row.split("|").map((cell) => cell.trim());
    if (cells[0] === "0008") {
      return cells.at(-1) || undefined;
    }
  }
  return undefined;
}

function resolveRepositoryPath(errors, repoRoot, value, label, required) {
  if (value === null || value === undefined || value === "") {
    if (required) {
      errors.push(`${label} must reference an existing repository file`);
    }
    return undefined;
  }
  if (typeof value !== "string") {
    errors.push(`${label} must reference an existing repository file`);
    return undefined;
  }

  const root = path.resolve(repoRoot);
  const resolved = path.resolve(root, value);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    errors.push(`${label} must remain inside the repository`);
    return undefined;
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    errors.push(`${label} must reference an existing repository file`);
    return undefined;
  }
  return resolved;
}

function registrySupportsTarget(source, target) {
  if (typeof source !== "string" || typeof target !== "string") return false;
  const declaration = source.indexOf(REGISTRY_NAME);
  if (declaration < 0) return false;
  const openingBracket = source.indexOf("[", declaration);
  const closingBracket = source.indexOf("]", openingBracket);
  if (openingBracket < 0 || closingBracket < 0) return false;
  return source.slice(openingBracket + 1, closingBracket).includes(target);
}

function validatePublishedArtifact(
  errors,
  artifact,
  expected,
  label,
  required,
) {
  if (artifact === null || artifact === undefined) {
    if (required) {
      errors.push(
        `${label} evidence is required before MCP protocol activation`,
      );
    }
    return;
  }
  if (typeof artifact !== "object") {
    errors.push(`${label} evidence must be an object`);
    return;
  }
  if (artifact.package !== expected.package) {
    errors.push(`${label}.package must be ${expected.package}`);
  }
  if (!isStableSemver(artifact.version)) {
    errors.push(`${label}.version must be a stable major.minor.patch version`);
  }
  if (
    typeof artifact.source !== "string" ||
    !artifact.source.startsWith(expected.sourcePrefix)
  ) {
    errors.push(`${label}.source must reference ${expected.sourcePrefix}`);
  } else if (
    typeof artifact.version === "string" &&
    !artifact.source.includes(artifact.version)
  ) {
    errors.push(`${label}.source must identify the published artifact version`);
  }
}

function validateFinalSpecification(
  errors,
  finalSpecification,
  target,
  required,
) {
  if (finalSpecification === null || finalSpecification === undefined) {
    if (required) {
      errors.push(
        "mcp.activation.finalSpecification evidence is required before MCP protocol activation",
      );
    }
    return;
  }
  if (typeof finalSpecification !== "object") {
    errors.push("mcp.activation.finalSpecification evidence must be an object");
    return;
  }
  if (finalSpecification.version !== target) {
    errors.push(
      "mcp.activation.finalSpecification.version must match the target",
    );
  }
  const source = finalSpecification.source;
  const officialStableRelease =
    typeof source === "string" &&
    (source ===
      `https://github.com/modelcontextprotocol/modelcontextprotocol/releases/tag/${target}` ||
      source.startsWith(
        `https://modelcontextprotocol.io/specification/${target}`,
      ));
  if (!officialStableRelease || /(?:rc|draft)/iu.test(String(source))) {
    errors.push(
      "mcp.activation.finalSpecification.source must reference the official stable release",
    );
  }
}

function validateActivationHeader(errors, activation, root) {
  const target = activation.targetProtocolVersion;
  if (typeof target !== "string" || !target) {
    errors.push("mcp.activation.targetProtocolVersion is required");
  }
  if (!isIsoDate(activation.reviewed)) {
    errors.push("mcp.activation.reviewed must be an ISO date");
  }
  resolveRepositoryPath(
    errors,
    root,
    activation.evidenceNote,
    "mcp.activation.evidenceNote",
    true,
  );
  if (!ACTIVATION_STATES.has(activation.state)) {
    errors.push('mcp.activation.state must be "blocked" or "active"');
  }
  return target;
}

function resolveAdrStatus(errors, activation, root, adrSource, adrIndexSource) {
  const adrPath = resolveRepositoryPath(
    errors,
    root,
    activation.adr?.path,
    "mcp.activation.adr.path",
    true,
  );
  const resolvedAdrSource =
    adrSource ?? (adrPath ? fs.readFileSync(adrPath, "utf8") : "");
  const indexPath = path.join(root, "docs/adr/README.md");
  const resolvedIndexSource =
    adrIndexSource ??
    (fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : "");
  const declaredStatus = activation.adr?.status;

  if (declaredStatus !== readStatus(resolvedAdrSource)) {
    errors.push(
      `ADR 0008 file status must match mcp.activation.adr.status (${String(declaredStatus)})`,
    );
  }
  if (declaredStatus !== readAdrIndexStatus(resolvedIndexSource)) {
    errors.push(
      `ADR 0008 index status must match mcp.activation.adr.status (${String(declaredStatus)})`,
    );
  }
  return declaredStatus;
}

function resolveRegistrySource(root, registrySource) {
  if (registrySource) return registrySource;
  const registryPath = path.join(root, REGISTRY_PATH);
  return fs.existsSync(registryPath)
    ? fs.readFileSync(registryPath, "utf8")
    : "";
}

function validateBlockedFreshness(errors, activation, target, today) {
  if (!isIsoDate(target) || !isIsoDate(today) || today < target) {
    return;
  }
  if (!isIsoDate(activation.reviewed) || activation.reviewed < target) {
    errors.push(
      "mcp.activation.reviewed must be on or after the target protocol release date once that date is reached",
    );
  }
  if (
    activation.finalSpecification === null ||
    activation.finalSpecification === undefined
  ) {
    errors.push(
      "mcp.activation.finalSpecification is required after the target release date even while activation remains blocked",
    );
  }
}

function validateBlockedState(errors, context) {
  const { mcp, target, declaredAdrStatus, supportsTarget } = context;
  if (mcp.protocolVersion === target) {
    errors.push(
      "mcp.protocolVersion cannot select the target while mcp.activation.state is blocked",
    );
  }
  if (mcp.nextProtocolVersion !== target) {
    errors.push(
      "mcp.nextProtocolVersion must match the blocked activation target",
    );
  }
  if (declaredAdrStatus !== "Proposed") {
    errors.push("ADR 0008 must remain Proposed while activation is blocked");
  }
  if (supportsTarget) {
    errors.push(
      "blocked MCP target must not appear in the production supported-adapter registry",
    );
  }
}

function validateActiveState(errors, context) {
  const { mcp, target, declaredAdrStatus, supportsTarget } = context;
  if (mcp.protocolVersion !== target) {
    errors.push("active MCP activation target must equal mcp.protocolVersion");
  }
  if (mcp.nextProtocolVersion !== undefined) {
    errors.push(
      "mcp.nextProtocolVersion must be removed when the target protocol is active",
    );
  }
  if (declaredAdrStatus !== "Accepted") {
    errors.push("ADR 0008 must be Accepted when the target protocol is active");
  }
  if (!supportsTarget) {
    errors.push(
      "production supported-adapter registry must select the active target",
    );
  }
}

function validateExtensionAdapter(errors, activation, root, target, required) {
  const adapterPath = resolveRepositoryPath(
    errors,
    root,
    activation.extensionAdapter?.path,
    "mcp.activation.extensionAdapter.path",
    required,
  );
  if (!adapterPath) return;

  const adapterSource = fs.readFileSync(adapterPath, "utf8");
  if (
    !adapterSource.includes(target) ||
    !adapterSource.includes("stateless-discovery")
  ) {
    errors.push(
      "mcp.activation.extensionAdapter must implement the target stateless lifecycle",
    );
  }
}

function validateActivationEvidence(
  errors,
  activation,
  root,
  target,
  required,
) {
  validateFinalSpecification(
    errors,
    activation.finalSpecification,
    target,
    required,
  );
  validatePublishedArtifact(
    errors,
    activation.pythonSdk,
    { package: "mcp", sourcePrefix: "https://pypi.org/project/mcp/" },
    "mcp.activation.pythonSdk",
    required,
  );
  validatePublishedArtifact(
    errors,
    activation.protocolSchemas,
    {
      package: "@oaslananka/kicad-protocol-schemas",
      sourcePrefix:
        "https://www.npmjs.com/package/@oaslananka/kicad-protocol-schemas",
    },
    "mcp.activation.protocolSchemas",
    required,
  );
  validatePublishedArtifact(
    errors,
    activation.serverArtifact,
    {
      package: "kicad-mcp-pro",
      sourcePrefix: "https://pypi.org/project/kicad-mcp-pro/",
    },
    "mcp.activation.serverArtifact",
    required,
  );
  if (
    activation.serverArtifact &&
    activation.serverArtifact.protocolVersion !== target
  ) {
    errors.push(
      "mcp.activation.serverArtifact.protocolVersion must match the target",
    );
  }
  validateExtensionAdapter(errors, activation, root, target, required);
  resolveRepositoryPath(
    errors,
    root,
    activation.realPair?.evidence,
    "mcp.activation.realPair.evidence",
    required,
  );
}

export function validateMcpProtocolActivation({
  compatibility,
  repoRoot,
  registrySource = "",
  adrSource,
  adrIndexSource,
  today = new Date().toISOString().slice(0, 10),
} = {}) {
  const mcp = compatibility?.mcp;
  const activation = mcp?.activation;
  if (!mcp || !activation) {
    return [
      "compatibility.yaml mcp.activation must define the final protocol activation gate",
    ];
  }

  const errors = [];
  const root = repoRoot ? path.resolve(repoRoot) : process.cwd();
  const target = validateActivationHeader(errors, activation, root);
  const declaredAdrStatus = resolveAdrStatus(
    errors,
    activation,
    root,
    adrSource,
    adrIndexSource,
  );
  const supportsTarget = registrySupportsTarget(
    resolveRegistrySource(root, registrySource),
    target,
  );
  const stateContext = { mcp, target, declaredAdrStatus, supportsTarget };

  if (activation.state === "blocked") {
    validateBlockedState(errors, stateContext);
    validateBlockedFreshness(errors, activation, target, today);
  } else if (activation.state === "active") {
    validateActiveState(errors, stateContext);
  }
  validateActivationEvidence(
    errors,
    activation,
    root,
    target,
    activation.state === "active",
  );
  return errors;
}
