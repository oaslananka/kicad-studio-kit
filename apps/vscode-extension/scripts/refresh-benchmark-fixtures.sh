#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="${1:-../kicad-mcp-pro/tests/fixtures/benchmark_projects}"
TARGET="$ROOT/test/fixtures/benchmark_projects"

if [[ ! -d "$SOURCE" ]]; then
  echo "Source fixture directory not found: $SOURCE" >&2
  exit 1
fi

rm -rf "$TARGET"
mkdir -p "$(dirname "$TARGET")"
cp -R "$SOURCE" "$TARGET"

echo "Refreshed benchmark fixtures from $SOURCE"
