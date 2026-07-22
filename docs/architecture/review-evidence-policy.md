# Review Evidence Policy

This policy keeps pull-request review evidence truthful when an automated reviewer completes, returns no findings, is unavailable, or does not apply. It is vendor-neutral: repository evidence describes what actually happened rather than promising that any external review service will always be available.

## Automated-review outcomes

Select exactly one outcome in the pull-request template:

| Outcome                 | Meaning                                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `completed-findings`    | An automated reviewer completed and returned one or more findings. Every finding must be triaged before merge.                                     |
| `completed-no-findings` | An automated reviewer completed and explicitly returned no findings.                                                                               |
| `unavailable`           | A requested reviewer returned an availability, quota, rate-limit, capacity, authentication, or equivalent service notice instead of a code review. |
| `not-applicable`        | Automated review is outside the configured scope for this change. The PR must include a reason.                                                    |
| `missing`               | Review was applicable or requested, but neither a completed review nor an unavailable notice exists. This is not merge-ready evidence.             |

Availability, quota, rate-limit, and capacity notices are not completed reviews. A message that says a review could not start or complete must be recorded as `unavailable`, even when other specialist scanners pass.

## Risk

Classify the change as `low`, `medium`, or `high` in the pull-request template. Consider runtime behavior, security/trust boundaries, protocol or compatibility changes, release permissions, supply-chain configuration, and the blast radius of failure.

## Bot and agent triage

Every bot and agent comment, review, and inline finding must receive one final classification:

- `actionable`: requires a code, test, documentation, or policy change;
- `resolved`: the actionable finding was fixed or dispositioned with evidence;
- `informational`: useful status or context with no requested change;
- `duplicate`: repeats another artifact whose disposition is already recorded;
- `unavailable`: reports reviewer/service unavailability and contains no code-review result.

A merge-ready PR cannot retain an `actionable` classification. Unavailable reviewer messages must be classified as `unavailable`, not `informational` and not completed review.

## Compensating review evidence

When automated review is `unavailable` for a medium- or high-risk change, record at least one referenced compensating path:

- `focused-second-agent-review`: a separate focused reviewer examines the final head;
- `architecture-security-checklist`: the relevant architecture, protocol, security, release, or permissions checklist is completed;
- `additional-regression-tests`: focused tests are added beyond the normal minimum to cover the review risk;
- `documented-manual-review`: a final-head diff review records scope, high-risk boundaries, checks, bot/agent dispositions, and unresolved-thread status.

Low-risk changes may record the unavailable outcome and a short rationale without adding a compensating path. A `not-applicable` outcome always requires a reason.

## Solo-maintainer exception

The repository currently follows a solo-maintainer operating model. This policy does not introduce an independent approval requirement that would deadlock maintenance. The maintainer may provide documented manual review or another compensating path, but required checks, signed commits, branch rules, and review-thread resolution remain mandatory.

An independent reviewer remains welcome when available. Their absence must be described honestly and cannot be replaced by marking an unavailable service notice as completed review.

## Repository gate and fixtures

The repository-owned validator checks the template, this policy, governance links, package scripts, CI wiring, and sanitized historical comment/review fixtures. Run:

```bash
corepack pnpm run check:review-evidence
```

The fixtures cover completed findings, completed no-findings, unavailable review with and without required compensation, not-applicable review, and missing review. The classifier gives completed review priority only to actual reviewer artifacts; specialist bot status comments remain subject to triage but do not satisfy automated code review.

This gate validates the evidence contract. It deliberately does not make external service availability a required status check.
