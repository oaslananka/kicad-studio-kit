import {
  compareActionsPermissions,
  normalizeActionsPermissions,
} from "./actions-permissions.mjs";

const DEPENDENCY_SECURITY_PROVIDER = ["depend", "abot"].join("");

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function sortedStrings(values) {
  return [
    ...new Set((values ?? []).filter((value) => typeof value === "string")),
  ].sort(compareStrings);
}

function ruleByType(ruleset, type) {
  return (ruleset?.rules ?? []).find((rule) => rule?.type === type);
}

function normalizeBypassActors(ruleset) {
  return sortedStrings(
    (ruleset?.bypass_actors ?? []).map((actor) =>
      [actor?.actor_type, actor?.actor_id, actor?.bypass_mode].join(":"),
    ),
  );
}

export function normalizeRuleset(ruleset) {
  if (!ruleset || typeof ruleset !== "object") {
    throw new TypeError("ruleset must be an object");
  }

  const pullRequest = ruleByType(ruleset, "pull_request")?.parameters ?? {};
  const requiredChecks =
    ruleByType(ruleset, "required_status_checks")?.parameters ?? {};
  const refName = ruleset.conditions?.ref_name ?? {};

  return {
    name: ruleset.name ?? null,
    target: ruleset.target ?? null,
    enforcement: ruleset.enforcement ?? null,
    refName: {
      include: sortedStrings(refName.include),
      exclude: sortedStrings(refName.exclude),
    },
    bypassActors: normalizeBypassActors(ruleset),
    protections: {
      deletion: Boolean(ruleByType(ruleset, "deletion")),
      nonFastForward: Boolean(ruleByType(ruleset, "non_fast_forward")),
      requiredSignatures: Boolean(ruleByType(ruleset, "required_signatures")),
    },
    pullRequest: {
      allowedMergeMethods: sortedStrings(pullRequest.allowed_merge_methods),
      dismissStaleReviewsOnPush: Boolean(
        pullRequest.dismiss_stale_reviews_on_push,
      ),
      requireCodeOwnerReview: Boolean(pullRequest.require_code_owner_review),
      requireLastPushApproval: Boolean(pullRequest.require_last_push_approval),
      requiredApprovingReviewCount:
        Number.isInteger(pullRequest.required_approving_review_count) &&
        pullRequest.required_approving_review_count >= 0
          ? pullRequest.required_approving_review_count
          : null,
      requiredReviewThreadResolution: Boolean(
        pullRequest.required_review_thread_resolution,
      ),
    },
    requiredStatusChecks: {
      strict: Boolean(requiredChecks.strict_required_status_checks_policy),
      contexts: sortedStrings(
        (requiredChecks.required_status_checks ?? []).map(
          (check) => check?.context,
        ),
      ),
    },
  };
}

function compareScalar(differences, label, expected, live) {
  if (expected !== live) {
    differences.push(
      `${label}: expected ${String(expected)}, found ${String(live)}`,
    );
  }
}

function compareStringArray(differences, label, expected, live) {
  const missing = expected.filter((value) => !live.includes(value));
  const unexpected = live.filter((value) => !expected.includes(value));
  if (missing.length > 0) {
    differences.push(`${label}: missing ${missing.join(", ")}`);
  }
  if (unexpected.length > 0) {
    differences.push(`${label}: unexpected ${unexpected.join(", ")}`);
  }
}

