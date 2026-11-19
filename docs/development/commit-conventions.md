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

Use one of the release-policy scopes that matches the changed surface:

- `kicad-studio` for the VS Code extension;
- `kicad-mcp-pro` for cross-repository protocol/release references to KiCad MCP Pro;
- `repo` for repository governance and shared policy;
- `deps` for dependency/tooling updates;
- `docs` for documentation-only changes;
- `superpowers` for capability/spec-design documentation;
- `.gitignore` for a `.gitignore`-only governance change.

## Pull request titles and squash history

`main` is squash-only. Pull request titles are unrestricted: the metadata CI job does not require a Conventional Commit prefix or scope in the **PR title**. Write a clear title for people. When a change is merged, use an appropriate Conventional Commit subject for the **squash commit** so the default-branch history remains useful to Release Please.

Intermediate branch commit subjects should still be readable, but CI does not require rewriting PR history solely to satisfy metadata policy. Do not force-push or amend a published PR just to rename its title. Durable/default-branch commit validation and release metadata checks remain strict.

## PR evidence

The PR description must include commands run, skipped checks with reasons, and any manual follow-up required.
