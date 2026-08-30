import assert from "node:assert/strict";
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
