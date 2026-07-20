#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildGovernanceEvidenceReport,
  normalizeRuleset,
  renderGovernanceEvidenceMarkdown,
} from "./lib/github-governance-evidence.mjs";

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_ROOT, "..");
const DEFAULT_RULESET_PATH = path.join(REPO_ROOT, ".github/rulesets/main.json");

function parseArgs(argv) {
  const options = {
    fetch: false,
    repository: process.env.GITHUB_REPOSITORY ?? "oaslananka/kicad-studio-kit",
    jsonPath: "",
    summaryPath: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--fetch") {
      options.fetch = true;
    } else if (arg === "--repo") {
      options.repository = argv[++index] ?? "";
    } else if (arg === "--json") {
      options.jsonPath = argv[++index] ?? "";
    } else if (arg === "--summary") {
      options.summaryPath = argv[++index] ?? "";
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(options.repository)) {
    throw new Error(`Invalid repository identifier: ${options.repository}`);
  }
  return options;
}

function readExpectedRuleset() {
  return JSON.parse(fs.readFileSync(DEFAULT_RULESET_PATH, "utf8"));
}

function safeReason(status, statusText) {
  return `HTTP ${status}${statusText ? ` ${statusText}` : ""}`;
}

async function apiRequest(relativePath, token) {
  const apiRoot = process.env.GITHUB_API_URL ?? "https://api.github.com";
  try {
    const response = await fetch(`${apiRoot}${relativePath}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      return {
        available: false,
        reason: safeReason(response.status, response.statusText),
        data: null,
      };
    }
    return {
      available: true,
      reason: "",
      data: response.status === 204 ? null : await response.json(),
    };
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : String(error),
      data: null,
    };
  }
}

async function fetchLiveEvidence(repositoryName, expectedRuleset) {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
  if (!token) {
    return {
      liveRuleset: null,
      repository: null,
      privateVulnerabilityReporting: {
        available: false,
        reason: "GITHUB_TOKEN or GH_TOKEN is not set.",
      },
      endpointAvailability: {},
    };
  }

  const repoPath = `/repos/${repositoryName}`;
  const [repositoryResult, rulesetsResult, privateReportingResult] =
    await Promise.all([
      apiRequest(repoPath, token),
      apiRequest(`${repoPath}/rulesets`, token),
      apiRequest(`${repoPath}/private-vulnerability-reporting`, token),
    ]);

  let liveRuleset = null;
  if (rulesetsResult.available && Array.isArray(rulesetsResult.data)) {
    const candidate = rulesetsResult.data.find(
      (ruleset) =>
        ruleset?.name === expectedRuleset.name &&
        ruleset?.target === expectedRuleset.target &&
        ruleset?.enforcement === "active",
    );
    if (candidate?.id) {
      const details = await apiRequest(
        `${repoPath}/rulesets/${candidate.id}`,
        token,
      );
      if (details.available) {
        liveRuleset = details.data;
      }
    }
  }

  const [dependabotAlerts, codeScanningAlerts, secretScanningAlerts] =
    await Promise.all([
      apiRequest(`${repoPath}/dependabot/alerts?per_page=1`, token),
      apiRequest(`${repoPath}/code-scanning/alerts?per_page=1`, token),
      apiRequest(`${repoPath}/secret-scanning/alerts?per_page=1`, token),
    ]);

  return {
    liveRuleset,
    repository: repositoryResult.available ? repositoryResult.data : null,
    privateVulnerabilityReporting: privateReportingResult.available
      ? {
          available: true,
          enabled: privateReportingResult.data?.enabled === true,
        }
      : {
          available: false,
          reason: privateReportingResult.reason,
        },
    endpointAvailability: {
      dependabotAlerts: {
        available: dependabotAlerts.available,
        reason: dependabotAlerts.reason,
      },
      codeScanningAlerts: {
        available: codeScanningAlerts.available,
        reason: codeScanningAlerts.reason,
      },
      secretScanningAlerts: {
        available: secretScanningAlerts.available,
        reason: secretScanningAlerts.reason,
      },
    },
  };
}

function writeOutput(filePath, content) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  fs.writeFileSync(filePath, content);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const expectedRuleset = readExpectedRuleset();

  if (!options.fetch) {
    const normalized = normalizeRuleset(expectedRuleset);
    console.log(
      `Checked-in governance ruleset is parseable (${normalized.requiredStatusChecks.contexts.length} required checks).`,
    );
    return;
  }

  const liveEvidence = await fetchLiveEvidence(
    options.repository,
    expectedRuleset,
  );
  const report = buildGovernanceEvidenceReport({
    expectedRuleset,
    ...liveEvidence,
  });
  const markdown = renderGovernanceEvidenceMarkdown(report);
  writeOutput(options.jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeOutput(options.summaryPath, markdown);
  process.stdout.write(markdown);
  process.exitCode = report.exitCode;
}

await main();