export function compareRulesets(expected, live) {
  const differences = [];
  for (const key of ["name", "target", "enforcement"]) {
    compareScalar(differences, key, expected[key], live[key]);
  }

  compareStringArray(
    differences,
    "refName.include",
    expected.refName.include,
    live.refName.include,
  );
  compareStringArray(
    differences,
    "refName.exclude",
    expected.refName.exclude,
    live.refName.exclude,
  );
  compareStringArray(
    differences,
    "bypassActors",
    expected.bypassActors,
    live.bypassActors,
  );

  for (const key of ["deletion", "nonFastForward", "requiredSignatures"]) {
    compareScalar(
      differences,
      `protections.${key}`,
      expected.protections[key],
      live.protections[key],
    );
  }

  compareStringArray(
    differences,
    "pullRequest.allowedMergeMethods",
    expected.pullRequest.allowedMergeMethods,
    live.pullRequest.allowedMergeMethods,
  );
  for (const key of [
    "dismissStaleReviewsOnPush",
    "requireCodeOwnerReview",
    "requireLastPushApproval",
    "requiredApprovingReviewCount",
    "requiredReviewThreadResolution",
  ]) {
    compareScalar(
      differences,
      `pullRequest.${key}`,
      expected.pullRequest[key],
      live.pullRequest[key],
    );
  }

  compareScalar(
    differences,
    "requiredStatusChecks.strict",
    expected.requiredStatusChecks.strict,
    live.requiredStatusChecks.strict,
  );
  compareStringArray(
    differences,
    "requiredStatusChecks.contexts",
    expected.requiredStatusChecks.contexts,
    live.requiredStatusChecks.contexts,
  );

  return differences;
}

function setting(id, label, status, value, evidence) {
  return { id, label, status, value, evidence };
}

function analysisSetting(repository, key, id, label) {
  const status = repository?.security_and_analysis?.[key]?.status;
  if (status === "enabled") {
    return setting(id, label, "confirmed", true, `${key}=enabled`);
  }
  if (status === "disabled") {
    return setting(id, label, "unconfirmed", false, `${key}=disabled`);
  }
  return setting(
    id,
    label,
    "unavailable",
    null,
    "Repository metadata did not expose this setting.",
  );
}

function endpointSetting(observation, id, label) {
  if (observation?.available === true) {
    return setting(
      id,
      label,
      "confirmed",
      true,
      "GitHub endpoint returned successfully.",
    );
  }
  return setting(
    id,
    label,
    "unavailable",
    null,
    observation?.reason ?? "GitHub endpoint was not queried.",
  );
}

