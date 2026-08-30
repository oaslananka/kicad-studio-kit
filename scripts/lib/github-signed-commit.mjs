import path from "node:path";

const CREATE_COMMIT_MUTATION = `
mutation($input: CreateCommitOnBranchInput!) {
  createCommitOnBranch(input: $input) {
    commit {
      oid
      url
      signature {
        isValid
        state
        wasSignedByGitHub
      }
    }
  }
}`;

export function parseGitStatus(rawStatus) {
  const entries = String(rawStatus).split("\0").filter(Boolean);
  const changes = [];

  for (const entry of entries) {
    if (entry.length < 4 || entry[2] !== " ") {
      throw new Error(
        `Unsupported git status record: ${JSON.stringify(entry)}`,
      );
    }
    const status = entry.slice(0, 2);
    if (/[RC]/.test(status)) {
      throw new Error("Git rename or copy entries are not supported");
    }
    const filePath = entry.slice(3);
    assertRepositoryPath(filePath);
    changes.push({
      path: filePath,
      deleted: status.includes("D"),
    });
  }

  return changes;
}

export function parseGitNameStatus(rawStatus) {
  const entries = String(rawStatus).split("\0").filter(Boolean);
  if (entries.length % 2 !== 0) {
    throw new Error("Malformed git name-status output");
  }

  const changes = [];
  for (let index = 0; index < entries.length; index += 2) {
    const status = entries[index];
    const filePath = entries[index + 1];
    if (/[RC]/u.test(status)) {
      throw new Error("Git rename or copy entries are not supported");
    }
    if (!/^[AMDT]$/u.test(status)) {
      throw new Error(`Unsupported git diff status: ${JSON.stringify(status)}`);
    }
    assertRepositoryPath(filePath);
    changes.push({ path: filePath, deleted: status === "D" });
  }
  return changes;
}

export async function rewriteReleaseBranch({
  repository,
  branch,
  baseOid,
  expectedHeadOid,
  headline,
  changes,
  getRemoteHead,
  forceUpdateRef,
  createCommit,
}) {
  assertRepositorySlug(repository);
  assertBranchName(branch);
  assertReleaseBranchName(branch);
  assertOid(baseOid, "baseOid");
  assertOid(expectedHeadOid, "expectedHeadOid");
  if (typeof getRemoteHead !== "function") {
    throw new TypeError("getRemoteHead must be a function");
  }
  if (typeof forceUpdateRef !== "function") {
    throw new TypeError("forceUpdateRef must be a function");
  }
  if (typeof createCommit !== "function") {
    throw new TypeError("createCommit must be a function");
  }

  const remoteHead = await getRemoteHead({ repository, branch });
  if (remoteHead !== expectedHeadOid) {
    throw new Error(
      `remote release branch moved: expected ${expectedHeadOid}, found ${remoteHead}`,
    );
  }

  const request = buildCreateCommitRequest({
    repository,
    branch,
    expectedHeadOid: baseOid,
    headline,
    changes,
  });

  await forceUpdateRef({ repository, branch, sha: baseOid, force: true });
  try {
    return await createCommit(request);
  } catch (error) {
    try {
      await forceUpdateRef({
        repository,
        branch,
        sha: expectedHeadOid,
        force: true,
      });
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "release branch rewrite failed and rollback failed",
        { cause: error },
      );
    }
    throw error;
  }
}

export async function createReleaseBranchFromBase({
  repository,
  branch,
  baseOid,
  headline,
  changes,
  createRef,
  deleteRef,
  createCommit,
}) {
  assertRepositorySlug(repository);
  assertBranchName(branch);
  assertReleaseShadowBranchName(branch);
  assertOid(baseOid, "baseOid");
  if (typeof createRef !== "function") {
    throw new TypeError("createRef must be a function");
  }
  if (typeof deleteRef !== "function") {
    throw new TypeError("deleteRef must be a function");
  }
  if (typeof createCommit !== "function") {
    throw new TypeError("createCommit must be a function");
  }

  const request = buildCreateCommitRequest({
    repository,
    branch,
    expectedHeadOid: baseOid,
    headline,
    changes,
  });

  await createRef({ repository, branch, sha: baseOid });
  try {
    return await createCommit(request);
  } catch (error) {
    try {
      await deleteRef({ repository, branch });
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "signed release branch creation failed and cleanup failed",
        { cause: error },
      );
    }
    throw error;
  }
}

