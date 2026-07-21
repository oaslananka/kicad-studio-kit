#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
# shellcheck source=scripts/lib/validation-host-env.sh
source "${repo_root}/scripts/lib/validation-host-env.sh"
validation_host_configure_base
cd "${repo_root}"

dry_run=0
if [[ "${1:-}" == "--dry-run" ]]; then
  dry_run=1
  shift
fi
if [[ "$#" -ne 0 ]]; then
  echo "Usage: scripts/bootstrap-validation-host.sh [--dry-run]" >&2
  exit 2
fi

if [[ "${dry_run}" -eq 1 ]]; then
  validation_host_print_environment
  cat <<'VALIDATION_PLAN'
- mise trust and install pinned tools from mise.toml
- enable Corepack pnpm in the pinned Node prefix
- install workspace dependencies with the frozen lockfile
- install Playwright Chromium
- derive Playwright Linux packages with playwright install-deps --dry-run chromium
- download signed Ubuntu packages with apt-get download and extract them without root
- run strict dev-doctor in the activated validation environment
VALIDATION_PLAN
  exit 0
fi

for command in mise apt-get apt-cache dpkg dpkg-deb dpkg-architecture git sha256sum; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "Required bootstrap command is missing: ${command}" >&2
    exit 1
  fi
done

mkdir -p \
  "${MISE_DATA_DIR}" \
  "${MISE_CACHE_DIR}" \
  "${MISE_CONFIG_DIR}" \
  "${MISE_STATE_DIR}" \
  "${KICAD_STUDIO_VALIDATION_CACHE_ROOT}/apt-root" \
  "${KICAD_STUDIO_VALIDATION_CACHE_ROOT}/debs" \
  "${PLAYWRIGHT_BROWSERS_PATH}"

mise trust --yes "${repo_root}/mise.toml"
mise install
mise exec -- corepack enable pnpm
mise exec -- corepack pnpm install --frozen-lockfile
mise exec -- corepack pnpm --dir apps/vscode-extension exec playwright install chromium

set +e
playwright_dependency_output="$(
  mise exec -- corepack pnpm --dir apps/vscode-extension exec \
    playwright install-deps --dry-run chromium 2>&1
)"
playwright_dependency_status=$?
set -e
if [[ "${playwright_dependency_status}" -ne 0 ]] \
  && ! grep -q '^Missing system dependencies' <<< "${playwright_dependency_output}"; then
  printf '%s\n' "${playwright_dependency_output}" >&2
  echo "Playwright dependency discovery failed." >&2
  exit "${playwright_dependency_status}"
fi

packages=(xauth x11-xkb-utils libxfont2 xserver-common xvfb)
while IFS= read -r package; do
  [[ -n "${package}" ]] && packages+=("${package}")
done < <(
  printf '%s\n' "${playwright_dependency_output}" \
    | sed -n '/^Missing system dependencies/,$p' \
    | tail -n +2 \
    | sed -E 's/^[[:space:]]+//' \
    | grep -E '^[a-z0-9][a-z0-9.+-]*(:[a-z0-9]+)?$' || true
)
mapfile -t packages < <(printf '%s\n' "${packages[@]}" | sort -u)

if [[ "${#packages[@]}" -eq 0 ]]; then
  echo "Playwright dependency discovery returned no packages." >&2
  exit 1
fi

manifest_lines=(
  "schema=1"
  "codename=$(validation_host_os_codename)"
  "architecture=$(validation_host_architecture)"
)
for package in "${packages[@]}"; do
  candidate="$(apt-cache policy "${package}" | awk '/Candidate:/ && !found { print $2; found = 1 }')"
  if [[ -z "${candidate}" || "${candidate}" == "(none)" ]]; then
    echo "No apt candidate is available for ${package}." >&2
    exit 1
  fi
  manifest_lines+=("${package}=${candidate}")
done
manifest="$(printf '%s\n' "${manifest_lines[@]}")"
manifest_hash="$(printf '%s' "${manifest}" | sha256sum | awk '{ print $1 }')"
manifest_path="${KICAD_STUDIO_VALIDATION_APT_ROOT}/.validation-host-manifest"

