#!/usr/bin/env bash
set -euo pipefail

EXTENSION_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$EXTENSION_ROOT/../.." && pwd)"
cd "$REPO_ROOT"

echo "==> pre-commit"
uvx --no-build --from pre-commit==4.6.0 pre-commit run --all-files

echo "==> pnpm audit"
corepack pnpm audit --audit-level high

echo "==> gitleaks"
if ! command -v gitleaks >/dev/null 2>&1; then
  echo "gitleaks is required for local security checks. Install it from https://github.com/gitleaks/gitleaks." >&2
  exit 127
fi
gitleaks detect --source . --no-banner --redact

echo "==> GitHub Actions policy"
corepack pnpm run security:workflows

echo "==> Semgrep rule tests"
corepack pnpm run test:semgrep-rules

echo "==> Semgrep repository invariants"
corepack pnpm run security:semgrep

echo "==> bundle size"
cd "$EXTENSION_ROOT"
if ! compgen -G "*.vsix" >/dev/null || [[ ! -f dist/extension.js ]]; then
  corepack pnpm run package
fi
corepack pnpm run check:bundle-size
