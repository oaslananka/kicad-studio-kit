# Development

## One-time setup

```bash
# Install Task: https://taskfile.dev/installation/
task install     # pnpm install --frozen-lockfile from pnpm-lock.yaml
task hooks       # install git hooks
```

KiCad Studio development is pinned to Node.js 24.x and npm 11 or newer.
Use `.node-version` or `.nvmrc` with your version manager before installing
dependencies.

## Daily workflow

```bash
task format      # auto-format
task lint        # check formatting and linting
task typecheck   # static types
task test        # run tests
task ci          # run the full CI pipeline locally
task security    # run pnpm audit, gitleaks, and bundle-size checks
```

## Before push

`pre-push` hook automatically runs `task pre-push`.
If you want to be sure CI will pass:

```bash
task ci          # full local parity with CI
task ci:act      # optional: run GitHub Actions in Docker locally
```

## Troubleshooting

- `task: command not found` → install Task: `brew install go-task` or download from https://taskfile.dev/installation/
- `pnpm install --frozen-lockfile` rejects your runtime → switch to Node.js 24.x and pnpm 11.
- pre-commit hook is too slow → run `pre-commit run --all-files` once to warm caches
- `task ci` fails but CI passes (or vice versa) → likely Doppler secrets differ; run `task doppler:check`
