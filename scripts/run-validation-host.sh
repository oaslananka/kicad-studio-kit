#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
# shellcheck source=scripts/lib/validation-host-env.sh
source "${repo_root}/scripts/lib/validation-host-env.sh"
validation_host_configure_base

if [[ "${1:-}" == "--print-environment" ]]; then
  validation_host_print_environment
  exit 0
fi

if [[ "$#" -eq 0 ]]; then
  echo "Usage: scripts/run-validation-host.sh COMMAND [ARG ...]" >&2
  exit 2
fi

if [[ ! -f "${KICAD_STUDIO_VALIDATION_APT_ROOT}/.validation-host-manifest" ]]; then
  echo "Validation host is not bootstrapped. Run: bash scripts/bootstrap-validation-host.sh" >&2
  exit 1
fi

validation_host_activate_rootless_runtime
cd "${repo_root}"
exec mise exec -- "$@"
