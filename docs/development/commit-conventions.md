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

`main` is squash-only. For ordinary pull requests, the scoped PR title is the authoritative Conventional Commit subject that becomes the squash commit title on `main`. Intermediate branch commits should still be clear and useful, but CI does not require published PR history to be amended or rebased solely to repair their subjects.

If an existing PR has legacy commit subjects, fix the PR title and repository files through normal non-destructive updates. Do not force-push or rewrite existing PR history just to satisfy metadata policy. Durable/default-branch commit validation remains strict.

## DCO sign-off

Non-trivial contributions should include a Developer Certificate of Origin sign-off:

```bash
git commit -s -m "docs(repo): improve maturity evidence"
```

## PR evidence

The PR description must include commands run, skipped checks with reasons, and any manual follow-up required.
