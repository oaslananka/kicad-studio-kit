# Coding Standards

## General principles

- Keep changes single-purpose and scoped to one product surface.
- Prefer small, reviewed pull requests over large mixed changes.
- Do not bypass workspace trust, path canonicalization, or MCP compatibility gates.
- Add regression tests for bug fixes whenever practical.
- Keep user-facing behavior documented when it changes.

## TypeScript / JavaScript

- Use the existing pnpm workspace and lockfile.
- Keep ESLint, TypeScript, Jest, Playwright, and package validation passing.
- Do not introduce new package managers.
- Do not add broad dependencies when a small local helper is sufficient.
- Avoid dynamic code execution in webviews and extension-host code.

## Documentation

- Put task-oriented instructions in `docs/how-to/`.
- Put learning paths in `docs/tutorials/`.
- Put stable facts and commands in `docs/reference/`.
- Put design rationale in `docs/explanation/` and ADRs.

## Security-sensitive code

Security-sensitive changes include path handling, file writes, webviews, command execution, MCP endpoints, secrets, release workflows, and dependency installation. These require explicit test evidence and human review.
