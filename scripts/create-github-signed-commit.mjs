#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import process from "node:process";

import {
  buildCreateCommitRequest,
  parseGitStatus,
} from "./lib/github-signed-commit.mjs";

const options = parseArguments(process.argv.slice(2));
const repository = options.repository ?? process.env.GITHUB_REPOSITORY;
const branch = options.branch;
const headline = options.message;
const token = process.env.GITHUB_TOKEN;

if (!repository || !branch || !headline || !token) {
  throw new Error(
    "--repository, --branch, --message, and GITHUB_TOKEN are required",
  );
}

const status = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
const descriptors = parseGitStatus(status);
if (descriptors.length === 0) {
  console.log("No generated release surfaces changed; no commit created.");
  process.exit(0);
}

const expectedHeadOid = git(["rev-parse", "HEAD"]).trim();
const changes = descriptors.map((descriptor) =>
  descriptor.deleted
    ? descriptor
    : { ...descriptor, contents: fs.readFileSync(descriptor.path) },
);
const request = buildCreateCommitRequest({
  repository,
  branch,
  expectedHeadOid,
  headline,
  changes,
});

const graphResponse = await githubGraphqlRequest({
  method: "POST",
  body: JSON.stringify(request),
});
if (graphResponse.errors?.length) {
  throw new Error(
    `GitHub createCommitOnBranch failed: ${JSON.stringify(graphResponse.errors)}`,
  );
}

const commit = graphResponse.data?.createCommitOnBranch?.commit;
if (!/^[0-9a-f]{40}$/iu.test(commit?.oid ?? "")) {
  throw new Error("GitHub createCommitOnBranch returned no valid commit OID");
}
const signature = commit.signature;
if (
  signature?.isValid !== true ||
  signature?.state !== "VALID" ||
  signature?.wasSignedByGitHub !== true
) {
  throw new Error("GitHub createCommitOnBranch returned an unverified commit");
}

console.log("Created a verified GitHub commit on the requested branch.");

async function githubGraphqlRequest(init) {
  const response = await fetch("https://api.github.com/graphql", {
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
    if (!new Set(["repository", "branch", "message"]).has(name)) {
      throw new Error(`Unknown argument: ${flag}`);
    }
    parsed[name] = value;
  }
  return parsed;
}
