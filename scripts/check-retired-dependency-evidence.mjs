#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildRetiredDependencyEvidenceReport,
  loadRetiredDependencyPolicy,
  renderRetiredDependencyEvidenceMarkdown,
  validateRetiredDependencyPolicy,
} from "./lib/retired-dependency-evidence.mjs";

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_ROOT, "..");
const API_VERSION = "2022-11-28";

function parseArguments(argv) {
  const options = { fetch: false, repo: "", json: "", summary: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--fetch") options.fetch = true;
    else if (argument === "--repo") options.repo = argv[++index] ?? "";
    else if (argument === "--json") options.json = argv[++index] ?? "";
    else if (argument === "--summary") options.summary = argv[++index] ?? "";
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function repositoryParts(repository) {
  const [owner, name, ...rest] = repository.split("/");
  if (!owner || !name || rest.length > 0) {
    throw new Error("--repo must use owner/repository format");
  }
  return { owner, name };
}

function requestHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "kicad-studio-kit-governance-evidence",
    "X-GitHub-Api-Version": API_VERSION,
  };
}

async function readJson(response, label) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${label}: HTTP ${response.status} ${response.statusText}`);
  }
  return text ? JSON.parse(text) : null;
}

function graphqlHeaders(token) {
  const headers = requestHeaders(token);
  delete headers["X-GitHub-Api-Version"];
  return headers;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchGraphPage(token, owner, name, query, after) {
  let lastFailure = "unknown GraphQL failure";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: graphqlHeaders(token),
      body: JSON.stringify({ query, variables: { owner, name, after } }),
    });
    const text = await response.text();
    if (response.ok) {
      const payload = text ? JSON.parse(text) : null;
      const messages = Array.isArray(payload?.errors)
        ? payload.errors.map((error) => error.message)
        : [];
      if (messages.length === 0) return payload;
      lastFailure = messages.join("; ");
      if (!messages.some((message) => /timed?out/iu.test(message))) {
        return payload;
      }
    } else {
      lastFailure = `HTTP ${response.status} ${response.statusText}`;
      if (![502, 503, 504].includes(response.status)) {
        throw new Error(`dependency graph manifests: ${lastFailure}`);
      }
    }
    if (attempt < 3) await sleep(500 * 2 ** attempt);
  }
  throw new Error(`dependency graph manifests: ${lastFailure}`);
}

async function fetchGraphManifests(token, repository) {
  const { owner, name } = repositoryParts(repository);
  const query = `query($owner: String!, $name: String!, $after: String) {
    repository(owner: $owner, name: $name) {
      dependencyGraphManifests(first: 10, after: $after) {
        nodes {
          filename
          dependenciesCount
          dependencies(first: 1) { totalCount }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }`;
  const manifests = [];
  let after = null;
  do {
    const payload = await fetchGraphPage(token, owner, name, query, after);
    if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
      throw new Error(
        `dependency graph manifests: ${payload.errors.map((error) => error.message).join("; ")}`,
      );
    }
    const connection = payload?.data?.repository?.dependencyGraphManifests;
    if (!connection)
      throw new Error("dependency graph manifests were unavailable");
    manifests.push(
      ...connection.nodes.map((manifest) => ({
        filename: manifest.filename,
        dependenciesCount: manifest.dependenciesCount,
      })),
    );
    after = connection.pageInfo.hasNextPage
      ? connection.pageInfo.endCursor
      : null;
  } while (after);
  return manifests;
}

function nextLink(linkHeader) {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/u);
    if (match) return match[1];
  }
  return null;
}

async function fetchOpenAlerts(token, repository) {
  const alerts = [];
  let url = `https://api.github.com/repos/${repository}/dependabot/alerts?state=open&per_page=100`;
  while (url) {
    const response = await fetch(url, { headers: requestHeaders(token) });
    const next = nextLink(response.headers.get("link"));
    const payload = await readJson(response, "open Dependabot alerts");
    alerts.push(
      ...payload.map((alert) => ({
        number: alert.number,
        manifestPath: alert.dependency?.manifest_path ?? "",
      })),
    );
    url = next;
  }
  return alerts;
}

function presentRetiredPaths(policy) {
  const paths = [];
  for (const manifest of policy.manifests) {
    for (const relativePath of [manifest.path, manifest.directory]) {
      if (fs.existsSync(path.join(REPO_ROOT, relativePath))) {
        paths.push(relativePath);
      }
    }
  }
  return paths;
}

function writeEvidence(options, report) {
  const markdown = renderRetiredDependencyEvidenceMarkdown(report);
  process.stdout.write(markdown);
  if (options.json) {
    fs.writeFileSync(options.json, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (options.summary) fs.appendFileSync(options.summary, markdown);
}

export async function run(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const policy = loadRetiredDependencyPolicy();
  const policyErrors = validateRetiredDependencyPolicy(REPO_ROOT, policy);
  if (policyErrors.length > 0) {
    throw new Error(policyErrors.join("; "));
  }
  let graphManifests = [];
  let openAlerts = [];
  if (options.fetch) {
    const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
    if (!token)
      throw new Error("GITHUB_TOKEN or GH_TOKEN is required with --fetch");
    const repository = options.repo || policy.repository;
    graphManifests = await fetchGraphManifests(token, repository);
    openAlerts = await fetchOpenAlerts(token, repository);
  }
  const report = buildRetiredDependencyEvidenceReport({
    policy,
    presentPaths: presentRetiredPaths(policy),
    graphManifests,
    openAlerts,
  });
  writeEvidence(options, report);
  return report.exitCode;
}

async function main() {
  try {
    process.exitCode = await run();
  } catch (error) {
    console.error(`Retired dependency evidence failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
