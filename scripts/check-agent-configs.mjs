#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_ROOT, "..");
const PROJECT_PLACEHOLDER = "/absolute/path/to/your/kicad-project";

const requiredMarkdownFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  ".github/copilot-instructions.md",
  "docs/agents/index.md",
  "docs/agents/client-configs.md",
  "docs/agents/codex-support.md",
  "docs/adr/0007-agent-onboarding-config-pack.md",
  "examples/mcp-clients/README.md",
];

const requiredRootExamples = [
  {
    file: ".vscode/mcp.example.json",
    format: "json",
    rootKey: "servers",
    type: "stdio",
    profile: "pcb_only",
  },
  {
    file: "examples/mcp-clients/vscode.mcp.example.json",
    format: "json",
    rootKey: "servers",
    type: "stdio",
    profile: "pcb_only",
  },
  {
    file: "examples/mcp-clients/codex.config.example.toml",
    format: "toml",
    rootKey: "mcp_servers",
    type: "stdio",
    profile: "pcb_only",
  },
  {
    file: "examples/mcp-clients/claude-code.mcp.example.json",
    format: "json",
    rootKey: "mcpServers",
    type: "stdio",
    profile: "pcb_only",
  },
  {
    file: "examples/mcp-clients/claude-desktop.config.example.json",
    format: "json",
    rootKey: "mcpServers",
    type: "stdio",
    profile: "pcb_only",
  },
  {
    file: "examples/mcp-clients/cursor.mcp.example.json",
    format: "json",
    rootKey: "mcpServers",
    type: "stdio",
    profile: "pcb_only",
  },
  {
    file: "examples/mcp-clients/gemini.settings.example.json",
    format: "json",
    rootKey: "mcpServers",
    type: "stdio",
    profile: "pcb_only",
  },
  {
    file: "examples/mcp-clients/generic-stdio.mcp.example.json",
    format: "json",
    rootKey: "mcpServers",
    type: "stdio",
    profile: "pcb_only",
  },
  {
    file: "examples/mcp-clients/generic-http.mcp.example.json",
    format: "json",
    rootKey: "mcpServers",
    type: "http",
  },
];

const requiredPackageExamples = [
  {
    file: "packages/mcp-server/docs/examples/clients/vscode.mcp.json",
    format: "json",
    rootKey: "servers",
    type: "stdio",
    profile: "pcb_only",
  },
  {
    file: "packages/mcp-server/docs/examples/clients/codex-config.toml",
    format: "toml",
    rootKey: "mcp_servers",
    type: "stdio",
    profile: "pcb_only",
  },
  {
    file: "packages/mcp-server/docs/examples/clients/claude-code.mcp.json",
    format: "json",
    rootKey: "mcpServers",
    type: "stdio",
    profile: "pcb_only",
  },
  {
    file: "packages/mcp-server/docs/examples/clients/claude-desktop.json",
    format: "json",
    rootKey: "mcpServers",
    type: "stdio",
    profile: "pcb_only",
  },
  {
    file: "packages/mcp-server/docs/examples/clients/cursor.mcp.json",
    format: "json",
    rootKey: "mcpServers",
    type: "stdio",
    profile: "pcb_only",
  },
  {
    file: "packages/mcp-server/docs/examples/clients/gemini-settings.json",
    format: "json",
    rootKey: "mcpServers",
    type: "stdio",
    profile: "pcb_only",
  },
  {
    file: "packages/mcp-server/docs/examples/clients/generic-mcp-client.json",
    format: "json",
    rootKey: "mcpServers",
    type: "stdio",
    profile: "pcb_only",
  },
  {
    file: "packages/mcp-server/docs/examples/clients/vscode-http.mcp.json",
    format: "json",
    rootKey: "servers",
    type: "http",
  },
  {
    file: "packages/mcp-server/docs/examples/clients/codex-http-config.toml",
    format: "toml",
    rootKey: "mcp_servers",
    type: "http",
  },
  {
    file: "packages/mcp-server/docs/examples/clients/gemini-http-settings.json",
    format: "json",
    rootKey: "mcpServers",
    type: "http",
  },
];

