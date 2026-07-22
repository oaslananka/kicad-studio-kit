export const REVIEW_OUTCOMES = Object.freeze([
  "completed-findings",
  "completed-no-findings",
  "unavailable",
  "not-applicable",
  "missing",
]);

export const REVIEW_RISKS = Object.freeze(["low", "medium", "high"]);

export const TRIAGE_CLASSIFICATIONS = Object.freeze([
  "actionable",
  "resolved",
  "informational",
  "duplicate",
  "unavailable",
]);

export const COMPENSATING_EVIDENCE_TYPES = Object.freeze([
  "focused-second-agent-review",
  "architecture-security-checklist",
  "additional-regression-tests",
  "documented-manual-review",
]);

const UNAVAILABLE_PATTERNS = [
  /quota/u,
  /rate[ -]?limit/u,
  /at capacity/u,
  /service unavailable/u,
  /temporarily unavailable/u,
  /authentication failed/u,
  /could not be performed/u,
  /no (?:code )?review was performed/u,
  /review (?:could not|cannot|was not) (?:be )?(?:completed|performed|started)/u,
];

const NO_FINDINGS_PATTERNS = [
  /no findings/u,
  /no issues found/u,
  /nothing to report/u,
  /looks good/u,
];

function normalizedBody(artifact) {
  return String(artifact?.body ?? "").toLowerCase();
}

export function isUnavailableReviewArtifact(artifact) {
  const body = normalizedBody(artifact);
  return UNAVAILABLE_PATTERNS.some((pattern) => pattern.test(body));
}

function isCompletedWithFindings(artifact) {
  if (isUnavailableReviewArtifact(artifact)) {
    return false;
  }
  return (
    Number(artifact?.findingsCount) > 0 ||
    String(artifact?.state ?? "").toUpperCase() === "CHANGES_REQUESTED"
  );
}

function isCompletedWithNoFindings(artifact) {
  if (isUnavailableReviewArtifact(artifact)) {
    return false;
  }
  const state = String(artifact?.state ?? "").toUpperCase();
  const body = normalizedBody(artifact);
  return (
    artifact?.findingsCount === 0 ||
    state === "APPROVED" ||
    NO_FINDINGS_PATTERNS.some((pattern) => pattern.test(body))
  );
}

function isAutomatedReviewerArtifact(artifact) {
  return (
    artifact?.reviewRole === "automated-reviewer" ||
    artifact?.actorType === "agent" ||
    (artifact?.actorType === "bot" && artifact?.kind === "review")
  );
}

export function classifyReviewArtifacts(input) {
  if (input?.applicable === false) {
    return "not-applicable";
  }

  const artifacts = (
    Array.isArray(input?.artifacts) ? input.artifacts : []
  ).filter(isAutomatedReviewerArtifact);
  if (artifacts.some(isCompletedWithFindings)) {
    return "completed-findings";
  }
  if (artifacts.some(isCompletedWithNoFindings)) {
    return "completed-no-findings";
  }
  if (artifacts.some(isUnavailableReviewArtifact)) {
    return "unavailable";
  }
  return "missing";
}

function pushWhenInvalid(errors, condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function validateCompensatingEvidence(input, outcome, errors) {
  const evidence = Array.isArray(input?.compensatingEvidence)
    ? input.compensatingEvidence
    : [];
  for (const item of evidence) {
    pushWhenInvalid(
      errors,
      COMPENSATING_EVIDENCE_TYPES.includes(item?.type),
      `unsupported compensating evidence type ${item?.type}`,
    );
    pushWhenInvalid(
      errors,
      typeof item?.reference === "string" && item.reference.trim().length > 0,
      `compensating evidence ${item?.type} requires a reference`,
    );
  }

  if (outcome === "unavailable" && ["medium", "high"].includes(input?.risk)) {
    pushWhenInvalid(
      errors,
      evidence.some(
        (item) =>
          COMPENSATING_EVIDENCE_TYPES.includes(item?.type) &&
          typeof item?.reference === "string" &&
          item.reference.trim().length > 0,
      ),
      "medium/high-risk unavailable review requires compensating review evidence",
    );
  }
}

function validateTriage(input, errors) {
  const artifacts = Array.isArray(input?.artifacts) ? input.artifacts : [];
  const reviewArtifacts = artifacts.filter((artifact) =>
    ["bot", "agent"].includes(artifact?.actorType),
  );
  const triage = Array.isArray(input?.triage) ? input.triage : [];
  const artifactIds = new Set();
  for (const artifact of reviewArtifacts) {
    pushWhenInvalid(
      errors,
      typeof artifact?.id === "string" && artifact.id.trim().length > 0,
      "bot/agent artifact requires a non-empty id",
    );
    if (artifactIds.has(artifact?.id)) {
      errors.push(`duplicate artifact id ${artifact?.id}`);
    }
    artifactIds.add(artifact?.id);
  }
  const triageByArtifact = new Map();

  for (const entry of triage) {
    pushWhenInvalid(
      errors,
      artifactIds.has(entry?.artifactId),
      `stale triage entry ${entry?.artifactId}`,
    );
    pushWhenInvalid(
      errors,
      TRIAGE_CLASSIFICATIONS.includes(entry?.classification),
      `unsupported triage classification ${entry?.classification}`,
    );
    pushWhenInvalid(
      errors,
      typeof entry?.resolution === "string" &&
        entry.resolution.trim().length > 0,
      `triage entry ${entry?.artifactId} requires a resolution note`,
    );
    if (triageByArtifact.has(entry?.artifactId)) {
      errors.push(`duplicate triage entry ${entry?.artifactId}`);
    }
    triageByArtifact.set(entry?.artifactId, entry);
  }

  for (const artifact of reviewArtifacts) {
    const entry = triageByArtifact.get(artifact.id);
    pushWhenInvalid(
      errors,
      Boolean(entry),
      `missing triage for ${artifact.id}`,
    );
    if (!entry) {
      continue;
    }
    pushWhenInvalid(
      errors,
      entry.classification !== "actionable",
      `artifact ${artifact.id} remains actionable`,
    );
    if (isUnavailableReviewArtifact(artifact)) {
      pushWhenInvalid(
        errors,
        entry.classification === "unavailable",
        `unavailable artifact ${artifact.id} must be classified as unavailable`,
      );
    }
    if (isCompletedWithFindings(artifact)) {
      pushWhenInvalid(
        errors,
        ["resolved", "duplicate"].includes(entry.classification),
        `finding artifact ${artifact.id} must be resolved or duplicate before merge`,
      );
    }
  }
}

export function validateReviewEvidence(input) {
  const errors = [];
  const outcome = classifyReviewArtifacts(input);

  pushWhenInvalid(
    errors,
    REVIEW_RISKS.includes(input?.risk),
    `unsupported review risk ${input?.risk}`,
  );
  pushWhenInvalid(
    errors,
    REVIEW_OUTCOMES.includes(input?.declaredOutcome),
    `unsupported declared review outcome ${input?.declaredOutcome}`,
  );
  pushWhenInvalid(
    errors,
    input?.declaredOutcome === outcome,
    `declared review outcome ${input?.declaredOutcome} does not match classified outcome ${outcome}`,
  );

  if (outcome === "not-applicable") {
    pushWhenInvalid(
      errors,
      typeof input?.notApplicableReason === "string" &&
        input.notApplicableReason.trim().length > 0,
      "not-applicable review outcome requires a reason",
    );
  }
  if (outcome === "missing") {
    errors.push("review outcome is missing");
  }

  validateTriage(input, errors);
  validateCompensatingEvidence(input, outcome, errors);
  return errors;
}
