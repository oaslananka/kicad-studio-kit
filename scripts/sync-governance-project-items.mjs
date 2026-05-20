#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = dirname(dirname(SCRIPT_PATH));
const GOVERNANCE_DOC = resolve(
  REPO_ROOT,
  "docs/architecture/governance-board.md",
);

const PHASE_HEADINGS = new Map([
  ["M0", "M0 foundation"],
  ["M1", "M1 test foundation"],
  ["M2", "M2 MCP compatibility"],
  ["M3", "M3 premium UI/UX"],
  ["M4", "M4 release hardening"],
]);

const DEFAULT_FIELDS = [
  "Product",
  "Area",
  "Priority",
  "Phase",
  "Status",
  "Risk",
];

function parseArgs(argv) {
  const args = {
    owner: "oaslananka",
    repo: "kicad-studio-kit",
    ownerType: "user",
    projectNumber: undefined,
    chunkSize: 10,
    cursor: undefined,
    issueNumbers: [],
    fields: DEFAULT_FIELDS,
    dryRun: false,
    json: true,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) {
        throw new Error(`${token} requires a value`);
      }
      return argv[index];
    };
    switch (token) {
      case "--owner":
        args.owner = next();
        break;
      case "--repo":
        args.repo = next();
        break;
      case "--owner-type":
        args.ownerType = next();
        break;
      case "--project-number":
        args.projectNumber = Number.parseInt(next(), 10);
        break;
      case "--chunk-size":
      case "--max-items-per-invocation":
        args.chunkSize = Number.parseInt(next(), 10);
        break;
      case "--cursor":
        args.cursor = next();
        break;
      case "--issues":
        args.issueNumbers = next()
          .split(",")
          .map((value) => Number.parseInt(value.trim().replace(/^#/, ""), 10))
          .filter(Number.isInteger);
        break;
      case "--fields":
        args.fields = next()
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--self-test":
        args.selfTest = true;
        break;
      case "--no-json":
        args.json = false;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (
    !Number.isInteger(args.chunkSize) ||
    args.chunkSize < 1 ||
    args.chunkSize > 50
  ) {
    throw new Error("--chunk-size must be an integer between 1 and 50");
  }
  if (!["user", "organization"].includes(args.ownerType)) {
    throw new Error("--owner-type must be user or organization");
  }
  return args;
}

function printHelp() {
  const command = basename(
    process.argv[1] ?? "sync-governance-project-items.mjs",
  );
  console.log(`Usage: node scripts/${command} --project-number <n> [options]

Synchronize repository issues into an existing GitHub Projects v2 board in
bounded, resumable chunks. The command does not create labels, milestones, or
projects; use it after governance bootstrap has already created those surfaces.

Options:
  --owner <login>                 GitHub owner, default oaslananka
  --repo <name>                   GitHub repository, default kicad-studio-kit
  --owner-type <user|organization> Project owner type, default user
  --project-number <n>            Existing Project v2 number
  --chunk-size <n>                Max issues to process in this invocation
  --max-items-per-invocation <n>  Alias for --chunk-size
  --cursor <cursor>               Cursor returned by a prior invocation
  --issues <1,2,3>                Explicit issue numbers instead of docs mapping
  --fields <A,B,C>                Project fields to update
  --dry-run                       Plan mutations without calling Project v2 APIs
  --self-test                     Run offline chunking/idempotency self-test
`);
}

function encodeCursor(index) {
  return Buffer.from(String(index), "utf8").toString("base64url");
}

function decodeCursor(cursor) {
  if (!cursor) {
    return 0;
  }
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  const value = Number.parseInt(decoded, 10);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid cursor: ${cursor}`);
  }
  return value;
}

function parseIssuePhaseMap(markdown) {
  const phaseByIssue = new Map();
  let currentPhase;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^###\s+(M[0-4])\s/);
    if (heading) {
      currentPhase = PHASE_HEADINGS.get(heading[1]);
      continue;
    }
    const issue = line.match(/^-\s+#(\d+)\s+/);
    if (issue && currentPhase) {
      phaseByIssue.set(Number.parseInt(issue[1], 10), currentPhase);
    }
  }
  return phaseByIssue;
}

function issueNumbersFromGovernanceDoc() {
  const markdown = readFileSync(GOVERNANCE_DOC, "utf8");
  return [...parseIssuePhaseMap(markdown).keys()].sort((a, b) => a - b);
}

function issueMetadata(issue, phaseByIssue) {
  const labels = new Set(
    (issue.labels ?? []).map((label) => label.name ?? label),
  );
  const product = firstLabelValue(labels, "product:") ?? inferProduct(labels);
  const priority =
    firstLabelValue(labels, "priority:") ??
    inferPriority(phaseByIssue.get(issue.number));
  const risk = firstLabelValue(labels, "risk:") ?? inferRisk(labels);
  const area = inferArea(labels);
  const phase = phaseByIssue.get(issue.number);
  const status =
    issue.state === "CLOSED" || issue.state === "closed" ? "Done" : "Backlog";
  return compactObject({
    Product: product,
    Area: area,
    Priority: priority,
    Phase: phase,
    Status: status,
    Risk: risk,
  });
}

function firstLabelValue(labels, prefix) {
  for (const label of labels) {
    if (label.startsWith(prefix)) {
      return label.slice(prefix.length);
    }
  }
  return undefined;
}

function inferProduct(labels) {
  if (labels.has("ui/ux")) return "vscode-extension";
  if (labels.has("kicad-compat")) return "shared";
  if (labels.has("security") || labels.has("ci") || labels.has("monorepo"))
    return "repo";
  return "shared";
}

function inferPriority(phase) {
  return phase?.startsWith("M0") ? "P0" : "P2";
}

function inferRisk(labels) {
  if (labels.has("security") || labels.has("release-blocker")) return "high";
  if (labels.has("regression") || labels.has("kicad-compat")) return "medium";
  return "low";
}

function inferArea(labels) {
  if (labels.has("security")) return "security";
  if (labels.has("ci")) return "ci";
  if (labels.has("testing") || labels.has("regression")) return "testing";
  if (labels.has("ui/ux")) return "ui-ux";
  if (labels.has("documentation")) return "docs";
  if (labels.has("architecture") || labels.has("monorepo"))
    return "architecture";
  if (labels.has("compatibility") || labels.has("kicad-compat"))
    return "compatibility";
  return "docs";
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  );
}

function chunkPlan(issueNumbers, chunkSize, cursor) {
  const startIndex = decodeCursor(cursor);
  const selected = issueNumbers.slice(startIndex, startIndex + chunkSize);
  const nextIndex = startIndex + selected.length;
  const remaining = issueNumbers.slice(nextIndex);
  return {
    startIndex,
    selected,
    remaining,
    nextCursor: remaining.length > 0 ? encodeCursor(nextIndex) : null,
    hasMore: remaining.length > 0,
  };
}

function graphql(query, variables) {
  const stdout = execFileSync("gh", ["api", "graphql", "--input", "-"], {
    input: JSON.stringify({ query, variables }),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  const payload = JSON.parse(stdout);
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }
  return payload.data;
}

function projectQuery(ownerType) {
  const projectOwner = ownerType === "organization" ? "organization" : "user";
  return `query GovernanceProject($owner: String!, $projectNumber: Int!) {
    ${projectOwner}(login: $owner) {
      projectV2(number: $projectNumber) {
        id
        title
        fields(first: 50) {
          nodes {
            ... on ProjectV2FieldCommon { id name }
            ... on ProjectV2SingleSelectField {
              id
              name
              options { id name }
            }
          }
        }
      }
    }
  }`;
}

function issueQuery() {
  return `query GovernanceIssue($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      issue(number: $number) {
        id
        number
        title
        state
        labels(first: 30) { nodes { name } }
        projectItems(first: 30) {
          nodes {
            id
            project { id }
          }
        }
      }
    }
  }`;
}

const ADD_ITEM_MUTATION = `mutation AddIssueToProject($projectId: ID!, $contentId: ID!) {
  addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
    item { id }
  }
}`;

const UPDATE_SINGLE_SELECT_MUTATION = `mutation UpdateProjectField(
  $projectId: ID!,
  $itemId: ID!,
  $fieldId: ID!,
  $optionId: String!
) {
  updateProjectV2ItemFieldValue(input: {
    projectId: $projectId,
    itemId: $itemId,
    fieldId: $fieldId,
    value: { singleSelectOptionId: $optionId }
  }) {
    projectV2Item { id }
  }
}`;

function fieldIndex(project) {
  const fields = new Map();
  for (const field of project.fields.nodes.filter(Boolean)) {
    const options = new Map(
      (field.options ?? []).map((option) => [option.name, option.id]),
    );
    fields.set(field.name, { id: field.id, options });
  }
  return fields;
}

function findProjectItem(issue, projectId) {
  return issue.projectItems.nodes.find((item) => item.project.id === projectId)
    ?.id;
}

function updateField(projectId, itemId, field, value) {
  const optionId = field.options.get(value);
  if (!optionId) {
    throw new Error(`missing option ${JSON.stringify(value)}`);
  }
  graphql(UPDATE_SINGLE_SELECT_MUTATION, {
    projectId,
    itemId,
    fieldId: field.id,
    optionId,
  });
}

function runSync(args) {
  const phaseByIssue = parseIssuePhaseMap(readFileSync(GOVERNANCE_DOC, "utf8"));
  const allIssueNumbers =
    args.issueNumbers.length > 0
      ? [...args.issueNumbers].sort((a, b) => a - b)
      : issueNumbersFromGovernanceDoc();
  const plan = chunkPlan(allIssueNumbers, args.chunkSize, args.cursor);
  const result = {
    dry_run: args.dryRun,
    chunk_size: args.chunkSize,
    cursor: args.cursor ?? null,
    next_cursor: plan.nextCursor,
    processed_issue_numbers: [],
    remaining_issue_numbers: plan.remaining,
    failures: [],
    has_more: plan.hasMore,
  };

  if (args.dryRun) {
    result.planned_issue_numbers = plan.selected;
    return result;
  }

  if (!Number.isInteger(args.projectNumber)) {
    throw new Error(
      "--project-number is required unless --dry-run or --self-test is used",
    );
  }

  const ownerNode = graphql(projectQuery(args.ownerType), {
    owner: args.owner,
    projectNumber: args.projectNumber,
  });
  const projectOwner =
    args.ownerType === "organization" ? ownerNode.organization : ownerNode.user;
  const project = projectOwner?.projectV2;
  if (!project) {
    throw new Error(
      `Project v2 #${args.projectNumber} not found for ${args.ownerType} ${args.owner}`,
    );
  }
  const fields = fieldIndex(project);

  for (const number of plan.selected) {
    try {
      const issueData = graphql(issueQuery(), {
        owner: args.owner,
        repo: args.repo,
        number,
      });
      const issue = issueData.repository?.issue;
      if (!issue) {
        throw new Error("issue not found");
      }
      let itemId = findProjectItem(issue, project.id);
      if (!itemId) {
        const added = graphql(ADD_ITEM_MUTATION, {
          projectId: project.id,
          contentId: issue.id,
        });
        itemId = added.addProjectV2ItemById.item.id;
      }

      const metadata = issueMetadata(issue, phaseByIssue);
      for (const fieldName of args.fields) {
        const value = metadata[fieldName];
        if (!value) {
          continue;
        }
        const field = fields.get(fieldName);
        if (!field) {
          throw new Error(`field ${fieldName} not found`);
        }
        try {
          updateField(project.id, itemId, field, value);
        } catch (error) {
          result.failures.push({
            issue_number: number,
            field: fieldName,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      result.processed_issue_numbers.push(number);
    } catch (error) {
      result.failures.push({
        issue_number: number,
        field: null,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

function selfTest() {
  const markdown = `### M0 - Foundation

- #49 Restructure
- #68 Matrix

### M4 - Release

- #85 Policy
`;
  const phaseByIssue = parseIssuePhaseMap(markdown);
  assert.equal(phaseByIssue.get(49), "M0 foundation");
  assert.equal(phaseByIssue.get(85), "M4 release hardening");

  const first = chunkPlan([49, 68, 85], 2);
  assert.deepEqual(first.selected, [49, 68]);
  assert.deepEqual(first.remaining, [85]);
  assert.equal(first.hasMore, true);

  const second = chunkPlan([49, 68, 85], 2, first.nextCursor);
  assert.deepEqual(second.selected, [85]);
  assert.deepEqual(second.remaining, []);
  assert.equal(second.hasMore, false);

  const metadata = issueMetadata(
    {
      number: 85,
      state: "OPEN",
      labels: [
        { name: "documentation" },
        { name: "kicad-compat" },
        { name: "priority:P1" },
      ],
    },
    phaseByIssue,
  );
  assert.deepEqual(metadata, {
    Product: "shared",
    Area: "docs",
    Priority: "P1",
    Phase: "M4 release hardening",
    Status: "Backlog",
    Risk: "medium",
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    selfTest();
    console.log("governance sync self-test passed");
    return;
  }
  const result = runSync(args);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result);
  }
  if (result.failures.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && SCRIPT_PATH === resolve(process.argv[1])) {
  main();
}
