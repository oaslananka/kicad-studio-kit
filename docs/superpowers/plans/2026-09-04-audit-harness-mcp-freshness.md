# Audit Harness and MCP Freshness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove verified agent-guidance drift and make post-release MCP target freshness fail closed without activating an unproven protocol.

**Architecture:** Extend existing repository policy checkers instead of adding new tooling. Agent guidance remains routed through `AGENTS.md`; MCP activation remains owned by `compatibility.yaml` and `scripts/lib/mcp-protocol-activation.mjs`, with a dated evidence note proving only facts that are currently verified.

**Tech Stack:** Node.js 24, pnpm 11, node:test, YAML, Markdown.

**Spec:** User-approved repository audit remediation in this conversation; source audit document requires evidence-first, deterministic enforcement, and no unsupported compatibility claims.

## Global Constraints

- Keep `mcp.protocolVersion` on `2025-11-25` and `mcp.activation.state` on `blocked`.
- Do not add a duplicate `CLAUDE.md`; `AGENTS.md` remains canonical.
- Do not publish, deploy, rotate secrets, or weaken existing gates.
- Preserve KiCad MCP Pro as the external owner of MCP server and protocol-schema source work.
- Every behavior change follows red-green-refactor and ends with repository checks.

---

### Task 1: Fail closed on stale agent guidance

**Files:**
- Modify: `scripts/check-agent-configs.mjs`
- Modify: `scripts/check-agent-configs.test.mjs`
- Modify: `docs/agents/index.md`
- Modify: `docs/maintainers/agent-pr-review-runbook.md`

**Interfaces:**
- Consumes: existing `collectForbiddenContentErrors(relativePath, text)` and `validateAgentConfigs()`.
- Produces: deterministic errors for nonexistent `CLAUDE.md` guidance and in-repo MCP/npm-wrapper review instructions.

- [ ] **Step 1:** Add node:test cases proving stale `CLAUDE.md`, MCP-only, and npm-wrapper-only guidance is rejected.
- [ ] **Step 2:** Run `node --test scripts/check-agent-configs.test.mjs`; confirm the new assertions fail because the checker does not yet detect the drift.
- [ ] **Step 3:** Add minimal forbidden-guidance rules to `scripts/check-agent-configs.mjs`.
- [ ] **Step 4:** Correct `docs/agents/index.md` to point at canonical `AGENTS.md` plus existing client guides, and rewrite the review runbook around extension/shared-contract/external-owner boundaries.
- [ ] **Step 5:** Run `corepack pnpm run check:agent-configs` and `corepack pnpm run docs:links`; both must pass.

### Task 2: Make MCP final-spec freshness executable

**Files:**
- Modify: `scripts/lib/mcp-protocol-activation.mjs`
- Modify: `scripts/check-compatibility-contract.test.mjs`
- Modify: `compatibility.yaml`
- Modify: `docs/adr/0008-mcp-2026-07-28-protocol-upgrade.md`
- Create: `docs/evidence/mcp-2026-07-28/2026-09-04-review.md`

**Interfaces:**
- Consumes: `validateMcpProtocolActivation({ compatibility, repoRoot, ... })`.
- Produces: optional `today` input for deterministic tests; once the target release date has passed, a blocked activation must have a review date on/after the target and stable final-spec evidence.

- [ ] **Step 1:** Add a failing test with `today: "2026-09-04"` showing the current 2026-07-27 blocked activation is stale after the target release date.
- [ ] **Step 2:** Run the compatibility test file and confirm the new test fails for freshness, not for unrelated contract errors.
- [ ] **Step 3:** Add the smallest freshness rule to the activation validator while preserving pre-release reviews before the target date.
- [ ] **Step 4:** Record only verified upstream progress: final spec published; stable Python SDK available; current KiCad MCP Pro GA still documents the 2025 protocol. Keep schema/server/adapter/real-pair activation evidence unset.
- [ ] **Step 5:** Update `compatibility.yaml` review date/evidence note/final specification and ADR 0008 without changing the active protocol or ADR status.
- [ ] **Step 6:** Run `corepack pnpm run check:compatibility-contract`, `corepack pnpm run check:mcp-split-docs`, and docs checks.

### Task 3: Full verification and integration hygiene

**Files:**
- Verify only; no unrelated cleanup.

**Interfaces:**
- Consumes: Task 1 and Task 2 changes.
- Produces: one clean, reviewable branch with full repository evidence.

- [ ] **Step 1:** Run targeted changed-file tests and format checks.
- [ ] **Step 2:** Run `corepack pnpm run check` to terminal completion.
- [ ] **Step 3:** Inspect `git diff --check`, `git status`, and the final diff for unrelated changes.
- [ ] **Step 4:** Commit the verified changes on the audit branch with a conventional commit message if local signing succeeds; otherwise leave the verified branch uncommitted and report the signing blocker rather than weakening policy.
