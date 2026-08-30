import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  parsePublishedProfiles,
  validatePublishedProfiles,
} from "./check-published-mcp-profiles.mjs";

test("accepts the supported published profile vocabulary", () => {
  const profiles = parsePublishedProfiles(
    JSON.stringify([
      "default",
      "review",
      "build",
      "release",
      "expert",
      "full",
      "agent_full",
      "analysis",
    ]),
  );
  assert.deepEqual(validatePublishedProfiles(profiles), {
    primary: ["review", "build", "release", "expert"],
    migrationAliases: ["default", "full", "agent_full"],
  });
});

test("rejects a published artifact missing a primary workflow profile", () => {
  assert.throws(
    () =>
      validatePublishedProfiles([
        "default",
        "review",
        "build",
        "expert",
        "full",
      ]),
    /missing required profile: release/,
  );
});

test("rejects malformed profile discovery output", () => {
  assert.throws(() => parsePublishedProfiles('{"review":true}'), /JSON array/);
});

test("published profile canary inspects a verified wheel without executing it", () => {
  const workflow = fs.readFileSync(
    new URL(
      "../.github/workflows/cross-repo-compatibility.yml",
      import.meta.url,
    ),
    "utf8",
  );
  const section = workflow.match(
    /- name: Validate published MCP profile vocabulary[\s\S]*?(?=\n      - name:|$)/u,
  )?.[0];
  assert.ok(section, "published MCP profile vocabulary step is missing");
  assert.match(
    section,
    /pypi\.org\/pypi\/kicad-mcp-pro\/\$\{KICAD_MCP_PRO_VERSION\}\/json/u,
  );
  assert.match(section, /sha256/u);
  assert.match(section, /zipfile/u);
  assert.match(section, /ast\.literal_eval/u);
  assert.doesNotMatch(section, /uv run[\s\S]*?--with[\s\S]*?kicad-mcp-pro/u);
});
