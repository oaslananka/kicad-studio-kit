## Summary

<!-- What changed and why -->

## Linked issue

Closes #

## Type of change

- [ ] type:bug
- [ ] type:feature
- [ ] type:docs
- [ ] type:refactor
- [ ] type:perf
- [ ] type:security
- [ ] type:chore
- [ ] breaking

## Test evidence

<!-- Commands run + brief result -->
<!-- For bug fixes, name the regression test that fails before the fix and passes after it. -->

## Protocol / MCP impact

Complete this section when the PR changes MCP tool names, tool schemas,
capability metadata, transport behavior, server-info payloads, compatibility
metadata, or extension adapter behavior. For non-protocol PRs, mark it not
applicable and state why.

Checklist reference: `docs/architecture/protocol-change-checklist.md`

- [ ] Not applicable; reason:
- [ ] Protocol schema updated
- [ ] MCP server implementation updated
- [ ] Extension MCP adapter updated
- [ ] Contract tests updated
- [ ] Compatibility matrix updated
- [ ] Server-info/capabilities payload updated
- [ ] Docs updated
- [ ] Release notes considered for both products
- [ ] Backward compatibility impact documented

## Repository maturity impact

- [ ] No repository maturity impact
- [ ] Documentation/community health updated
- [ ] CI/quality/release process updated
- [ ] Governance/security/supply-chain process updated
- [ ] Manual GitHub setting or maintainer action required and documented

## Automation evidence

- [ ] Review-thread gate checked or not applicable
- [ ] Draft PR kept draft until cheap gates are clean
- [ ] No publish workflow was triggered
- [ ] No secrets were printed or changed

## Review evidence

An availability, quota, rate-limit, or capacity notice is not a completed review.

Select exactly one automated-review outcome:

- [ ] Completed with findings; every finding is triaged below
- [ ] Completed with no findings
- [ ] Unavailable; compensating evidence recorded below
- [ ] Not applicable; reason:

Select exactly one change risk:

- [ ] Low
- [ ] Medium
- [ ] High

Bot and agent triage:

- [ ] Every bot and agent comment is classified as actionable, resolved, informational, duplicate, or unavailable
- [ ] No actionable finding remains unresolved
- [ ] Unavailable notices are recorded as unavailable, not completed review

Compensating evidence (required when automated review is unavailable for medium/high-risk changes):

- [ ] Focused second-agent review
- [ ] Architecture/security checklist
- [ ] Additional regression tests
- [ ] Documented manual review
- [ ] Not required because review completed, was not applicable, or change risk is low

Evidence links/notes:

<!-- Link review comments, checklists, tests, or the final-head manual review record. -->

## Checklist

- [ ] Tests pass locally
- [ ] Lint and typecheck pass
- [ ] Bug fixes include automated regression coverage that references the related issue in the test name or metadata
- [ ] Bug-fix exceptions explain why automation is not practical and have maintainer approval
- [ ] CHANGELOG entry (if user-visible)
- [ ] Docs updated (if user-visible)
- [ ] No new committed secrets or build artifacts
- [ ] Developer Certificate of Origin sign-off is present on non-trivial commits (`git commit -s`) or not applicable with rationale
- [ ] Meets the [Definition of Done](../docs/architecture/definition-of-done.md) for this change type; not-applicable items are justified