const requiredReferences = {
  "AGENTS.md": [
    "Codex, Claude Code, Claude Desktop, GitHub Copilot, Gemini CLI, and Cursor",
    "apps/vscode-extension",
    "packages/mcp-server",
    "packages/mcp-npm",
    "docs/support-matrix.md",
    "docs/release.md",
    "docs/architecture/protocol-change-checklist.md",
    "corepack pnpm run lint",
    "corepack pnpm run typecheck",
    "corepack pnpm run test",
    "corepack pnpm run build",
    "corepack pnpm run verify:dist",
    "KICAD_MCP_OPERATING_MODE=readonly",
    "KICAD_MCP_OPERATING_MODE=write",
    "manufacturing",
    "experimental",
    "remote MCP endpoints by default",
    "unsafe webview",
    "PR #16",
  ],
  "CLAUDE.md": [
    "AGENTS.md",
    ".mcp.json",
    "claude mcp add --transport stdio --scope project",
    "claude-code.mcp.example.json",
    "Windows PowerShell",
    "KICAD_MCP_OPERATING_MODE=readonly",
  ],
  ".github/copilot-instructions.md": [
    "AGENTS.md",
    "Codex, Claude, Copilot, Gemini, and Cursor",
    "docs/architecture/product-boundaries.md",
    "docs/architecture/protocol-change-checklist.md",
    "Windows PowerShell",
    "PR Checklist",
    "corepack pnpm run verify:dist",
    "examples/mcp-clients/",
  ],
  "README.md": [
    "docs/agents/index.md",
    "examples/mcp-clients/README.md",
    ".vscode/mcp.example.json",
  ],
  "docs/agents/index.md": [
    "AGENTS.md",
    "client-configs.md",
    "codex-support.md",
  ],
  "docs/agents/client-configs.md": [
    ".vscode/mcp.example.json",
    "vscode.mcp.example.json",
    "codex.config.example.toml",
    "claude-code.mcp.example.json",
    "generic-http.mcp.example.json",
    "### Linux/macOS",
    "### Windows PowerShell",
    "gemini mcp add --scope project --transport stdio",
    "uvx kicad-mcp-pro --transport http",
    "KICAD_MCP_PROFILE=pcb_only",
    "## Destination Paths",
    "%APPDATA%\\Claude\\claude_desktop_config.json",
    "%USERPROFILE%\\.gemini\\settings.json",
    "KICAD_MCP_AUTH_TOKEN",
    "bearer token",
    "https://code.vscode.dev/docs/copilot/customization/mcp-servers",
    "https://developers.openai.com/codex/config-reference",
    "https://modelcontextprotocol.io/specification/2025-06-18/basic/transports",
  ],
  "docs/agents/codex-support.md": [
    "kicadstudio.ai.provider=codex",
    "~/.codex/config.toml",
    "codex mcp add kicad",
    "examples/mcp-clients/codex.config.example.toml",
  ],
  "docs/adr/0007-agent-onboarding-config-pack.md": [
    "Do not add Codex skills or a packaged plugin in this change.",
    "KICAD_MCP_OPERATING_MODE=readonly",
    "KICAD_MCP_PROFILE=pcb_only",
    "external MCP client, not a direct KiCad Studio extension",
  ],
  "examples/mcp-clients/README.md": [
    "/absolute/path/to/your/kicad-project",
    "vscode.mcp.example.json",
    "codex.config.example.toml",
    "generic-http.mcp.example.json",
    "### Linux/macOS",
    "### Windows PowerShell",
    "gemini mcp add --scope project --transport stdio",
    "uvx kicad-mcp-pro --transport http",
    "KICAD_MCP_OPERATING_MODE",
    "profile: `pcb_only`",
    "## Destination Paths",
    "%APPDATA%\\Claude\\claude_desktop_config.json",
    "%USERPROFILE%\\.gemini\\settings.json",
    "KICAD_MCP_AUTH_TOKEN",
    "bearer token",
  ],
  "apps/vscode-extension/docs/AI_PROVIDERS.md": [
    "six direct AI provider paths",
    "## Codex",
    "not as a direct KiCad Studio",
    "examples/mcp-clients/codex.config.example.toml",
    "docs/agents/codex-support.md",
  ],
  "apps/vscode-extension/CHANGELOG.md": [
    "Clarified Codex support as an external MCP client workflow",
    "kicadstudio.ai.provider=codex",
  ],
  "packages/mcp-server/docs/client-configuration.md": [
    "KICAD_MCP_OPERATING_MODE=readonly",
    "KICAD_MCP_PROFILE=pcb_only",
    "Linux and macOS:",
    "Windows PowerShell:",
    "gemini mcp add --scope project --transport stdio",
    "uvx kicad-mcp-pro --transport http",
    "## Destination Paths",
    "%APPDATA%\\Claude\\claude_desktop_config.json",
    "%USERPROFILE%\\.gemini\\settings.json",
    "KICAD_MCP_AUTH_TOKEN",
    "bearer token",
    "../../../docs/agents/client-configs.md",
    "https://developers.openai.com/codex/config-reference",
  ],
  "docs/.vitepress/config.mts": ["/agents/", "/agents/client-configs"],
};

