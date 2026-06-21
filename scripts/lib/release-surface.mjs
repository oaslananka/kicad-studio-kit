// Single source of truth for the KiCad Studio Kit release surface.
//
// The authoritative version lives in apps/vscode-extension/package.json. That
// file is already pinned to .release-please-manifest.json by
// scripts/check-version-consistency.mjs, so everything in this module derives
// from it. The helpers here let scripts/check-release-surface.mjs both verify
// (check mode) and regenerate (--write mode) every user-facing surface that
// repeats the extension version, so the release surface can never drift
// silently after a release.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

export const AUTHORITATIVE_VERSION_FILE = "apps/vscode-extension/package.json";

export const README_MARKER_START = "<!-- release-surface:start -->";
export const README_MARKER_END = "<!-- release-surface:end -->";

export const REFRESH_COMMAND = "corepack pnpm run release:surface";

function readText(relativePath, root = repoRoot) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(relativePath, root = repoRoot) {
  return JSON.parse(readText(relativePath, root));
}

export function readAuthoritativeVersion(root = repoRoot) {
  const version = readJson(AUTHORITATIVE_VERSION_FILE, root)?.version;
  if (typeof version !== "string" || version.length === 0) {
    throw new Error(
      `${AUTHORITATIVE_VERSION_FILE} is missing a non-empty version field`,
    );
  }
  return version;
}

// The README "Version Baseline" block is fully generated from the authoritative
// version. Both the version token and the surrounding prose are reproduced here
// so check mode can detect any hand edit that drifts from the template.
export function renderReadmeBaseline(version) {
  return `${README_MARKER_START}
<!-- Generated from ${AUTHORITATIVE_VERSION_FILE}. Run \`${REFRESH_COMMAND}\` to refresh. -->

This repository's local release surface is:

- VS Code extension: \`oaslananka.kicadstudiokit\` (\`${version}\`)

The Python package \`kicad-mcp-pro\`, container image, and MCP Registry listing
are released from [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp).
${README_MARKER_END}`;
}

export function applyReadmeBaseline(content, version) {
  const startIndex = content.indexOf(README_MARKER_START);
  const endIndex = content.indexOf(README_MARKER_END);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(
      `README.md is missing the release-surface markers (${README_MARKER_START} ... ${README_MARKER_END})`,
    );
  }
  const before = content.slice(0, startIndex);
  const after = content.slice(endIndex + README_MARKER_END.length);
  return `${before}${renderReadmeBaseline(version)}${after}`;
}

function extractReadmeVersion(content) {
  const match = content.match(/`oaslananka\.kicadstudiokit`\s*\(`([^`]+)`\)/u);
  return match ? match[1] : undefined;
}

function extractChangelogTopVersion(content) {
  const match = content.match(/^##\s*\[([^\]]+)\]/mu);
  return match ? match[1] : undefined;
}

function extractSupportMatrixProductVersion(content) {
  // Generated "Product Versions" table row, e.g.
  // | kicad-studio | 1.8.1 | apps/vscode-extension/package.json | ... |
  // Version tokens contain no spaces or pipes, so match a run of non-space,
  // non-pipe characters; this is unambiguous and avoids regex backtracking.
  const match = content.match(/\|\s*kicad-studio\s*\|\s*([^\s|]+)\s*\|/u);
  return match ? match[1] : undefined;
}

function extractVersionsDocExtension(content) {
  const match = content.match(
    /\|\s*KiCad Studio extension\s*\|\s*`([^`]+)`\s*\|/u,
  );
  return match ? match[1] : undefined;
}

// Every surface that must echo the authoritative extension version. The README
// and CHANGELOG are not covered by any other gate, so this list is what makes
// them release-blocking.
export const RELEASE_SURFACES = [
  {
    file: "README.md",
    label: "README version baseline",
    extract: extractReadmeVersion,
  },
  {
    file: "apps/vscode-extension/CHANGELOG.md",
    label: "Extension changelog latest entry",
    extract: extractChangelogTopVersion,
  },
  {
    file: ".release-please-manifest.json",
    label: "Release Please manifest",
    extract: (content) => JSON.parse(content)["apps/vscode-extension"],
  },
  {
    file: "compatibility.yaml",
    label: "Compatibility product version",
    extract: (content) =>
      parseYaml(content)?.products?.["kicad-studio"]?.version,
  },
  {
    file: "docs/support-matrix.md",
    label: "Generated support matrix product version",
    extract: extractSupportMatrixProductVersion,
  },
  {
    file: "docs/versions.md",
    label: "Generated versions table",
    extract: extractVersionsDocExtension,
  },
];

export function collectDrift(root = repoRoot, version = undefined) {
  const expected = version ?? readAuthoritativeVersion(root);
  const drift = [];
  for (const surface of RELEASE_SURFACES) {
    let actual;
    try {
      actual = surface.extract(readText(surface.file, root));
      // Treat a missing/empty extraction (e.g. a surface whose format changed so
      // the version no longer parses) as unreadable, so it is reported with a
      // clear message rather than surfacing a bare `undefined` in the diff.
      if (typeof actual !== "string" || actual.trim().length === 0) {
        throw new Error("extracted version is empty or could not be parsed");
      }
    } catch (error) {
      drift.push({
        ...surface,
        expected,
        actual: `<unreadable: ${error.message}>`,
      });
      continue;
    }
    if (actual !== expected) {
      drift.push({ ...surface, expected, actual });
    }
  }

  // The README block is generated, so also fail when its prose drifts even if
  // the version token happens to match.
  try {
    const readme = readText("README.md", root);
    if (applyReadmeBaseline(readme, expected) !== readme) {
      if (!drift.some((entry) => entry.file === "README.md")) {
        drift.push({
          file: "README.md",
          label: "README version baseline block",
          expected,
          actual: "<block out of sync with template>",
        });
      }
    }
  } catch (error) {
    drift.push({
      file: "README.md",
      label: "README version baseline block",
      expected,
      actual: `<unreadable: ${error.message}>`,
    });
  }

  return drift;
}

export function writeReadmeBaseline(root = repoRoot, version = undefined) {
  const expected = version ?? readAuthoritativeVersion(root);
  const readmePath = path.join(root, "README.md");
  const current = fs.readFileSync(readmePath, "utf8");
  const next = applyReadmeBaseline(current, expected);
  if (next !== current) {
    fs.writeFileSync(readmePath, next, "utf8");
    return true;
  }
  return false;
}
