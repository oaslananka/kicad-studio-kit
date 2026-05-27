#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "${repo_root}"

export KICAD_STUDIO_DEVCONTAINER="${KICAD_STUDIO_DEVCONTAINER:-1}"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/ms-playwright}"
export UV_LINK_MODE="${UV_LINK_MODE:-copy}"
export UV_PYTHON="${UV_PYTHON:-3.13}"

echo "Configuring KiCad Studio Kit devcontainer in ${repo_root}"

corepack enable pnpm
corepack pnpm install --frozen-lockfile
uv sync --all-extras --frozen --project packages/mcp-server

if [[ "${KICAD_STUDIO_SKIP_PLAYWRIGHT_INSTALL:-0}" != "1" ]]; then
  corepack pnpm --filter kicadstudiokit exec playwright install --with-deps chromium
fi

corepack pnpm run check:devcontainer
corepack pnpm run dev-doctor -- --require-devcontainer
