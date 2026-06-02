import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_ROOT, "..");

const ZERO_SHA = /^0{40}$/u;

const LANE_DEFINITIONS = [
  {
    key: "metadata",
    label: "Metadata and policy",
    output: "metadata",
  },
  {
    key: "vscodeExtension",
    label: "VS Code extension",
    output: "vscode_extension",
  },
  {
    key: "mcpServer",
    label: "MCP server",
    output: "mcp_server",
  },
  {
    key: "sharedPackages",
    label: "Shared packages",
    output: "shared_packages",
  },
  {
    key: "integrationContracts",
    label: "Integration contracts",
    output: "integration_contracts",
  },
  {
    key: "performanceBudgets",
    label: "Performance budgets",
    output: "performance_budgets",
  },
  {
    key: "realPairCompatibility",
    label: "Real-pair compatibility",
    output: "real_pair_compatibility",
  },
  {
    key: "crossRepoCompatibility",
    label: "Cross-repo compatibility canary",
    output: "cross_repo_compatibility",
  },
];

const GLOBAL_ALL_FILES = new Set([
  ".github/workflows/ci.yml",
  ".node-version",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "uv.lock",
  "uv.toml",
]);

const RELEASE_AND_COMPATIBILITY_FILES = new Set([
  ".release-please-manifest.json",
  "compatibility.yaml",
  "release-please-config.json",
]);

const EXTENSION_PREFIXES = ["apps/vscode-extension/", "apps/kicad-studio/"];
const MCP_SERVER_PREFIXES = ["packages/mcp-server/", "apps/kicad-mcp-pro/"];

const SHARED_PREFIXES = ["packages/kicad-fixtures/", "packages/test-harness/"];
const CI_POLICY_PREFIXES = ["scripts/", ".github/"];
const DOC_PREFIXES = [
  "docs/",
  "README.md",
  "CONTRIBUTING.md",
  "AGENTS.md",
  "CLAUDE.md",
  ".github/copilot-instructions.md",
  "examples/mcp-clients/",
];

const EXTENSION_INTEGRATION_PREFIXES = [
  "apps/vscode-extension/src/mcp/",
  "apps/vscode-extension/src/commands/mcp",
  "apps/vscode-extension/src/lm/",
  "apps/vscode-extension/test/integration/",
  "apps/vscode-extension/test/e2e/",
];

const MCP_INTEGRATION_PREFIXES = [
  "packages/mcp-server/src/",
  "packages/mcp-server/tests/unit/test_mcp",
  "packages/mcp-server/tests/integration/",
  "packages/mcp-server/tests/e2e/",
  "packages/mcp-server/mcp.json",
  "packages/mcp-server/server.json",
];

