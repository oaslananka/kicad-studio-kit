# Solo-Maintainer Main Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore PR and CI protection on `main` without a review deadlock for a solo maintainer.

**Architecture:** The versioned ruleset remains authoritative. Tests validate review parameters and required checks; after merge the exact JSON is applied to GitHub and verified by the governance evidence workflow.

**Tech Stack:** GitHub repository rulesets, Node.js contract tests, Markdown policy.

## Global Constraints

- Required approval count is exactly zero.
- Pull requests and required status checks remain mandatory.
- Force push and deletion remain blocked.
- Direct pushes to `main` remain blocked.

---

### Task 1: Encode the solo-maintainer policy

**Files:**
- Modify: `.github/rulesets/main.json`
- Modify: `scripts/check-branch-protection-gates.test.mjs`
- Modify: `docs/architecture/branch-protection.md`
- Modify: `docs/repo-maturity-report.md`
- Modify: `docs/security/assurance-case.md`

- [ ] Add a failing contract test for zero approvals, no CODEOWNERS review, no last-push approval, and required conversation resolution.
- [ ] Update the ruleset and current-state documentation.
- [ ] Run branch-protection, governance, docs and workflow checks.
- [ ] Open and merge a PR closing #507 after bot feedback is resolved.
- [ ] Apply the merged ruleset to GitHub and verify live parity.
