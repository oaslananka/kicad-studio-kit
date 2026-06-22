#!/usr/bin/env node

// Verifies (default) or regenerates (--write) every user-facing release surface
// that repeats the KiCad Studio extension version, so a release can never leave
// the README, changelog, compatibility metadata, or generated docs pointing at
// a stale version.
//
//   node scripts/check-release-surface.mjs           # check, exit 1 on drift
//   node scripts/check-release-surface.mjs --write    # rewrite the surfaces this
//                                                      # module owns directly
//
// The authoritative version is apps/vscode-extension/package.json, which is
// itself pinned to .release-please-manifest.json by check-version-consistency.

import process from "node:process";
import {
  REFRESH_COMMAND,
  collectDrift,
  readAuthoritativeVersion,
  writeOwnedReleaseSurfaces,
} from "./lib/release-surface.mjs";

function main() {
  const args = new Set(process.argv.slice(2));
  const write = args.has("--write") || args.has("--fix");
  const version = readAuthoritativeVersion();

  if (write) {
    const changed = writeOwnedReleaseSurfaces(undefined, version);
    if (changed.length > 0) {
      console.log(
        `Regenerated release surfaces for version ${version}: ${changed.join(", ")}.`,
      );
    } else {
      console.log(
        `Owned release surfaces already match version ${version}.`,
      );
    }
    console.log(
      "Run `corepack pnpm run docs:generate` to refresh the generated docs tables.",
    );
    return;
  }

  const drift = collectDrift(undefined, version);
  if (drift.length > 0) {
    console.error(
      `Release surface drift detected (authoritative version ${version} from apps/vscode-extension/package.json):`,
    );
    for (const entry of drift) {
      console.error(
        `- ${entry.file} (${entry.label}): expected ${entry.expected}, found ${String(entry.actual)}`,
      );
    }
    console.error("");
    console.error(`Fix the README block with: ${REFRESH_COMMAND}`);
    console.error(
      "Other surfaces are owned by their generators: run `corepack pnpm run docs:generate` for docs and let Release Please update the changelog/manifest.",
    );
    process.exit(1);
  }

  console.log(
    `All release surfaces match version ${version} from apps/vscode-extension/package.json.`,
  );
}

main();
