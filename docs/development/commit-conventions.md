# Commit Conventions

## Conventional Commits

Use Conventional Commits for non-trivial changes:

```text
<type>(<scope>): <summary>
```

Common types:

- `feat`
- `fix`
- `docs`
- `test`
- `refactor`
- `perf`
- `build`
- `ci`
- `chore`

## Scopes

Use scopes that match the changed surface, such as:

- `repo`
- `docs`
- `ci`
- `vscode-extension`
- `release`
- `security`
- `mcp`

## DCO sign-off

Non-trivial contributions should include a Developer Certificate of Origin sign-off:

```bash
git commit -s -m "docs(repo): improve maturity evidence"
```

## PR evidence

The PR description must include commands run, skipped checks with reasons, and any manual follow-up required.
