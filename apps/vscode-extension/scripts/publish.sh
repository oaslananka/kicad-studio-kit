#!/usr/bin/env bash
set -euo pipefail

target="${PUBLISH_TARGET:-all}"
vsix="$(find . -maxdepth 1 -type f -name 'kicadstudio-*.vsix' | sort | head -n 1)"

if [ -z "${vsix}" ]; then
  echo "No kicadstudio-*.vsix artifact found. Run pnpm run package first." >&2
  exit 1
fi

publish_marketplace() {
  if [ -z "${VSCE_PAT:-}" ]; then
    echo "VSCE_PAT is required for Visual Studio Marketplace publish." >&2
    exit 1
  fi
  echo "Publishing ${vsix} to Visual Studio Marketplace..."
  pnpm exec vsce publish --packagePath "${vsix}" --pat "${VSCE_PAT}"
}

publish_open_vsx() {
  if [ -z "${OVSX_PAT:-}" ]; then
    echo "OVSX_PAT is required for Open VSX publish." >&2
    exit 1
  fi
  echo "Publishing ${vsix} to Open VSX..."
  pnpm exec ovsx publish "${vsix}" --pat "${OVSX_PAT}"
}

case "${target}" in
  vs-marketplace)
    publish_marketplace
    ;;
  open-vsx)
    publish_open_vsx
    ;;
  all)
    publish_marketplace
    publish_open_vsx
    ;;
  *)
    echo "Unsupported PUBLISH_TARGET=${target}. Use vs-marketplace, open-vsx, or all." >&2
    exit 1
    ;;
esac
