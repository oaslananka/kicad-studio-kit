# Issue 495 Live Governance Evidence Design

## Goal

Keep repository maturity, branch ruleset, and GitHub security-setting evidence aligned with live GitHub state without making normal pull-request validation depend on network access.

## Decision

Use two evidence layers:

1. **Deterministic repository policy** continues to compare `.github/rulesets/main.json` with `docs/architecture/branch-protection.md`. It also verifies that the governance evidence workflow is present, SHA-pinned, least privilege, and scheduled/manual.
2. **Live governance evidence** runs only in a scheduled/manual workflow. It reads the active GitHub ruleset and repository security settings, compares enforceable rules with the checked-in ruleset, and emits JSON plus Markdown.

Live ruleset drift is a workflow failure. Security settings are represented as `confirmed`, `unconfirmed`, or `unavailable`; an unavailable endpoint is never guessed as enabled or disabled.

## Pure interfaces

`scripts/lib/github-governance-evidence.mjs` owns normalization and comparison:

- `normalizeRuleset(ruleset) -> NormalizedRuleset`
- `compareRulesets(expected, live) -> string[]`
- `buildGovernanceEvidenceReport(input) -> GovernanceEvidenceReport`
- `renderGovernanceEvidenceMarkdown(report) -> string`

`scripts/check-github-governance-evidence.mjs` owns repository I/O, authenticated GitHub REST requests, report output, and exit status.

## Ruleset semantics

The report compares:

- active enforcement for the default branch;
- deletion and non-fast-forward protection;
- required commit signatures;
- pull-request approval count, CODEOWNERS review, last-push approval, stale-review dismissal, and thread resolution;
- strict required status checks and their exact contexts.

The live ruleset already requires `dependency-review`; the checked-in ruleset and policy document will be updated to match that active state.

## Security settings

The report observes without changing:

- private vulnerability reporting;
- GitHub-native dependency security updates and alert endpoint availability;
- secret scanning and push protection;
- optional non-provider patterns and validity checks;
- code-scanning and secret-scanning alert endpoint availability.

The report never includes alert payloads, secret values, or authentication details.

## Workflow

`.github/workflows/governance-evidence.yml` runs weekly and manually with `contents: read`. It executes the checker with the repository-scoped `GITHUB_TOKEN`, appends Markdown to `$GITHUB_STEP_SUMMARY`, and uploads the JSON report.

## Documentation

Point-in-time documents carry an exact audit date. The maturity report will distinguish ruleset-based protection from the legacy branch-protection endpoint, which can return `404 Branch not protected` even while an active repository ruleset protects the default branch.

## Orphan branch resolution

`automation/auto-assign-incoming` is deleted because PR #479 was explicitly closed as stale and not being carried forward. The closed PR and unsigned commit remain as historical evidence.

## Non-goals

- Claiming Gold or foundation-grade maturity.
- Weakening the active ruleset.
- Auto-editing GitHub settings from CI.
- Treating unavailable GitHub API evidence as confirmation.
