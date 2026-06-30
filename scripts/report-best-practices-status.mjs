#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const BEST_PRACTICES_PROJECT_ID = 13405;
export const BEST_PRACTICES_PROJECT_URL = `https://www.bestpractices.dev/projects/${BEST_PRACTICES_PROJECT_ID}`;
export const BEST_PRACTICES_JSON_URL = `${BEST_PRACTICES_PROJECT_URL}.json`;

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const PRIORITY_FIELDS = new Set([
  "homepage_url",
  "description_good",
  "interact",
  "contribution_requirements",
  "documentation_interface",
  "version_unique",
  "version_semver",
  "version_tags",
  "release_notes_vulns",
  "report_url",
  "report_tracker",
  "report_responses",
  "enhancement_responses",
  "vulnerability_report_process",
  "vulnerability_report_private",
  "vulnerability_report_response",
  "build",
  "build_common_tools",
  "build_floss_tools",
  "test",
  "test_invocation",
  "test_most",
  "test_policy",
  "tests_are_added",
  "tests_documented_added",
  "warnings",
  "warnings_fixed",
  "warnings_strict",
  "static_analysis",
  "static_analysis_common_vulnerabilities",
  "static_analysis_fixed",
  "static_analysis_often",
  "test_continuous_integration",
  "no_leaked_credentials",
  "english",
  "governance",
  "code_of_conduct",
  "roles_responsibilities",
  "access_continuity",
  "bus_factor",
  "documentation_roadmap",
  "documentation_architecture",
  "documentation_security",
  "documentation_quick_start",
  "documentation_current",
  "accessibility_best_practices",
  "internationalization",
  "maintenance_or_update",
  "vulnerability_report_credit",
  "vulnerability_response_process",
  "coding_standards",
  "coding_standards_enforced",
  "dependency_monitoring",
  "automated_integration_testing",
  "test_statement_coverage80",
  "signed_releases",
]);

const CAUTION_FIELDS = new Set([
  "dynamic_analysis",
  "dynamic_analysis_unsafe",
  "dynamic_analysis_enable_assertions",
  "dynamic_analysis_fixed",
  "test_statement_coverage90",
  "test_branch_coverage80",
  "contributors_unassociated",
  "copyright_per_file",
  "license_per_file",
  "security_review",
  "assurance_case",
  "require_2FA",
  "secure_2FA",
  "two_person_review",
]);

export function summarizeStatuses(project) {
  const summary = new Map();
  const fields = [];

  for (const [key, status] of Object.entries(project)) {
    if (!key.endsWith("_status")) {
      continue;
    }
    const field = key.slice(0, -"_status".length);
    summary.set(status, (summary.get(status) ?? 0) + 1);
    fields.push({
      field,
      status,
      priority: PRIORITY_FIELDS.has(field),
      caution: CAUTION_FIELDS.has(field),
      justification: project[`${field}_justification`] ?? null,
    });
  }

  fields.sort((left, right) => {
    const leftRank = left.status === "Unmet" ? 0 : left.status === "?" ? 1 : 2;
    const rightRank =
      right.status === "Unmet" ? 0 : right.status === "?" ? 1 : 2;
    if (leftRank !== rightRank) return leftRank - rightRank;
    if (left.priority !== right.priority) return left.priority ? -1 : 1;
    if (left.caution !== right.caution) return left.caution ? 1 : -1;
    return left.field.localeCompare(right.field);
  });

  return {
    summary: Object.fromEntries([...summary.entries()].sort()),
    fields,
    unmet: fields.filter((entry) => entry.status === "Unmet"),
    unknown: fields.filter((entry) => entry.status === "?"),
    priorityUnknown: fields.filter(
      (entry) => entry.status === "?" && entry.priority,
    ),
    cautionUnknown: fields.filter(
      (entry) => entry.status === "?" && entry.caution,
    ),
  };
}

function escapeMarkdownText(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("`", "\\`")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
}

function formatFieldList(entries, limit = 80) {
  if (entries.length === 0) {
    return "- None";
  }
  return entries
    .slice(0, limit)
    .map((entry) => {
      const flags = [
        entry.priority ? "priority" : null,
        entry.caution ? "caution" : null,
      ].filter(Boolean);
      const suffix = flags.length > 0 ? ` _(${flags.join(", ")})_` : "";
      return `- \`${escapeMarkdownText(entry.field)}\` — ${escapeMarkdownText(entry.status)}${suffix}`;
    })
    .join("\n");
}

export function renderMarkdown(project, now = new Date()) {
  const status = summarizeStatuses(project);
  const updated = project.updated_at ?? "unknown";
  const badge =
    project.badge_percentage_0 ?? project.badge_percentage ?? "unknown";
  const silver = project.badge_percentage_1 ?? "unknown";
  const gold = project.badge_percentage_2 ?? "unknown";

  return `# Best Practices Status Report

Project: [${escapeMarkdownText(project.name ?? "kicad-studio-kit")}](${BEST_PRACTICES_PROJECT_URL})  
Generated: ${escapeMarkdownText(now.toISOString())}  
Remote updated: ${escapeMarkdownText(updated)}

## Percentages

| Tier | Percentage |
| --- | ---: |
| Passing | ${escapeMarkdownText(badge)} |
| Silver | ${escapeMarkdownText(silver)} |
| Gold | ${escapeMarkdownText(gold)} |

## Status counts

${Object.entries(status.summary)
  .map(
    ([key, value]) =>
      `- ${escapeMarkdownText(key)}: ${escapeMarkdownText(value)}`,
  )
  .join("\n")}

## Unmet fields

${formatFieldList(status.unmet)}

## Highest-impact unanswered fields

These are the unanswered fields that the repository evidence guide already prioritizes.
Use \`docs/best-practices-questionnaire.md\` to fill them without overclaiming.

${formatFieldList(status.priorityUnknown, 120)}

## Caution fields

Do not mark these as Met unless the linked evidence is genuinely present.

${formatFieldList(status.cautionUnknown, 80)}
`;
}

async function readProjectJson(options) {
  if (options.input) {
    return JSON.parse(await fs.readFile(options.input, "utf8"));
  }

  const response = await fetch(BEST_PRACTICES_JSON_URL, {
    headers: {
      accept: "application/json",
      "user-agent": "kicad-studio-kit-best-practices-status/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${BEST_PRACTICES_JSON_URL}: ${response.status} ${response.statusText}`,
    );
  }
  return await response.json();
}

function parseArgs(argv) {
  const options = {
    input: null,
    output: path.join(repoRoot, "docs", "best-practices-status.md"),
    write: false,
  };

  const nextArg = (index, flag) => {
    const value = argv[index + 1];
    if (!value || value === "--" || value.startsWith("--")) {
      throw new Error(`${flag} requires a value`);
    }
    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--input") {
      options.input = nextArg(index, arg);
      index += 1;
    } else if (arg === "--output") {
      options.output = nextArg(index, arg);
      index += 1;
    } else if (arg === "--write") {
      options.write = true;
    } else if (arg === "--stdout") {
      options.output = null;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const project = await readProjectJson(options);
  const markdown = renderMarkdown(project);

  if (options.output) {
    if (!options.write) {
      console.log(markdown);
      console.log(
        `\nDry run only. Add --write to update ${path.relative(repoRoot, options.output)}.`,
      );
      return { project, markdown, wrote: false };
    }
    await fs.writeFile(options.output, markdown);
    console.log(`Wrote ${path.relative(repoRoot, options.output)}`);
    return { project, markdown, wrote: true };
  }

  console.log(markdown);
  return { project, markdown, wrote: false };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
