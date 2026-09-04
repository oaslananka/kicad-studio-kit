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

test("#542 TOML parser rejects prototype-sensitive table and assignment keys", () => {
  for (const unsafeKey of ["__proto__", "prototype", "constructor"]) {
    assert.throws(
      () => parseTomlSubset(`[mcp_servers.${unsafeKey}]\ncommand = "uvx"`),
      new RegExp(`unsafe TOML key: ${unsafeKey}`, "u"),
    );
    assert.throws(
      () => parseTomlSubset(`[mcp_servers.kicad]\n${unsafeKey} = "value"`),
      new RegExp(`unsafe TOML key: ${unsafeKey}`, "u"),
    );
  }
  assert.equal(Object.prototype.polluted, undefined);
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

test("agent guidance rejects nonexistent root CLAUDE.md routing", () => {
  const errors = collectForbiddenContentErrors(
    "docs/agents/index.md",
    "- Claude-specific guide: `CLAUDE.md`",
  );

  assert.match(errors.join("\\n"), /AGENTS\.md.*canonical|CLAUDE\.md/u);
});

test("agent review guidance rejects external MCP and npm-wrapper work as local", () => {
  const errors = collectForbiddenContentErrors(
    "docs/maintainers/agent-pr-review-runbook.md",
    [
      "- MCP server feature or bug fix",
      "MCP-only changes should run MCP tests, command help/version checks, and package build.",
      "Npm-wrapper-only changes should run wrapper install checks, `npm pack --dry-run`, and CLI help/version checks.",
    ].join("\\n"),
  );

  assert.match(errors.join("\\n"), /KiCad MCP Pro|external owner/u);
});
