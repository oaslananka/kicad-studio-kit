#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

import { validateRuntimePolicyMetadata } from "./lib/runtime-policy.mjs";

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