if [[ -f "${manifest_path}" ]] \
  && grep -qx "hash=${manifest_hash}" "${manifest_path}" \
  && [[ -x "${KICAD_STUDIO_VALIDATION_APT_ROOT}/usr/bin/xvfb-run" ]]; then
  echo "Rootless Ubuntu runtime is current: ${manifest_hash}"
else
  apt_parent="$(dirname "${KICAD_STUDIO_VALIDATION_APT_ROOT}")"
  deb_parent="$(dirname "${KICAD_STUDIO_VALIDATION_DEB_ROOT}")"
  apt_staging="$(mktemp -d "${apt_parent}/.validation-host-apt.XXXXXX")"
  deb_staging="$(mktemp -d "${deb_parent}/.validation-host-debs.XXXXXX")"
  cleanup() {
    rm -rf "${apt_staging}" "${deb_staging}"
  }
  trap cleanup EXIT

  (
    cd "${deb_staging}"
    apt-get download "${packages[@]}"
  )
  for archive in "${deb_staging}"/*.deb; do
    dpkg-deb -x "${archive}" "${apt_staging}"
  done

  case "${KICAD_STUDIO_VALIDATION_APT_ROOT}" in
    "${KICAD_STUDIO_VALIDATION_CACHE_ROOT}"/apt-root/*) ;;
    *)
      echo "Refusing to replace apt root outside the validation cache." >&2
      exit 1
      ;;
  esac
  case "${KICAD_STUDIO_VALIDATION_DEB_ROOT}" in
    "${KICAD_STUDIO_VALIDATION_CACHE_ROOT}"/debs/*) ;;
    *)
      echo "Refusing to replace package cache outside the validation cache." >&2
      exit 1
      ;;
  esac

  rm -rf "${KICAD_STUDIO_VALIDATION_APT_ROOT}" "${KICAD_STUDIO_VALIDATION_DEB_ROOT}"
  mv "${apt_staging}" "${KICAD_STUDIO_VALIDATION_APT_ROOT}"
  mv "${deb_staging}" "${KICAD_STUDIO_VALIDATION_DEB_ROOT}"
  trap - EXIT

  mkdir -p "${KICAD_STUDIO_VALIDATION_APT_ROOT}/.fontconfig" \
    "${KICAD_STUDIO_VALIDATION_CACHE_ROOT}/fontconfig-cache"
  cat > "${KICAD_STUDIO_VALIDATION_APT_ROOT}/.fontconfig/fonts.conf" <<FONTCONFIG
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>/usr/share/fonts</dir>
  <dir>${KICAD_STUDIO_VALIDATION_APT_ROOT}/usr/share/fonts</dir>
  <cachedir>${KICAD_STUDIO_VALIDATION_CACHE_ROOT}/fontconfig-cache</cachedir>
</fontconfig>
FONTCONFIG
  {
    printf 'hash=%s\n' "${manifest_hash}"
    printf '%s\n' "${manifest}"
  } > "${manifest_path}"
  echo "Built rootless Ubuntu runtime: ${manifest_hash}"
fi

validation_host_activate_rootless_runtime
xvfb-run --help >/dev/null
browser="$(
  find "${PLAYWRIGHT_BROWSERS_PATH}" -type f -name chrome-headless-shell -perm -u+x -print -quit
)"
if [[ -z "${browser}" ]]; then
  echo "Playwright Chromium executable is missing." >&2
  exit 1
fi
if ldd "${browser}" | grep -q 'not found'; then
  ldd "${browser}" | grep 'not found' >&2
  echo "Rootless Chromium runtime still has missing shared libraries." >&2
  exit 1
fi
"${browser}" --no-sandbox --headless --disable-gpu --dump-dom about:blank >/dev/null
mise exec -- node scripts/dev-doctor.mjs --ci --strict

echo "Validation host bootstrap completed."
echo "Next: corepack pnpm run validation-host:check"
