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

export function isDeletedGraphNodeError(error, graphNodeId) {
  return String(error?.message ?? "").includes(
    `Could not resolve to a node with the global id of '${graphNodeId}'`,
  );
}

export function buildRepositoryGraphManifestsRequest(repository, after = null) {
  const { owner, name } = repositoryParts(repository);
  return {
    query: `query($owner: String!, $name: String!, $after: String) {
      repository(owner: $owner, name: $name) {
        dependencyGraphManifests(first: 100, after: $after) {
          nodes { id filename dependenciesCount }
          pageInfo { hasNextPage endCursor }
        }
      }
    }`,
    variables: { owner, name, after },
  };
}

export function parseRepositoryGraphManifestsPage(payload, expectedManifest) {
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    throw new Error(
      `dependency graph manifests: ${payload.errors.map((error) => error.message).join("; ")}`,
    );
  }
  const connection = payload?.data?.repository?.dependencyGraphManifests;
  if (
    !Array.isArray(connection?.nodes) ||
    typeof connection.pageInfo?.hasNextPage !== "boolean"
  ) {
    throw new TypeError(
      "dependency graph manifest listing is missing or malformed",
    );
  }
  const matches = connection.nodes.filter(
    (node) => node?.filename === expectedManifest.path,
  );
  for (const node of matches) {
    if (
      typeof node.id !== "string" ||
      !Number.isSafeInteger(node.dependenciesCount) ||
      node.dependenciesCount < 0
    ) {
      throw new Error(
        "retired dependency graph manifest contains invalid metadata",
      );
    }
    if (node.id !== expectedManifest.graphNodeId) {
      throw new Error(
        "retired dependency graph manifest has an unexpected node identity",
      );
    }
  }
  if (connection.pageInfo.hasNextPage && !connection.pageInfo.endCursor) {
    throw new Error("dependency graph listing has no pagination cursor");
  }
  return {
    manifests: matches.map(({ filename, dependenciesCount }) => ({
      filename,
      dependenciesCount,
    })),
    nextCursor: connection.pageInfo.hasNextPage
      ? connection.pageInfo.endCursor
      : null,
  };
}

async function findDeletedGraphNodeInCurrentManifests(
  token,
  policy,
  expectedManifest,
) {
  const seenCursors = new Set();
  const matches = [];
  let after = null;
  for (let page = 0; page < 100; page += 1) {
    const request = buildRepositoryGraphManifestsRequest(
      policy.repository,
      after,
    );
    const payload = await fetchGraphRequest(
      token,
      request.query,
      request.variables,
    );
    const parsed = parseRepositoryGraphManifestsPage(payload, expectedManifest);
    matches.push(...parsed.manifests);
    if (matches.length > 1) {
      throw new Error(
        "retired dependency graph manifest appears more than once",
      );
    }
    if (!parsed.nextCursor) return matches;
    if (seenCursors.has(parsed.nextCursor)) {
      throw new Error("dependency graph manifest pagination cursor repeated");
    }
    seenCursors.add(parsed.nextCursor);
    after = parsed.nextCursor;
  }
  throw new Error(
    "dependency graph manifest pagination exceeded its safe limit",
  );
}

export async function fetchGraphManifests(token, policy) {
  const groups = await Promise.all(
    policy.manifests.map(async (expectedManifest) => {
      const request = buildGraphNodeRequest(expectedManifest.graphNodeId);
      try {
        const payload = await fetchGraphRequest(
          token,
          request.query,
          request.variables,
        );
        const manifest = graphManifestFromPayload(payload, expectedManifest);
        return manifest ? [manifest] : [];
      } catch (error) {
        if (!isDeletedGraphNodeError(error, expectedManifest.graphNodeId)) {
          throw error;
        }
        // GitHub can delete the historical node when the retired manifest
        // disappears. Confirm its absence against a complete live graph listing.
        return findDeletedGraphNodeInCurrentManifests(
          token,
          policy,
          expectedManifest,
        );
      }
    }),
  );
  return groups.flat();
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

export function normalizeOpenAlerts(payload) {
  if (!Array.isArray(payload)) {
    throw new TypeError("open Dependabot alerts payload must be an array");
  }
  return payload
    .filter((alert) => alert?.state === "open")
    .map((alert) => ({
      number: alert.number,
      manifestPath: alert.dependency?.manifest_path ?? "",
    }));
}

async function fetchOpenAlerts(token, repository) {
  repositoryParts(repository);
  const alerts = [];
  let url = `https://api.github.com/repos/${repository}/dependabot/alerts?state=open&per_page=100`;
  while (url) {
    const response = await fetch(url, { headers: requestHeaders(token) });
    const next = parseNextLinkHeader(response.headers.get("link"));
    const payload = await readJson(response, "open Dependabot alerts");
    alerts.push(...normalizeOpenAlerts(payload));
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
