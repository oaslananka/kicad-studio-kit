#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  buildScorecardEvidenceReport,
  buildUnavailableScorecardEvidenceReport,
  loadScorecardResidualRiskPolicy,
  renderScorecardEvidenceMarkdown,
  validateScorecardResidualRiskPolicy,
} from "./lib/scorecard-evidence.mjs";

function parseArguments(argv) {
  const options = {
    fetch: false,
    repository: process.env.GITHUB_REPOSITORY ?? "oaslananka/kicad-studio-kit",
    governanceJson: "",
    json: "",
    summary: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--fetch") options.fetch = true;
    else if (argument === "--repo") options.repository = argv[++index] ?? "";
    else if (argument === "--governance-json")
      options.governanceJson = argv[++index] ?? "";
    else if (argument === "--json") options.json = argv[++index] ?? "";
    else if (argument === "--summary") options.summary = argv[++index] ?? "";
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(options.repository)) {
    throw new Error(`Invalid repository identifier: ${options.repository}`);
  }
  return options;
}

function requestHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "kicad-studio-kit-scorecard-evidence",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function parseNextLink(linkHeader) {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const segments = part.split(";").map((segment) => segment.trim());
    if (!segments.slice(1).some((segment) => segment === 'rel="next"'))
      continue;
    const target = segments[0];
    if (target.startsWith("<") && target.endsWith(">"))
      return target.slice(1, -1);
  }
  return null;
}

async function fetchJson(url, token, label) {
  const response = await fetch(url, {
    headers: requestHeaders(token),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok)
    throw new Error(`${label}: HTTP ${response.status} ${response.statusText}`);
  return {
    data: await response.json(),
    next: parseNextLink(response.headers.get("link")),
  };
}

async function fetchAll(url, token, label) {
  const values = [];
  let next = url;
  while (next) {
    const page = await fetchJson(next, token, label);
    if (!Array.isArray(page.data))
      throw new Error(`${label}: expected an array response`);
    values.push(...page.data);
    next = page.next;
  }
  return values;
}

function apiUrl(relativePath) {
  const root = process.env.GITHUB_API_URL ?? "https://api.github.com";
  return `${root}${relativePath}`;
}

async function collectLiveEvidence(options, policy, token) {
  const repoPath = `/repos/${options.repository}`;
  const commitsResult = await fetchJson(
    apiUrl(`${repoPath}/commits?sha=main&per_page=${policy.sampleSize}`),
    token,
    "recent default-branch commits",
  );
  if (!Array.isArray(commitsResult.data)) {
    throw new Error(
      "recent default-branch commits: expected an array response",
    );
  }
  const codeqlAnalyses = await fetchAll(
    apiUrl(`${repoPath}/code-scanning/analyses?tool_name=CodeQL&per_page=100`),
    token,
    "CodeQL analyses",
  );
  const scorecardAlerts = await fetchAll(
    apiUrl(`${repoPath}/code-scanning/alerts?tool_name=Scorecard&per_page=100`),
    token,
    "Scorecard alerts",
  );
  if (!options.governanceJson) {
    throw new Error("--governance-json is required with --fetch");
  }
  const governanceReport = JSON.parse(
    fs.readFileSync(options.governanceJson, "utf8"),
  );
  return {
    recentCommits: commitsResult.data.map((commit) => ({ sha: commit.sha })),
    codeqlAnalyses,
    scorecardAlerts,
    governanceReport,
  };
}

function writeOutput(filePath, content, append = false) {
  if (!filePath) return;
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  if (append) fs.appendFileSync(resolved, content);
  else fs.writeFileSync(resolved, content);
}

function emit(options, report) {
  const markdown = renderScorecardEvidenceMarkdown(report);
  writeOutput(options.json, `${JSON.stringify(report, null, 2)}\n`);
  writeOutput(options.summary, markdown, true);
  process.stdout.write(markdown);
}

export async function run(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const policy = loadScorecardResidualRiskPolicy();
  const policyErrors = validateScorecardResidualRiskPolicy(policy);
  if (policyErrors.length > 0) throw new Error(policyErrors.join("; "));
  if (!options.fetch) {
    console.log(
      `Scorecard residual-risk policy is valid (${policy.sampleSize}-commit SAST sample; ${policy.branchProtection.expectedWarnings.length} accepted branch warnings).`,
    );
    return 0;
  }
  try {
    const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
    if (!token)
      throw new Error("GITHUB_TOKEN or GH_TOKEN is required with --fetch");
    const evidence = await collectLiveEvidence(options, policy, token);
    const report = buildScorecardEvidenceReport({
      policy,
      recentCommits: evidence.recentCommits,
      codeqlAnalyses: evidence.codeqlAnalyses,
      scorecardAlerts: evidence.scorecardAlerts,
      governanceReport: evidence.governanceReport,
    });
    emit(options, report);
    return report.exitCode;
  } catch (error) {
    const report = buildUnavailableScorecardEvidenceReport({
      policy,
      reason: error instanceof Error ? error.message : String(error),
    });
    emit(options, report);
    return report.exitCode;
  }
}

async function main() {
  try {
    process.exitCode = await run();
  } catch (error) {
    console.error(`Scorecard evidence failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
