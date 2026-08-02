#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import process from "node:process";

import {
  buildCreateCommitRequest,
  parseGitNameStatus,
  parseGitStatus,
  rewriteReleaseBranch,
} from "./lib/github-signed-commit.mjs";

const options = parseArguments(process.argv.slice(2));
const repository = options.repository ?? process.env.GITHUB_REPOSITORY;
const branch = options.branch;
const headline = options.message;
const baseOid = options.base;
const token = process.env.GITHUB_TOKEN;

if (!repository || !branch || !headline || !token) {
  throw new Error(
    "--repository, --branch, --message, and GITHUB_TOKEN are required",
  );
}

if (baseOid) {
  const expectedHeadOid = git(["rev-parse", "HEAD"]).trim();
  ensureBaseIsAncestor(baseOid, expectedHeadOid);
  const descriptors = collectReleaseChanges(baseOid);
  const changes = readChanges(descriptors);
  await rewriteReleaseBranch({
    repository,
    branch,
    baseOid,
    expectedHeadOid,
    headline,
    changes,
    getRemoteHead,
    forceUpdateRef,
    createCommit: createGitHubCommit,
  });
} else {
  const status = git([
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]);
  const descriptors = parseGitStatus(status);
  if (descriptors.length === 0) {
    console.log("No generated release surfaces changed; no commit created.");
    process.exit(0);
  }

  const expectedHeadOid = git(["rev-parse", "HEAD"]).trim();
  const request = buildCreateCommitRequest({
    repository,
    branch,
    expectedHeadOid,
    headline,
    changes: readChanges(descriptors),
  });
  await createGitHubCommit(request);
}

console.log("Created a verified GitHub commit on the requested branch.");

function collectReleaseChanges(baseOid) {
  const tracked = parseGitNameStatus(
    git(["diff", "--name-status", "--no-renames", "-z", baseOid, "--"]),
  );
  const byPath = new Map(tracked.map((change) => [change.path, change]));
  const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter(Boolean);
  for (const filePath of untracked) {
    byPath.set(filePath, { path: filePath, deleted: false });
  }
  if (byPath.size === 0) {
    throw new Error("release branch has no changes relative to the base SHA");
  }
  return [...byPath.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

function readChanges(descriptors) {
  return descriptors.map((descriptor) =>
    descriptor.deleted
      ? descriptor
      : { ...descriptor, contents: fs.readFileSync(descriptor.path) },
  );
}

function ensureBaseIsAncestor(baseOid, expectedHeadOid) {
  if (!/^[0-9a-f]{40}$/iu.test(baseOid ?? "")) {
    throw new Error("--base must be a 40-character Git SHA");
  }
  if (!/^[0-9a-f]{40}$/iu.test(expectedHeadOid ?? "")) {
    throw new Error("local HEAD must be a 40-character Git SHA");
  }
  try {
    git(["merge-base", "--is-ancestor", baseOid, expectedHeadOid]);
  } catch {
    throw new Error("--base must be an ancestor of the release branch HEAD");
  }
}

async function getRemoteHead({
  repository: repositorySlug,
  branch: branchName,
}) {
  const payload = await githubRestRequest(
    `/repos/${repositorySlug}/git/ref/heads/${encodeBranchPath(branchName)}`,
    { method: "GET" },
  );
  const oid = payload.object?.sha;
  if (!/^[0-9a-f]{40}$/iu.test(oid ?? "")) {
    throw new Error("GitHub ref lookup returned no valid commit OID");
  }
  return oid;
}

async function forceUpdateRef({
  repository: repositorySlug,
  branch: branchName,
  sha,
  force,
}) {
  await githubRestRequest(
    `/repos/${repositorySlug}/git/refs/heads/${encodeBranchPath(branchName)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ sha, force }),
    },
  );
}

async function createGitHubCommit(request) {
  const graphResponse = await githubGraphqlRequest({
    method: "POST",
    body: JSON.stringify(request),
  });
  if (graphResponse.errors?.length) {
    throw new Error(
      `GitHub createCommitOnBranch failed: ${JSON.stringify(graphResponse.errors)}`,
    );
  }
  const createdCommit = graphResponse.data?.createCommitOnBranch?.commit;
  verifyGitHubSignature(createdCommit);
  return createdCommit;
}

function verifyGitHubSignature(commit) {
  if (!/^[0-9a-f]{40}$/iu.test(commit?.oid ?? "")) {
    throw new Error("GitHub createCommitOnBranch returned no valid commit OID");
  }
  const signature = commit.signature;
  if (
    signature?.isValid !== true ||
    signature?.state !== "VALID" ||
    signature?.wasSignedByGitHub !== true
  ) {
    throw new Error(
      "GitHub createCommitOnBranch returned an unverified commit",
    );
  }
}

function encodeBranchPath(branchName) {
  return branchName.split("/").map(encodeURIComponent).join("/");
}

async function githubRestRequest(pathname, init) {
  return githubApiRequest(`https://api.github.com${pathname}`, init);
}

async function githubGraphqlRequest(init) {
  return githubApiRequest("https://api.github.com/graphql", init);
}

async function githubApiRequest(url, init) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "kicad-studio-kit-release-workflow",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      `GitHub API ${response.status} ${response.statusText}: ${JSON.stringify(payload)}`,
    );
  }
  return payload;
}

function git(args) {
  return execFileSync("/usr/bin/git", args, { encoding: "utf8" });
}

function parseArguments(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument sequence near ${flag ?? "(end)"}`);
    }
    const name = flag.slice(2);
    if (!new Set(["repository", "branch", "message", "base"]).has(name)) {
      throw new Error(`Unknown argument: ${flag}`);
    }
    parsed[name] = value;
  }
  return parsed;
}
