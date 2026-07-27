# Issue 492 Final Protocol Activation Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development. Follow test-driven development and verification-before-completion.

**Goal:** Prevent KiCad Studio from selecting MCP `2026-07-28` until final-specification, stable-SDK, published-schema, published-server, adapter, real-pair, and accepted-ADR evidence are all recorded.

**Architecture:** Extend the existing `compatibility.yaml` MCP section with a machine-readable activation record. The compatibility-contract validator owns fail-closed state transitions and evidence validation, while a dated evidence note records the current upstream RC-only status without becoming a production compatibility claim.

**Tech Stack:** Node.js 24, ECMAScript modules, YAML, Node test runner, TypeScript/Jest repository gates.

## Global Constraints

- Keep `2025-11-25` as the only production-selectable protocol.
- Do not implement or select a production `2026-07-28` adapter from RC material.
- Use only published artifacts as final activation evidence.
- Keep ADR 0008 non-accepted until the final migration is proven.
- Preserve zero import cycles and all existing compatibility gates.

### Task 1: Lock the activation contract with failing tests

**Files:**

- Modify: `scripts/check-compatibility-contract.test.mjs`

- [x] Test that the current blocked activation record validates.
- [x] Test that selecting the target protocol while blockers remain fails closed.
- [x] Test that a ready/active record requires final specification, stable SDK, schema, server, adapter, real-pair, and accepted ADR evidence.
- [x] Test ADR file/index status drift detection.
- [x] Run focused tests and verify RED because the validator does not exist.

### Task 2: Implement the fail-closed validator and current evidence record

**Files:**

- Modify: `compatibility.yaml`
- Modify: `scripts/check-compatibility-contract.mjs`
- Create: `docs/evidence/mcp-2026-07-28/2026-07-27-preflight.md`
- Modify: `docs/adr/README.md`
- Modify: `docs/adr/0008-mcp-2026-07-28-protocol-upgrade.md`

- [x] Add the blocked activation record for `2026-07-28`.
- [x] Validate state transitions, required evidence, stable versions, official/published sources, file existence, and ADR status parity.
- [x] Normalize ADR 0008 and its index to the supported `Proposed` status.
- [x] Record current upstream RC-only and KiCad MCP Pro `2025-11-25` artifact evidence.
- [x] Run focused tests and verify GREEN.

### Task 3: Integrate and verify repository policy

**Files:**

- Modify generated compatibility/support documentation if required.
- Update this plan with exact evidence.

- [x] Run compatibility, protocol-schema, MCP split-docs, docs, format, and lint gates.
- [ ] Run the full repository pre-push chain.
- [ ] Commit with DCO sign-off and open a phase-scoped PR without auto-closing the umbrella issue.
- [ ] Merge only after all required and external checks pass.
- [ ] Update issue progress while leaving final adapter activation and ADR acceptance open.
