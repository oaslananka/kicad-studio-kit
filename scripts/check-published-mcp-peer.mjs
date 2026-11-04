#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";
import YAML from "yaml";

// Latest PyPI is verified by the separate live artifact and real-pair canary.
// testedAgainst is the last explicitly accepted consumer version.
export function validateLatestPublishedMcp(compatibility, latest) {
  const axis = compatibility?.supportAxes?.mcpServer;
  const tested = axis?.testedAgainst?.version;
  const range = axis?.required;
  if (axis?.package !== "kicad-mcp-pro") {
    throw new Error("Canonical MCP package identity is missing or changed");
  }
  if (!semver.valid(tested) || semver.prerelease(tested)) {
    throw new Error("The committed MCP testedAgainst must be a stable version");
  }
  if (!semver.valid(latest) || semver.prerelease(latest)) {
    throw new Error("Latest published MCP must be an exact stable version");
  }
  if (!semver.validRange(range)) {
    throw new Error("The MCP support range is missing or invalid");
  }
  if (!semver.satisfies(tested, range)) {
    throw new Error(
      "The committed testedAgainst is outside the supported range",
    );
  }
  if (!semver.satisfies(latest, range)) {
    throw new Error(
      "Latest published MCP is outside the supported range: " + latest,
    );
  }
  if (semver.lt(latest, tested)) {
    throw new Error(
      "Latest published MCP " +
        latest +
        " is older than testedAgainst " +
        tested,
    );
  }
  return tested;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  try {
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    const compatibility = YAML.parse(
      fs.readFileSync(path.join(root, "compatibility.yaml"), "utf8"),
    );
    const latest = process.env["KICAD_MCP_PRO_LATEST_VERSION"];
    const tested = validateLatestPublishedMcp(compatibility, latest);
    // stdout is a strict machine-readable version output used as a workflow output.
    console.log(tested);
    if (semver.gt(latest, tested)) {
      console.error(
        "::notice::Latest published MCP " +
          latest +
          " passed the artifact/real-pair canary; Studio explicitly accepted " +
          tested +
          " as testedAgainst. A metadata promotion needs its own evidence.",
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
