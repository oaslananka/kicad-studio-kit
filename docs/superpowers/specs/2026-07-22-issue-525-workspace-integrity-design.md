# Issue 525 Workspace Integrity Design

## Problem

A repository validation host can appear available while its canonical checkout is not a valid working tree. The observed failure combined `core.bare=true` with an explicit `core.worktree`, left the local default branch behind `origin/main`, and accumulated obsolete linked worktrees. Commands then resolved against an ambiguous checkout and emitted configuration warnings.

## Goals

- Detect invalid or ambiguous Git workspace state before expensive validation runs.
- Keep ordinary contributor branches and CI checkouts supported.
- Provide a stricter canonical-host mode that verifies the default branch and remote revision.
- Document a non-destructive recovery procedure that preserves active work and keeps host-specific details private.
- Keep the check dependency-free, fast, and testable with the Node.js standard library.

## Non-goals

- Automatically mutate Git configuration or delete worktrees.
- Require every contributor checkout to be on `main`.
- Replace GitHub branch protection, repository bootstrap, or full validation.
- Publish host paths, credentials, or machine inventory.

## Considered approaches

### Extend the existing developer doctor

This would keep all diagnostics in one report, but the developer doctor already covers runtimes, tools, ports, fixtures, and package contracts. Adding canonical Git topology would make it responsible for host repair semantics and complicate its mocked command matrix.

### Add shell-only checks to the validation runner

A shell implementation would be short, but portable parsing and unit testing would be weaker, especially for Windows contributors and `git worktree list --porcelain` output.

### Add a focused Node.js workspace-integrity checker

This keeps Git topology logic isolated, supports deterministic unit tests through an injected command runner, and can be invoked independently or before the validation-host doctor. This is the selected approach.

## Architecture

Create `scripts/check-workspace-integrity.mjs` with two layers:

1. Pure parsing and evaluation functions convert Git command results into a structured report.
2. A CLI adapter runs Git commands from a selected repository root and renders human or JSON output.

Default mode validates that the current directory is a usable non-bare working tree and that no worktree entry is marked prunable. `--canonical` adds these requirements:

- the checkout is not a linked worktree;
- local `core.worktree` is unset;
- the current branch is `main`;
- the working tree has no staged or unstaged changes;
- `HEAD` equals `refs/remotes/origin/main`;
- `git status` succeeds without configuration warnings.

The checker never fetches, resets, prunes, or edits configuration. Operators must synchronize and repair explicitly using the documented runbook.

## Integration

- Add `validation-host:workspace` to the root package scripts.
- Run the canonical workspace check before `validation-host:doctor`.
- Extend the validation-host contract checker so CI proves the script, tests, package entrypoint, recovery documentation, and hook integration remain present.
- Make the Husky pre-push hook prefer the pinned validation host when it is bootstrapped, with a Corepack fallback for ordinary contributor environments.
- Keep the repository-wide `check` safe for PR branches by running only unit/contract tests there, not the canonical runtime mode.

## Error handling

Every failed Git command becomes an actionable report item. Missing `core.worktree` is treated as the expected state rather than an error. Human output must describe the failed invariant without printing credentials or remote URLs. JSON output is available for operations tooling.

## Testing

- Unit-test invalid `core.bare`/`core.worktree` combinations.
- Unit-test canonical linked-worktree rejection.
- Unit-test stale `HEAD` versus `origin/main`.
- Unit-test prunable worktree detection.
- Integration-test a temporary normal Git repository.
- Re-run validation-host contract tests and the complete pinned repository check.
- Verify a normal push executes Husky hooks without `HUSKY=0`.

## Operational recovery

Before changing configuration, operators must inventory every linked worktree, confirm clean status, associate branches with merged or active pull requests, and save a private backup of `.git/config` plus `git worktree list --porcelain`. Recovery then removes only confirmed obsolete worktrees, restores a normal canonical checkout, fast-forwards `main`, and runs the new checker before full validation.
