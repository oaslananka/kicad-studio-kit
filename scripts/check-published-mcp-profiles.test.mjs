import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
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
  const extractor = fs.readFileSync(
    new URL("./extract_published_mcp_profiles.py", import.meta.url),
    "utf8",
  );
  assert.match(extractor, /ast\.literal_eval/u);
  assert.match(extractor, /ast\.AnnAssign/u);
  assert.doesNotMatch(section, /uv run[\s\S]*?--with[\s\S]*?kicad-mcp-pro/u);
});

function extractProfilesFromRouter(source) {
  const result = spawnSync(
    "python",
    [new URL("./extract_published_mcp_profiles.py", import.meta.url).pathname],
    { input: source, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("extracts profiles from the published router's annotated catalog assignment", () => {
  const source = `
PROFILE_CATEGORIES: dict[str, tuple[str, ...]] = {
    "default": ("project",),
    "review": ("project",),
    "expert": ("project",),
}

def available_profiles():
    preferred = ["default", "review", "missing", "expert"]
    return tuple(name for name in preferred if name in PROFILE_CATEGORIES)
`;
  assert.deepEqual(extractProfilesFromRouter(source), [
    "default",
    "review",
    "expert",
  ]);
});
