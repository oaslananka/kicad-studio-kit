function compareScalar(differences, label, expected, live) {
  if (expected !== live) {
    differences.push(
      `${label}: expected ${String(expected)}, found ${String(live)}`,
    );
  }
}

export function normalizeActionsPermissions(value) {
  return {
    defaultWorkflowPermissions:
      value?.default_workflow_permissions ??
      value?.defaultWorkflowPermissions ??
      null,
    canApprovePullRequestReviews:
      value?.can_approve_pull_request_reviews ??
      value?.canApprovePullRequestReviews ??
      null,
    allowedActions: value?.allowed_actions ?? value?.allowedActions ?? null,
    shaPinningRequired:
      value?.sha_pinning_required ?? value?.shaPinningRequired ?? null,
  };
}

export function compareActionsPermissions(expected, live) {
  const differences = [];
  for (const key of [
    "defaultWorkflowPermissions",
    "canApprovePullRequestReviews",
    "allowedActions",
    "shaPinningRequired",
  ]) {
    compareScalar(differences, key, expected?.[key], live?.[key]);
  }
  return differences;
}
