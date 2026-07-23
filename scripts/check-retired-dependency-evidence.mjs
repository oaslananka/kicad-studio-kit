#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildRetiredDependencyEvidenceReport,
  buildUnavailableRetiredDependencyEvidenceReport,
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

const GRAPH_ATTEMPT_LIMIT = 4;
const TRANSIENT_GRAPH_STATUSES = new Set([502, 503, 504]);

function isTimeoutMessage(message) {
  const normalized = String(message).toLowerCase().replaceAll(" ", "");
  return normalized.includes("timeout") || normalized.includes("timedout");
}

export function classifyGraphResponse(response, text) {
  if (!response.ok) {
    const failure = `HTTP ${response.status} ${response.statusText}`;
    return {
      payload: null,
      failure,
      retryable: TRANSIENT_GRAPH_STATUSES.has(response.status),
    };
  }
  const payload = text ? JSON.parse(text) : null;
  const messages = Array.isArray(payload?.errors)
    ? payload.errors.map((error) => error.message)
    : [];
  if (messages.length === 0) {
    return { payload, failure: "", retryable: false };
  }
  const failure = messages.join("; ");
  const retryable = messages.some(isTimeoutMessage);
  return { payload: retryable ? null : payload, failure, retryable };
}

async function fetchGraphRequest(token, query, variables) {
  let lastFailure = "unknown GraphQL failure";
  for (let attempt = 0; attempt < GRAPH_ATTEMPT_LIMIT; attempt += 1) {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: graphqlHeaders(token),
      body: JSON.stringify({ query, variables }),
    });
    const result = classifyGraphResponse(response, await response.text());
    if (result.payload) return result.payload;
    lastFailure = result.failure;
    if (!result.retryable) {
      throw new Error(`dependency graph manifest: ${lastFailure}`);
    }
    if (attempt + 1 < GRAPH_ATTEMPT_LIMIT) {
      await sleep(500 * 2 ** attempt);
    }
  }
  throw new Error(`dependency graph manifest: ${lastFailure}`);
}

export function buildGraphNodeRequest(graphNodeId) {
  return {
    query: `query($id: ID!) {
      node(id: $id) {
        ... on DependencyGraphManifest {
          id
          filename
          dependenciesCount
          dependencies(first: 1) { totalCount }
        }
      }
    }`,
    variables: { id: graphNodeId },
  };
}

export function graphManifestFromPayload(payload, expectedManifest) {
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    throw new Error(
      `dependency graph manifest: ${payload.errors.map((error) => error.message).join("; ")}`,
    );
  }
  const node = payload?.data?.node ?? null;
  if (!node) return null;
  if (node.id !== expectedManifest.graphNodeId) {
    throw new Error(
      `dependency graph node ID mismatch for ${expectedManifest.path}`,
    );
  }
  if (node.filename !== expectedManifest.path) {
    throw new Error(
      `dependency graph manifest path mismatch: expected ${expectedManifest.path}, received ${node.filename}`,
    );
  }
  return {
    filename: node.filename,
    dependenciesCount: Number(node.dependenciesCount ?? 0),
  };
}

async function fetchGraphManifests(token, policy) {
  const manifests = [];
  for (const expectedManifest of policy.manifests) {
    const request = buildGraphNodeRequest(expectedManifest.graphNodeId);
    const payload = await fetchGraphRequest(
      token,
      request.query,
      request.variables,
    );
    const manifest = graphManifestFromPayload(payload, expectedManifest);
    if (manifest) manifests.push(manifest);
  }
  return manifests;
}

export function parseNextLinkHeader(linkHeader) {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const segments = part.split(";").map((segment) => segment.trim());
    const relation = segments
      .slice(1)
      .some((segment) => segment === 'rel="next"' || segment === "rel=next");
    if (!relation) continue;
    const target = segments[0];
    if (target.startsWith("<") && target.endsWith(">")) {
      return target.slice(1, -1);
    }
  }
  return null;
}

async function fetchOpenAlerts(token, repository) {
  repositoryParts(repository);
  const alerts = [];
  let url = `https://api.github.com/repos/${repository}/dependabot/alerts?state=open&per_page=100`;
  while (url) {
    const response = await fetch(url, { headers: requestHeaders(token) });
    const next = parseNextLinkHeader(response.headers.get("link"));
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
  const presentPaths = presentRetiredPaths(policy);
  let graphManifests = [];
  let openAlerts = [];
  if (options.fetch) {
    const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
    const repository = options.repo || policy.repository;
    try {
      if (!token) {
        throw new Error("GITHUB_TOKEN or GH_TOKEN is required with --fetch");
      }
      graphManifests = await fetchGraphManifests(token, policy);
      openAlerts = await fetchOpenAlerts(token, repository);
    } catch (error) {
      const report = buildUnavailableRetiredDependencyEvidenceReport({
        policy,
        presentPaths,
        reason: error.message,
      });
      writeEvidence(options, report);
      return report.exitCode;
    }
  }
  const report = buildRetiredDependencyEvidenceReport({
    policy,
    presentPaths,
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
