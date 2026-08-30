import { fileURLToPath } from "node:url";

const PRIMARY_PROFILES = ["review", "build", "release", "expert"];
const MIGRATION_ALIASES = ["default", "full", "agent_full"];

export function parsePublishedProfiles(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Published MCP profile discovery returned invalid JSON: ${error}`,
    );
  }
  if (
    !Array.isArray(parsed) ||
    parsed.some((value) => typeof value !== "string")
  ) {
    throw new Error(
      "Published MCP profile discovery must return a JSON array of strings.",
    );
  }
  return [...new Set(parsed)];
}

export function validatePublishedProfiles(profiles) {
  const available = new Set(profiles);
  for (const profile of [...PRIMARY_PROFILES, ...MIGRATION_ALIASES]) {
    if (!available.has(profile)) {
      throw new Error(
        `Published kicad-mcp-pro is missing required profile: ${profile}`,
      );
    }
  }
  return {
    primary: [...PRIMARY_PROFILES],
    migrationAliases: [...MIGRATION_ALIASES],
  };
}

function main() {
  const raw = process.env.KICAD_MCP_PRO_PUBLISHED_PROFILES;
  if (!raw) {
    throw new Error("KICAD_MCP_PRO_PUBLISHED_PROFILES is required.");
  }
  const profiles = parsePublishedProfiles(raw);
  const contract = validatePublishedProfiles(profiles);
  console.log(
    `✓ published MCP profiles satisfy Studio contract: ${contract.primary.join(", ")}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
