# Issue 506 Brace Expansion Security Design

## Goal

Remove the two active high-severity `brace-expansion` advisories without changing product behavior or broadening the dependency update surface.

## Design

The root package will own exact pnpm overrides for the two vulnerable transitive lines: `2.1.1` is redirected to `2.1.2`, and `5.0.6` is redirected to `5.0.7`. The existing supply-chain checker will validate those exact selectors so future lockfile regeneration cannot silently reintroduce either advisory.

The lockfile will be regenerated with the repository-pinned pnpm version. Validation will prove that only patched `brace-expansion` versions resolve, `pnpm audit --audit-level high` passes, and existing repository policy/tests remain green.

## Non-goals

- No unrelated package upgrades.
- No application behavior changes.
- No changes to the removed MCP server dependency tree.