const forbiddenContent = [
  {
    pattern: /test\/fixtures\/sample_project/u,
    message: "must not point onboarding configs at the fixture project",
  },
  {
    pattern: /\$\{workspaceFolder\}\/test\/fixtures/u,
    message: "must not use workspace fixture paths as developer defaults",
  },
  {
    pattern: /Authorization:\s*Bearer\s+(?!\[REDACTED\]|your-token|YOUR_)/iu,
    message: "must not include bearer tokens",
  },
  {
    pattern: /client_secret\s*=\s*["'][^"']+["']/iu,
    message: "must not include client secrets",
  },
];

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function readText(repoRoot, relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function readJson(repoRoot, relativePath, errors) {
  try {
    return JSON.parse(readText(repoRoot, relativePath));
  } catch (error) {
    errors.push(`${relativePath}: invalid JSON: ${error.message}`);
    return undefined;
  }
}

function setNestedValue(root, tablePath, key, value) {
  let target = root;
  for (const part of tablePath) {
    target[part] ??= {};
    target = target[part];
  }
  target[key] = value;
}

function parseTomlValue(rawValue, sourceName, lineNumber) {
  const value = rawValue.trim();
  if (/^"[^"]*"$/u.test(value)) {
    return value.slice(1, -1);
  }
  if (/^\d+$/u.test(value)) {
    return Number(value);
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    const entries = value
      .slice(1, -1)
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    return entries.map((entry) => {
      if (!/^"[^"]*"$/u.test(entry)) {
        throw new Error(
          `${sourceName}:${lineNumber}: only string arrays are supported`,
        );
      }
      return entry.slice(1, -1);
    });
  }
  throw new Error(`${sourceName}:${lineNumber}: unsupported TOML value`);
}

export function parseTomlSubset(text, sourceName = "config.toml") {
  const root = {};
  let currentTable = [];

  text.split(/\r?\n/u).forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      return;
    }

    const table = line.match(/^\[([A-Za-z0-9_.-]+)\]$/u);
    if (table) {
      currentTable = table[1].split(".");
      return;
    }

    const assignment = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/u);
    if (!assignment) {
      throw new Error(`${sourceName}:${lineNumber}: invalid TOML line`);
    }
    setNestedValue(
      root,
      currentTable,
      assignment[1],
      parseTomlValue(assignment[2], sourceName, lineNumber),
    );
  });

  return root;
}

export function collectForbiddenContentErrors(relativePath, text) {
  return forbiddenContent
    .filter(({ pattern }) => pattern.test(text))
    .map(({ message }) => `${relativePath}: ${message}`);
}

function assertFile(repoRoot, relativePath, errors) {
  const fullPath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    errors.push(`${relativePath}: missing required file`);
    return false;
  }
  return true;
}