export function buildCreateCommitRequest({
  repository,
  branch,
  expectedHeadOid,
  headline,
  changes,
}) {
  assertRepositorySlug(repository);
  assertBranchName(branch);
  assertOid(expectedHeadOid, "expectedHeadOid");
  if (!headline) {
    throw new Error("headline is required");
  }
  if (!Array.isArray(changes) || changes.length === 0) {
    throw new Error("at least one file change is required");
  }

  const additions = [];
  const deletions = [];
  for (const change of changes) {
    assertRepositoryPath(change.path);
    if (change.deleted) {
      deletions.push({ path: change.path });
      continue;
    }
    if (!Buffer.isBuffer(change.contents)) {
      throw new TypeError(`contents must be a Buffer for ${change.path}`);
    }
    additions.push({
      path: change.path,
      contents: change.contents.toString("base64"),
    });
  }

  return {
    query: CREATE_COMMIT_MUTATION,
    variables: {
      input: {
        branch: {
          repositoryNameWithOwner: repository,
          branchName: branch,
        },
        message: { headline },
        fileChanges: { additions, deletions },
        expectedHeadOid,
      },
    },
  };
}

function assertOid(value, label) {
  if (!/^[0-9a-f]{40}$/iu.test(value ?? "")) {
    throw new Error(`${label} must be a 40-character Git SHA`);
  }
}

function assertReleaseBranchName(branch) {
  if (!branch.startsWith("release-please--branches--")) {
    throw new Error(
      "release history rewrites are restricted to Release Please branches",
    );
  }
}

function assertReleaseShadowBranchName(branch) {
  if (!/^release-please\/branches\/[^/]+\/components\/[^/]+$/u.test(branch)) {
    throw new Error(
      "signed release branches must use the Release Please component branch format",
    );
  }
}

function assertRepositorySlug(repository) {
  if (typeof repository !== "string") {
    throw new TypeError("repository must use owner/name format");
  }
  const parts = repository.split("/");
  if (parts.length !== 2) {
    throw new Error("repository must use owner/name format");
  }
  const [owner, name] = parts;
  const ownerIsValid = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u.test(
    owner,
  );
  const nameIsValid =
    name.length <= 100 &&
    name !== "." &&
    name !== ".." &&
    /^[A-Za-z0-9._-]+$/u.test(name);
  if (!ownerIsValid || !nameIsValid) {
    throw new Error("repository must use a safe owner/name format");
  }
}

function assertBranchName(branch) {
  if (typeof branch !== "string") {
    throw new TypeError("branch must be a safe Git branch name");
  }
  const hasInvalidCharacter = [...branch].some((character) => {
    const code = character.codePointAt(0);
    return code <= 0x20 || code === 0x7f || "~^:?*[\\".includes(character);
  });
  if (
    branch.length === 0 ||
    branch.length > 255 ||
    hasInvalidCharacter ||
    branch.startsWith("-") ||
    branch.startsWith("/") ||
    branch.endsWith("/") ||
    branch.endsWith(".") ||
    branch.includes("..") ||
    branch.includes("@{") ||
    branch.includes("//")
  ) {
    throw new Error("branch must be a safe Git branch name");
  }
}

function assertRepositoryPath(filePath) {
  if (
    typeof filePath !== "string" ||
    filePath.length === 0 ||
    path.posix.isAbsolute(filePath) ||
    filePath.split("/").includes("..") ||
    filePath.includes("\\")
  ) {
    throw new Error(`Unsafe repository path: ${JSON.stringify(filePath)}`);
  }
}
