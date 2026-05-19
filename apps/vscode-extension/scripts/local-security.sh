#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> pnpm audit"
pnpm audit --audit-level high

echo "==> gitleaks"
if ! command -v gitleaks >/dev/null 2>&1; then
  echo "gitleaks is required for local security checks. Install it from https://github.com/gitleaks/gitleaks." >&2
  exit 127
fi
gitleaks detect --no-banner --redact

echo "==> bundle size"
if ! compgen -G "*.vsix" >/dev/null || [[ ! -f dist/extension.js ]]; then
  pnpm run package
fi
pnpm run check:bundle-size
