import assert from "node:assert/strict";
import test from "node:test";

import {
  collectForbiddenContentErrors,
  parseTomlSubset,
  validateAgentConfigs,
  validateStdioServer,
} from "./check-agent-configs.mjs";

test("agent onboarding configs validate in the repository", () => {
  assert.deepEqual(validateAgentConfigs(), []);
});

test("TOML parser handles nested MCP server tables", () => {
  const parsed = parseTomlSubset(`
[mcp_servers.kicad]
command = "uvx"
args = ["kicad-mcp-pro"]
startup_timeout_sec = 20

[mcp_servers.kicad.env]
KICAD_MCP_PROJECT_DIR = "/absolute/path/to/your/kicad-project"
KICAD_MCP_PROFILE = "pcb_only"
KICAD_MCP_OPERATING_MODE = "readonly"
`);

  assert.equal(parsed.mcp_servers.kicad.command, "uvx");
  assert.deepEqual(parsed.mcp_servers.kicad.args, ["kicad-mcp-pro"]);
  assert.equal(parsed.mcp_servers.kicad.startup_timeout_sec, 20);
  assert.equal(
    parsed.mcp_servers.kicad.env.KICAD_MCP_OPERATING_MODE,
    "readonly",
  );
});

test("stdio validator rejects unsafe profile and mode drift", () => {
  const errors = validateStdioServer(
    {
      command: "kicad-mcp-pro",
      args: [],
      env: {
        KICAD_MCP_PROJECT_DIR: "/absolute/path/to/your/kicad-project",
        KICAD_MCP_PROFILE: "full",
        KICAD_MCP_OPERATING_MODE: "write",
      },
    },
    { file: "example.json", expectedProfile: "pcb_only" },
  );

  assert.match(errors.join("\n"), /stdio command must be uvx/u);
  assert.match(errors.join("\n"), /KICAD_MCP_PROFILE must be pcb_only/u);
  assert.match(errors.join("\n"), /KICAD_MCP_OPERATING_MODE must be readonly/u);
});

test("forbidden content scanner catches fixture defaults and secrets", () => {
  const errors = collectForbiddenContentErrors(
    ".vscode/mcp.json",
    'Authorization: Bearer live-token\n"${workspaceFolder}/test/fixtures/sample_project"',
  );

  assert.equal(errors.length, 3);
  assert.match(errors[0], /fixture/u);
  assert.match(errors[1], /workspace fixture/u);
  assert.match(errors[2], /bearer tokens/u);
});
