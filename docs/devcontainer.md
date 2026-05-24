# Dev Container

The repository includes a Development Containers configuration for a repeatable
KiCad Studio Kit workspace in VS Code Dev Containers and GitHub Codespaces.

## Runtime Baseline

The container follows the repository support matrix:

| Tool              | Container source                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| Node 24           | official `ghcr.io/devcontainers/features/node:1` feature with `version: "24"`                   |
| pnpm 11           | root `packageManager` through Corepack, with the Node feature not installing a global pnpm      |
| Python 3.12       | official `mcr.microsoft.com/devcontainers/python:3.12-bookworm` base image                      |
| uv 0.11.12        | pinned Python package install, matching the MCP container policy                                |
| actionlint 1.7.12 | pinned upstream release archive with SHA-256 verification                                       |
| shellcheck        | Debian package                                                                                  |
| GitHub CLI        | official `ghcr.io/devcontainers/features/github-cli:1` feature                                  |
| Playwright        | Chromium browser install in `postCreateCommand.sh` with browser binaries under `/ms-playwright` |
| KiCad CLI         | best-effort Debian `kicad` package install when available from the base image apt sources       |

## First Start

Open the repository in a devcontainer from VS Code or create a GitHub Codespace
from the repository. The `postCreateCommand.sh` script runs:

```bash
corepack enable pnpm
corepack pnpm install --frozen-lockfile
uv sync --all-extras --frozen --project packages/mcp-server
corepack pnpm --filter kicadstudio exec playwright install --with-deps chromium
corepack pnpm run check:dev-doctor
corepack pnpm run check:devcontainer
corepack pnpm run dev-doctor -- --require-devcontainer
```

After setup, the same root checks used by CI can run inside the container:

```bash
corepack pnpm run lint
corepack pnpm run typecheck
corepack pnpm run test
corepack pnpm run build
corepack pnpm run verify:dist
uv run --project packages/mcp-server --all-extras pytest
```

`corepack pnpm run check:devcontainer` validates the container contract without
building the image. `corepack pnpm run dev:doctor -- --json` emits a
machine-readable environment report for CI/debug logs.
`corepack pnpm run dev-doctor -- --require-devcontainer` checks the active
environment marker and the required command-line tools.

## Test Coverage

Extension unit tests, Playwright-backed tests, and headless VS Code integration
tests are supported where the host container runtime permits nested Electron and
browser processes. The image includes `xvfb`, Playwright Linux dependencies, and
the VS Code extension test dependencies installed from the root lockfile.

MCP server tests are supported through the normal uv workflow:

```bash
uv sync --all-extras --frozen --project packages/mcp-server
uv run --project packages/mcp-server --all-extras pytest
```

## KiCad Limitations

The container installs KiCad CLI only where the Debian package is available from
the base image apt repositories. That package is a smoke-test convenience, not
the release-blocking KiCad 10 baseline. Primary KiCad 10 validation still uses
the support matrix, the KiCad canary lanes, and host/AppImage environments.

Real KiCad GUI tests are not guaranteed inside Codespaces or every local Docker
runtime because they depend on host graphics, sandboxing, and Electron display
support. Use the container for reproducible root checks, MCP tests, Playwright
browser tests, and headless extension tests; use host or canary lanes for real
KiCad GUI validation.

## Codespaces Prebuilds

The repository now has a stable `.devcontainer/devcontainer.json`, Dockerfile,
and post-create script. Repository-level Codespaces prebuilds can be enabled in
GitHub Codespaces settings after this configuration builds successfully on the
default branch. GitHub prebuilds do not run `postCreateCommand`, so dependency
prewarming should be moved to `onCreateCommand` or `updateContentCommand` only
after a measured prebuild pass proves the command duration and cache behavior are
acceptable.