function normalizeChangedFile(file) {
  return file.trim().replaceAll("\\", "/").replace(/^\.\//u, "");
}

function matchesPrefix(file, prefixes) {
  return prefixes.some(
    (prefix) => file === prefix.replace(/\/$/u, "") || file.startsWith(prefix),
  );
}

function addReason(reasons, key, reason) {
  if (!reasons[key].includes(reason)) {
    reasons[key].push(reason);
  }
}

function createInitialReasons() {
  return Object.fromEntries(LANE_DEFINITIONS.map((lane) => [lane.key, []]));
}

function markAllProductLanes(reasons, reason) {
  for (const lane of [
    "vscodeExtension",
    "mcpServer",
    "sharedPackages",
    "integrationContracts",
    "performanceBudgets",
    "realPairCompatibility",
    "crossRepoCompatibility",
  ]) {
    addReason(reasons, lane, reason);
  }
}

function isDocumentationOnlyPath(file) {
  return DOC_PREFIXES.some((entry) => file === entry || file.startsWith(entry));
}

function classifyChangedFiles(changedFiles, options = {}) {
  const normalizedFiles = [
    ...new Set(changedFiles.map(normalizeChangedFile).filter(Boolean)),
  ].sort();
  const reasons = createInitialReasons();

  addReason(
    reasons,
    "metadata",
    "Always runs to validate repository policy, versions, and CI lane decisions.",
  );

  if (options.forceAll) {
    markAllProductLanes(
      reasons,
      options.forceAllReason ??
        "Manual or scheduled run executes all CI lanes.",
    );
  }

  for (const file of normalizedFiles) {
    if (GLOBAL_ALL_FILES.has(file)) {
      markAllProductLanes(
        reasons,
        `${file} affects root toolchain or the CI workflow definition.`,
      );
      continue;
    }

    if (RELEASE_AND_COMPATIBILITY_FILES.has(file)) {
      addReason(
        reasons,
        "mcpServer",
        `${file} affects compatibility or release metadata.`,
      );
      addReason(
        reasons,
        "sharedPackages",
        `${file} affects shared compatibility validation.`,
      );
      addReason(
        reasons,
        "integrationContracts",
        `${file} affects cross-product contract validation.`,
      );
      addReason(
        reasons,
        "realPairCompatibility",
        `${file} affects cross-product runtime compatibility.`,
      );
      addReason(
        reasons,
        "crossRepoCompatibility",
        `${file} affects cross-product compatibility metadata.`,
      );
      continue;
    }

    if (matchesPrefix(file, EXTENSION_PREFIXES)) {
      addReason(
        reasons,
        "vscodeExtension",
        `${file} is owned by the VS Code extension.`,
      );
      addReason(
        reasons,
        "performanceBudgets",
        `${file} may affect extension performance baselines.`,
      );
      if (matchesPrefix(file, EXTENSION_INTEGRATION_PREFIXES)) {
        addReason(
          reasons,
          "integrationContracts",
          `${file} touches extension MCP/integration code.`,
        );
        addReason(
          reasons,
          "realPairCompatibility",
          `${file} touches extension MCP/integration code.`,
        );
      }
      continue;
    }

    if (matchesPrefix(file, MCP_SERVER_PREFIXES)) {
      addReason(reasons, "mcpServer", `${file} is owned by kicad-mcp-pro.`);
      addReason(
        reasons,
        "performanceBudgets",
        `${file} may affect MCP performance baselines.`,
      );
      if (matchesPrefix(file, MCP_INTEGRATION_PREFIXES)) {
        addReason(
          reasons,
          "integrationContracts",
          `${file} touches MCP protocol/runtime code.`,
        );
        addReason(
          reasons,
          "realPairCompatibility",
          `${file} touches MCP protocol/runtime code.`,
        );
      }
      continue;
    }

    if (matchesPrefix(file, SHARED_PREFIXES)) {
      addReason(
        reasons,
        "sharedPackages",
        `${file} is shared test/schema/fixture infrastructure.`,
      );
      addReason(
        reasons,
        "vscodeExtension",
        `${file} must remain compatible with the extension.`,
      );
      addReason(
        reasons,
        "mcpServer",
        `${file} must remain compatible with kicad-mcp-pro.`,
      );
      addReason(
        reasons,
        "integrationContracts",
        `${file} requires cross-product contract validation.`,
      );
      addReason(
        reasons,
        "realPairCompatibility",
        `${file} requires cross-product runtime validation.`,
      );
      addReason(
        reasons,
        "performanceBudgets",
        `${file} can affect shared performance fixtures.`,
      );
      continue;
    }

    if (
      matchesPrefix(file, CI_POLICY_PREFIXES) &&
      !isDocumentationOnlyPath(file)
    ) {
      addReason(
        reasons,
        "integrationContracts",
        `${file} affects repository CI or policy wiring.`,
      );
      if (file.startsWith(".github/workflows/")) {
        markAllProductLanes(
          reasons,
          `${file} is a workflow change and needs full CI validation.`,
        );
      }
      if (
        file === ".github/workflows/cross-repo-compatibility.yml" ||
        file === "scripts/check-cross-repo-compatibility.mjs"
      ) {
        addReason(
          reasons,
          "crossRepoCompatibility",
          `${file} is part of the cross-repo compatibility canary.`,
        );
      }
    }
  }

  const lanes = Object.fromEntries(
    LANE_DEFINITIONS.map((lane) => [lane.key, reasons[lane.key].length > 0]),
  );

  return {
    changedFiles: normalizedFiles,
    lanes,
    reasons,
  };
}

function gitDiffNames(range, cwd = REPO_ROOT) {
  const output = execFileSync("git", ["diff", "--name-only", range], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return output.split(/\r?\n/u).filter(Boolean);
}

function changedFilesFromGit(options = {}) {
  const eventName = options.eventName ?? process.env.GITHUB_EVENT_NAME ?? "";
  const before = options.before ?? process.env.GITHUB_EVENT_BEFORE ?? "";
  const sha = options.sha ?? process.env.GITHUB_SHA ?? "HEAD";
  const baseSha = options.baseSha ?? process.env.GITHUB_BASE_SHA ?? "";
  const headSha = options.headSha ?? process.env.GITHUB_HEAD_SHA ?? "HEAD";

  if (eventName === "workflow_dispatch" || eventName === "schedule") {
    return {
      changedFiles: [],
      forceAll: true,
      reason: `${eventName} runs all CI lanes.`,
    };
  }

  if (eventName === "pull_request" || eventName === "pull_request_target") {
    if (!baseSha) {
      return {
        changedFiles: [],
        forceAll: true,
        reason: "Pull request base SHA is unavailable, so all CI lanes run.",
      };
    }

    const headCandidates = [headSha, "HEAD"].filter(Boolean);
    let lastError;
    for (const candidate of headCandidates) {
      try {
        return {
          changedFiles: gitDiffNames(`${baseSha}...${candidate}`, options.cwd),
          forceAll: false,
          reason: `Diffed pull request range ${baseSha}...${candidate}.`,
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  if (eventName === "push") {
    if (!before || ZERO_SHA.test(before)) {
      return {
        changedFiles: [],
        forceAll: true,
        reason: "Push has no usable before SHA, so all CI lanes run.",
      };
    }
    return {
      changedFiles: gitDiffNames(`${before}..${sha}`, options.cwd),
      forceAll: false,
      reason: `Diffed push range ${before}..${sha}.`,
    };
  }

  return {
    changedFiles: [],
    forceAll: true,
    reason: "Unknown or local event context, so all CI lanes run.",
  };
}

function laneStatus(report, lane) {
  return report.lanes[lane.key] ? "run" : "skipped";
}

function laneReason(report, lane) {
  if (report.reasons[lane.key].length > 0) {
    return report.reasons[lane.key].join("<br>");
  }
  return "No changed file matched this lane's trigger set.";
}

function formatMarkdownSummary(report) {
  const lines = [
    "## CI Lane Selection",
    "",
    `Changed files considered: ${report.changedFiles.length}`,
    "",
    "| Lane | Decision | Reason |",
    "| --- | --- | --- |",
  ];

  for (const lane of LANE_DEFINITIONS) {
    lines.push(
      `| ${lane.label} | ${laneStatus(report, lane)} | ${laneReason(report, lane)} |`,
    );
  }

  if (report.changedFiles.length > 0) {
    lines.push("", "<details><summary>Changed files</summary>", "");
    for (const file of report.changedFiles) {
      lines.push(`- \`${file}\``);
    }
    lines.push("", "</details>");
  }

  return `${lines.join("\n")}\n`;
}

function outputsForReport(report) {
  const outputs = {};
  for (const lane of LANE_DEFINITIONS) {
    outputs[lane.output] = String(report.lanes[lane.key]);
  }
  outputs.changed_file_count = String(report.changedFiles.length);
  outputs.run_all = String(
    LANE_DEFINITIONS.every(
      (lane) => lane.key === "metadata" || report.lanes[lane.key],
    ),
  );
  return outputs;
}

function appendGithubOutputs(report, outputPath = process.env.GITHUB_OUTPUT) {
  if (!outputPath) return;
  const lines = Object.entries(outputsForReport(report)).map(
    ([key, value]) => `${key}=${value}`,
  );
  fs.appendFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
}

function appendGithubSummary(
  report,
  summaryPath = process.env.GITHUB_STEP_SUMMARY,
) {
  if (!summaryPath) return;
  fs.appendFileSync(summaryPath, formatMarkdownSummary(report), "utf8");
}

function parseCliArgs(argv) {
  const options = {
    changedFiles: [],
    githubOutput: false,
    json: false,
    summary: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base") {
      options.baseSha = argv[++index];
    } else if (arg === "--head") {
      options.headSha = argv[++index];
    } else if (arg === "--before") {
      options.before = argv[++index];
    } else if (arg === "--sha") {
      options.sha = argv[++index];
    } else if (arg === "--event") {
      options.eventName = argv[++index];
    } else if (arg === "--github-output") {
      options.githubOutput = true;
    } else if (arg === "--summary") {
      options.summary = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--all") {
      options.forceAll = true;
      options.forceAllReason = "Explicit --all flag requested all CI lanes.";
    } else if (arg === "--files") {
      while (argv[index + 1] && !argv[index + 1].startsWith("--")) {
        options.changedFiles.push(argv[++index]);
      }
    } else {
      options.changedFiles.push(arg);
    }
  }

  return options;
}

function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const source =
    options.changedFiles.length > 0 || options.forceAll
      ? {
          changedFiles: options.changedFiles,
          forceAll: Boolean(options.forceAll),
          reason: options.forceAllReason,
        }
      : changedFilesFromGit(options);

  const report = classifyChangedFiles(source.changedFiles, {
    forceAll: source.forceAll,
    forceAllReason: source.reason,
  });

  if (options.githubOutput) {
    appendGithubOutputs(report);
  }
  if (options.summary) {
    appendGithubSummary(report);
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else if (!options.githubOutput && !options.summary) {
    process.stdout.write(formatMarkdownSummary(report));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export {
  classifyChangedFiles,
  formatMarkdownSummary,
  outputsForReport,
  changedFilesFromGit,
};