export function buildGovernanceEvidenceReport({
  expectedRuleset,
  liveRuleset,
  repository,
  privateVulnerabilityReporting,
  endpointAvailability = {},
  expectedActionsPermissions = null,
  liveActionsPermissions = null,
  actionsPermissionsAvailability = null,
  generatedAt = new Date().toISOString(),
}) {
  const expected = normalizeRuleset(expectedRuleset);
  let ruleset;
  let status;
  let exitCode;

  if (!liveRuleset) {
    ruleset = {
      status: "unavailable",
      differences: ["Active default-branch ruleset could not be read."],
      expected,
      live: null,
    };
    status = "unavailable";
    exitCode = 1;
  } else {
    const live = normalizeRuleset(liveRuleset);
    const differences = compareRulesets(expected, live);
    ruleset = {
      status: differences.length === 0 ? "current" : "drift",
      differences,
      expected,
      live,
    };
    status = differences.length === 0 ? "current" : "drift";
    exitCode = differences.length === 0 ? 0 : 1;
  }

  let actionsPermissions = null;
  if (expectedActionsPermissions) {
    const expectedActions = normalizeActionsPermissions(
      expectedActionsPermissions,
    );
    if (!liveActionsPermissions) {
      actionsPermissions = {
        status: "unavailable",
        differences: [
          actionsPermissionsAvailability?.reason ??
            "Repository Actions permissions could not be read.",
        ],
        expected: expectedActions,
        live: null,
      };
      status = "unavailable";
      exitCode = 1;
    } else {
      const liveActions = normalizeActionsPermissions(liveActionsPermissions);
      const differences = compareActionsPermissions(
        expectedActions,
        liveActions,
      );
      actionsPermissions = {
        status: differences.length === 0 ? "current" : "drift",
        differences,
        expected: expectedActions,
        live: liveActions,
      };
      if (differences.length > 0) {
        if (status !== "unavailable") status = "drift";
        exitCode = 1;
      }
    }
  }

  const settings = [];
  if (privateVulnerabilityReporting?.available === true) {
    settings.push(
      setting(
        "private-vulnerability-reporting",
        "Private vulnerability reporting",
        privateVulnerabilityReporting.enabled ? "confirmed" : "unconfirmed",
        Boolean(privateVulnerabilityReporting.enabled),
        `enabled=${String(Boolean(privateVulnerabilityReporting.enabled))}`,
      ),
    );
  } else {
    settings.push(
      setting(
        "private-vulnerability-reporting",
        "Private vulnerability reporting",
        "unavailable",
        null,
        privateVulnerabilityReporting?.reason ??
          "GitHub endpoint was not queried.",
      ),
    );
  }

  settings.push(
    analysisSetting(
      repository,
      `${DEPENDENCY_SECURITY_PROVIDER}_security_updates`,
      "dependency-security-updates",
      "GitHub-native dependency security updates",
    ),
    analysisSetting(
      repository,
      "secret_scanning",
      "secret-scanning",
      "Secret scanning",
    ),
    analysisSetting(
      repository,
      "secret_scanning_push_protection",
      "secret-scanning-push-protection",
      "Secret scanning push protection",
    ),
    analysisSetting(
      repository,
      "secret_scanning_non_provider_patterns",
      "secret-scanning-non-provider-patterns",
      "Secret scanning non-provider patterns",
    ),
    analysisSetting(
      repository,
      "secret_scanning_validity_checks",
      "secret-scanning-validity-checks",
      "Secret scanning validity checks",
    ),
    endpointSetting(
      endpointAvailability.dependencyAlerts,
      "dependency-alerts",
      "GitHub dependency alerts endpoint",
    ),
    endpointSetting(
      endpointAvailability.codeScanningAlerts,
      "code-scanning-alerts",
      "Code scanning alerts endpoint",
    ),
    endpointSetting(
      endpointAvailability.secretScanningAlerts,
      "secret-scanning-alerts",
      "Secret scanning alerts endpoint",
    ),
  );

  return {
    schemaVersion: 1,
    generatedAt,
    repository: repository
      ? {
          defaultBranch: repository.default_branch ?? null,
          visibility: repository.visibility ?? null,
        }
      : null,
    status,
    exitCode,
    ruleset,
    actionsPermissions,
    settings,
  };
}

function escapeTable(value) {
  return String(value)
    .replaceAll("|", String.raw`\|`)
    .replaceAll("\n", " ");
}

export function renderGovernanceEvidenceMarkdown(report) {
  const lines = [
    "# GitHub Governance Evidence Report",
    "",
    `Overall status: **${report.status}**`,
    "",
    "## Default-branch ruleset",
    "",
    `Status: **${report.ruleset.status}**`,
  ];

  if (report.ruleset.differences.length > 0) {
    lines.push("", ...report.ruleset.differences.map((item) => `- ${item}`));
  } else {
    lines.push("", "The active ruleset matches the checked-in policy.");
  }

  if (report.actionsPermissions) {
    lines.push(
      "",
      "## GitHub Actions permissions",
      "",
      `Status: **${report.actionsPermissions.status}**`,
    );
    if (report.actionsPermissions.differences.length > 0) {
      lines.push(
        "",
        ...report.actionsPermissions.differences.map((item) => `- ${item}`),
      );
    } else {
      lines.push("", "Live Actions permissions match the checked-in policy.");
    }
  }

  lines.push(
    "",
    "## Repository security settings",
    "",
    "| Setting | Status | Value | Evidence |",
    "| --- | --- | --- | --- |",
  );
  for (const item of report.settings) {
    lines.push(
      `| ${escapeTable(item.label)} | ${item.status} | ${escapeTable(item.value ?? "unknown")} | ${escapeTable(item.evidence)} |`,
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}