function validateRequiredReferences(repoRoot, errors) {
  for (const [relativePath, phrases] of Object.entries(requiredReferences)) {
    if (!assertFile(repoRoot, relativePath, errors)) {
      continue;
    }
    const text = readText(repoRoot, relativePath);
    for (const error of collectForbiddenContentErrors(relativePath, text)) {
      errors.push(error);
    }
    for (const phrase of phrases) {
      if (!text.includes(phrase)) {
        errors.push(`${relativePath}: missing required reference: ${phrase}`);
      }
    }
  }
}

function expectArray(value, expected, label, errors) {
  if (
    !Array.isArray(value) ||
    value.length !== expected.length ||
    value.some((item, index) => item !== expected[index])
  ) {
    errors.push(`${label}: expected ${JSON.stringify(expected)}`);
  }
}

export function validateStdioServer(server, options) {
  const errors = [];
  const { file, expectedProfile, requireProjectDir = true } = options;
  if (server.command !== "uvx") {
    errors.push(`${file}: stdio command must be uvx`);
  }
  expectArray(server.args, ["kicad-mcp-pro"], `${file}: stdio args`, errors);

  const env = server.env;
  if (!env || typeof env !== "object" || Array.isArray(env)) {
    errors.push(`${file}: stdio server must define env`);
    return errors;
  }

  if (requireProjectDir && env.KICAD_MCP_PROJECT_DIR !== PROJECT_PLACEHOLDER) {
    errors.push(
      `${file}: KICAD_MCP_PROJECT_DIR must use the project placeholder`,
    );
  }
  if (!requireProjectDir && "KICAD_MCP_PROJECT_DIR" in env) {
    errors.push(
      `${file}: developer default must not set KICAD_MCP_PROJECT_DIR`,
    );
  }
  if (env.KICAD_MCP_PROFILE !== expectedProfile) {
    errors.push(`${file}: KICAD_MCP_PROFILE must be ${expectedProfile}`);
  }
  if (env.KICAD_MCP_OPERATING_MODE !== "readonly") {
    errors.push(`${file}: KICAD_MCP_OPERATING_MODE must be readonly`);
  }

  return errors;
}

function validateHttpServer(server, file, errors) {
  const url = server.url ?? server.httpUrl;
  if (url !== "http://127.0.0.1:3334/mcp") {
    errors.push(`${file}: HTTP example must use http://127.0.0.1:3334/mcp`);
  }
}

function getServer(config, descriptor, errors) {
  const group = config?.[descriptor.rootKey];
  if (!group || typeof group !== "object" || Array.isArray(group)) {
    errors.push(`${descriptor.file}: missing ${descriptor.rootKey}`);
    return undefined;
  }
  const server = group.kicad;
  if (!server || typeof server !== "object" || Array.isArray(server)) {
    errors.push(`${descriptor.file}: missing kicad server`);
    return undefined;
  }
  return server;
}

function validateDescriptor(repoRoot, descriptor, errors) {
  if (!assertFile(repoRoot, descriptor.file, errors)) {
    return;
  }
  const text = readText(repoRoot, descriptor.file);
  for (const error of collectForbiddenContentErrors(descriptor.file, text)) {
    errors.push(error);
  }
  if (!text.endsWith("\n")) {
    errors.push(`${descriptor.file}: missing final newline`);
  }

  let config;
  if (descriptor.format === "json") {
    config = readJson(repoRoot, descriptor.file, errors);
  } else {
    try {
      config = parseTomlSubset(text, descriptor.file);
    } catch (error) {
      errors.push(error.message);
    }
  }
  if (!config) {
    return;
  }

  const server = getServer(config, descriptor, errors);
  if (!server) {
    return;
  }

  if (descriptor.type === "stdio") {
    errors.push(
      ...validateStdioServer(server, {
        file: descriptor.file,
        expectedProfile: descriptor.profile,
      }),
    );
  } else {
    validateHttpServer(server, descriptor.file, errors);
  }

  if (
    descriptor.file.includes("gemini") &&
    server.trust !== undefined &&
    server.trust !== false
  ) {
    errors.push(
      `${descriptor.file}: Gemini trust must remain false when present`,
    );
  }
}

