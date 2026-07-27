import fs from "node:fs";
import path from "node:path";

function isStableSemver(value) {
  return typeof value === "string" && /^\d+\.\d+\.\d+$/u.test(value);
}

function readStatus(source) {
  return source?.match(/^Status:\s*([^\r\n]+)$/mu)?.[1]?.trim();
}

function readAdrIndexStatus(source) {
  return source
    ?.match(/^\|\s*0008\s*\|[^\r\n]*\|\s*([^|]+?)\s*\|$/mu)?.[1]
    ?.trim();
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
  const body = source.match(
    /SUPPORTED_MCP_PROTOCOL_VERSIONS[\s\S]*?=\s*\[([\s\S]*?)\]/u,
  )?.[1];
  if (!body) return false;
  return [...body.matchAll(/["']([^"']+)["']/gu)].some(
    (match) => match[1] === target,
  );
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

export function validateMcpProtocolActivation({
  compatibility,
  repoRoot,
  registrySource = "",
  adrSource,
  adrIndexSource,
} = {}) {
  const errors = [];
  const root = repoRoot ? path.resolve(repoRoot) : process.cwd();
  const mcp = compatibility?.mcp;
  const activation = mcp?.activation;
  if (!mcp || !activation) {
    return [
      "compatibility.yaml mcp.activation must define the final protocol activation gate",
    ];
  }

  const target = activation.targetProtocolVersion;
  if (typeof target !== "string" || !target) {
    errors.push("mcp.activation.targetProtocolVersion is required");
  }
  if (
    !/^(?:19|20)\d{2}-\d{2}-\d{2}$/u.test(String(activation.reviewed ?? ""))
  ) {
    errors.push("mcp.activation.reviewed must be an ISO date");
  }
  resolveRepositoryPath(
    errors,
    root,
    activation.evidenceNote,
    "mcp.activation.evidenceNote",
    true,
  );

  const state = activation.state;
  if (state !== "blocked" && state !== "active") {
    errors.push('mcp.activation.state must be "blocked" or "active"');
  }
  const active = state === "active";

  const adrPath = activation.adr?.path;
  const resolvedAdrPath = resolveRepositoryPath(
    errors,
    root,
    adrPath,
    "mcp.activation.adr.path",
    true,
  );
  const resolvedAdrSource =
    adrSource ??
    (resolvedAdrPath ? fs.readFileSync(resolvedAdrPath, "utf8") : "");
  const indexPath = path.join(root, "docs/adr/README.md");
  const resolvedAdrIndexSource =
    adrIndexSource ??
    (fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : "");
  const declaredAdrStatus = activation.adr?.status;
  const fileAdrStatus = readStatus(resolvedAdrSource);
  const indexAdrStatus = readAdrIndexStatus(resolvedAdrIndexSource);
  if (declaredAdrStatus !== fileAdrStatus) {
    errors.push(
      `ADR 0008 file status must match mcp.activation.adr.status (${String(declaredAdrStatus)})`,
    );
  }
  if (declaredAdrStatus !== indexAdrStatus) {
    errors.push(
      `ADR 0008 index status must match mcp.activation.adr.status (${String(declaredAdrStatus)})`,
    );
  }

  const registryPath = path.join(
    root,
    "apps/vscode-extension/src/mcp/protocol/protocolAdapterRegistry.ts",
  );
  const resolvedRegistrySource =
    registrySource ||
    (fs.existsSync(registryPath) ? fs.readFileSync(registryPath, "utf8") : "");
  const supportsTarget = registrySupportsTarget(resolvedRegistrySource, target);
  if (state === "blocked") {
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
  } else if (state === "active") {
    if (mcp.protocolVersion !== target) {
      errors.push(
        "active MCP activation target must equal mcp.protocolVersion",
      );
    }
    if (mcp.nextProtocolVersion !== undefined) {
      errors.push(
        "mcp.nextProtocolVersion must be removed when the target protocol is active",
      );
    }
    if (declaredAdrStatus !== "Accepted") {
      errors.push(
        "ADR 0008 must be Accepted when the target protocol is active",
      );
    }
    if (!supportsTarget) {
      errors.push(
        "production supported-adapter registry must select the active target",
      );
    }
  }

  validateFinalSpecification(
    errors,
    activation.finalSpecification,
    target,
    active,
  );
  validatePublishedArtifact(
    errors,
    activation.pythonSdk,
    { package: "mcp", sourcePrefix: "https://pypi.org/project/mcp/" },
    "mcp.activation.pythonSdk",
    active,
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
    active,
  );
  validatePublishedArtifact(
    errors,
    activation.serverArtifact,
    {
      package: "kicad-mcp-pro",
      sourcePrefix: "https://pypi.org/project/kicad-mcp-pro/",
    },
    "mcp.activation.serverArtifact",
    active,
  );
  if (
    activation.serverArtifact &&
    activation.serverArtifact.protocolVersion !== target
  ) {
    errors.push(
      "mcp.activation.serverArtifact.protocolVersion must match the target",
    );
  }

  const adapterPath = resolveRepositoryPath(
    errors,
    root,
    activation.extensionAdapter?.path,
    "mcp.activation.extensionAdapter.path",
    active,
  );
  if (adapterPath) {
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

  resolveRepositoryPath(
    errors,
    root,
    activation.realPair?.evidence,
    "mcp.activation.realPair.evidence",
    active,
  );

  return errors;
}
