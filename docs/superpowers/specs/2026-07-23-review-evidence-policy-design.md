# Review Evidence Policy Design

## Goal

Make pull-request review evidence truthful when an automated reviewer completes, reports no findings, is unavailable, or is not applicable, without making an external service or an independent approval mandatory for the solo-maintainer workflow.

## Decision

Use a repository-owned evidence contract rather than a live vendor-dependent review gate. The pull-request template records one automated-review outcome, change risk, comment triage, and any compensating evidence. A deterministic Node policy library classifies representative bot/agent artifacts and validates evidence fixtures. The root quality gate verifies the template, documentation, package scripts, CI wiring, and historical fixture outcomes.

## Outcome model

The automated-review outcome is exactly one of:

- `completed-findings`: a reviewer completed and returned one or more findings;
- `completed-no-findings`: a reviewer completed and explicitly returned no findings;
- `unavailable`: a requested reviewer returned quota, rate-limit, capacity, authentication, or service-unavailable text instead of a code review, or an explicit reason records that no automated reviewer is configured/available;
- `not-applicable`: automated review was not requested because the change is outside the configured review scope;
- `missing`: review was applicable/requested but no completed or unavailable artifact exists.

Unavailable notices never count as completed review.

## Triage model

Every bot or agent artifact must be classified as one of:

- `actionable`
- `resolved`
- `informational`
- `duplicate`
- `unavailable`

Merge-ready evidence cannot retain an `actionable` artifact. A finding becomes `resolved` only after the fix or accepted disposition is documented.

## Risk and fallback

Risk is `low`, `medium`, or `high`. When automated review is unavailable for a medium- or high-risk change, at least one referenced compensating path is required:

- focused second-agent review;
- architecture/security checklist;
- additional regression tests;
- documented manual review.

Low-risk changes may record the unavailable outcome and rationale without a compensating path. Not-applicable outcomes require a reason.

## Components

- `.github/PULL_REQUEST_TEMPLATE.md`: concise evidence form.
- `docs/architecture/review-evidence-policy.md`: public vendor-neutral policy and solo-maintainer exception.
- `scripts/lib/review-evidence.mjs`: pure classification and validation functions.
- `scripts/check-review-evidence.mjs`: repository-surface validator and fixture dry-run CLI.
- `scripts/fixtures/review-evidence/*.json`: sanitized representative comment/review sets.
- `scripts/check-review-evidence.test.mjs`: policy, classifier, and negative regression tests.
- `package.json` and `.github/workflows/ci.yml`: root and metadata gate wiring.

## Error handling

Unknown outcomes, risk levels, triage classifications, or compensating types fail closed. Missing artifact triage, outcome/classifier disagreement, unresolved actionable findings, stale triage IDs, and absent medium/high-risk fallback evidence are errors. Fixture errors are reported together so maintainers can correct all drift in one pass.

## Testing

Tests cover completed-with-findings, completed-no-findings, unavailable with valid compensation, unavailable without compensation, not-applicable, missing review, stale triage, and quota/capacity text that must never classify as completed. The CLI dry-runs every checked-in fixture and the root gate verifies all public policy surfaces.