function validateWorkspaceDefaults(repoRoot, errors) {
  const mcp = readJson(repoRoot, ".vscode/mcp.json", errors);
  const server = mcp?.servers?.kicad;
  if (server) {
    errors.push(
      ...validateStdioServer(server, {
        file: ".vscode/mcp.json",
        expectedProfile: "analysis",
        requireProjectDir: false,
      }),
    );
    if (server.env?.KICAD_MCP_WORKSPACE_ROOT !== "${workspaceFolder}") {
      errors.push(".vscode/mcp.json: must set KICAD_MCP_WORKSPACE_ROOT");
    }
  }

  const tasks = readJson(repoRoot, ".vscode/tasks.json", errors);
  const taskText = fs.existsSync(path.join(repoRoot, ".vscode/tasks.json"))
    ? readText(repoRoot, ".vscode/tasks.json")
    : "";
  for (const error of collectForbiddenContentErrors(
    ".vscode/tasks.json",
    taskText,
  )) {
    errors.push(error);
  }
  const httpTask = tasks?.tasks?.find(
    (task) => task.label === "Start kicad-mcp-pro (HTTP)",
  );
  if (!httpTask) {
    errors.push(".vscode/tasks.json: missing Start kicad-mcp-pro (HTTP) task");
    return;
  }
  if (httpTask.command !== "uvx") {
    errors.push(".vscode/tasks.json: HTTP dev task command must be uvx");
  }
  expectArray(
    httpTask.args,
    ["kicad-mcp-pro", "--transport", "http", "--port", "27185"],
    ".vscode/tasks.json: HTTP dev task args",
    errors,
  );
  const env = httpTask.options?.env;
  if (env?.KICAD_MCP_PROJECT_DIR) {
    errors.push(
      ".vscode/tasks.json: HTTP dev task must not set KICAD_MCP_PROJECT_DIR",
    );
  }
  if (env?.KICAD_MCP_WORKSPACE_ROOT !== "${workspaceFolder}") {
    errors.push(
      ".vscode/tasks.json: HTTP dev task must set KICAD_MCP_WORKSPACE_ROOT",
    );
  }
  if (env?.KICAD_MCP_PROFILE !== "analysis") {
    errors.push(".vscode/tasks.json: HTTP dev task profile must be analysis");
  }
  if (env?.KICAD_MCP_OPERATING_MODE !== "readonly") {
    errors.push(".vscode/tasks.json: HTTP dev task mode must be readonly");
  }
}

function validateScriptWiring(repoRoot, errors) {
  const packageJson = readJson(repoRoot, "package.json", errors);
  const checkAgentConfigs = packageJson?.scripts?.["check:agent-configs"];
  if (
    checkAgentConfigs !==
    "node scripts/check-agent-configs.mjs && node --test scripts/check-agent-configs.test.mjs"
  ) {
    errors.push("package.json: check:agent-configs script is missing or stale");
  }
  if (!packageJson?.scripts?.check?.includes("pnpm run check:agent-configs")) {
    errors.push("package.json: root check must run check:agent-configs");
  }

  const ci = readText(repoRoot, ".github/workflows/ci.yml");
  if (!ci.includes("corepack pnpm run check:agent-configs")) {
    errors.push(
      ".github/workflows/ci.yml: metadata job must run check:agent-configs",
    );
  }
}

export function validateAgentConfigs(options = {}) {
  const repoRoot = options.repoRoot ?? DEFAULT_REPO_ROOT;
  const errors = [];

  for (const file of requiredMarkdownFiles) {
    assertFile(repoRoot, file, errors);
  }
  validateRequiredReferences(repoRoot, errors);
  for (const descriptor of requiredRootExamples) {
    validateDescriptor(repoRoot, descriptor, errors);
  }
  for (const descriptor of requiredPackageExamples) {
    validateDescriptor(repoRoot, descriptor, errors);
  }
  validateWorkspaceDefaults(repoRoot, errors);
  validateScriptWiring(repoRoot, errors);

  return errors.map((error) => toPosixPath(error));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = validateAgentConfigs();
  if (errors.length > 0) {
    console.error("Agent config validation failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
  }
}
