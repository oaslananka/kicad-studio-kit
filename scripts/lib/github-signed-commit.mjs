import path from "node:path";

const CREATE_COMMIT_MUTATION = `
mutation($input: CreateCommitOnBranchInput!) {
  createCommitOnBranch(input: $input) {
    commit {
      oid
      url
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

export function buildCreateCommitRequest({
  repository,
  branch,
  expectedHeadOid,
  headline,
  changes,
}) {
  if (!repository?.includes("/")) {
    throw new Error("repository must use owner/name format");
  }
  if (!branch) {
    throw new Error("branch is required");
  }
  if (!/^[0-9a-f]{40}$/i.test(expectedHeadOid ?? "")) {
    throw new Error("expectedHeadOid must be a 40-character Git SHA");
  }
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
      throw new Error(`contents must be a Buffer for ${change.path}`);
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
