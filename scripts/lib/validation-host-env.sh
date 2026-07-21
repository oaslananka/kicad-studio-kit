#!/usr/bin/env bash

validation_host_os_codename() {
  awk -F= '$1 == "VERSION_CODENAME" { gsub(/"/, "", $2); print $2; exit }' /etc/os-release
}

validation_host_architecture() {
  dpkg --print-architecture
}

validation_host_multiarch() {
  dpkg-architecture -qDEB_HOST_MULTIARCH
}

validation_host_configure_base() {
  : "${HOME:?HOME must be set for the validation host}"

  export MISE_DATA_DIR="${HOME}/.local/share/mise"
  export MISE_CACHE_DIR="${HOME}/.cache/mise"
  export MISE_CONFIG_DIR="${HOME}/.config/mise"
  export MISE_CONFIG_FILE="${MISE_CONFIG_DIR}/config.toml"
  export MISE_STATE_DIR="${HOME}/.local/state/mise"
  export KICAD_STUDIO_VALIDATION_CACHE_ROOT="${HOME}/.cache/kicad-studio-kit"
  export PLAYWRIGHT_BROWSERS_PATH="${HOME}/.cache/ms-playwright"
  export UV_LINK_MODE="${UV_LINK_MODE:-copy}"
  export UV_PYTHON="${UV_PYTHON:-3.13}"

  local codename architecture
  codename="$(validation_host_os_codename)"
  architecture="$(validation_host_architecture)"
  if [[ -z "${codename}" || -z "${architecture}" ]]; then
    echo "Unable to determine Ubuntu codename or Debian architecture." >&2
    return 1
  fi

  export KICAD_STUDIO_VALIDATION_APT_ROOT="${KICAD_STUDIO_VALIDATION_CACHE_ROOT}/apt-root/${codename}-${architecture}"
  export KICAD_STUDIO_VALIDATION_DEB_ROOT="${KICAD_STUDIO_VALIDATION_CACHE_ROOT}/debs/${codename}-${architecture}"
}

validation_host_activate_rootless_runtime() {
  local multiarch
  multiarch="$(validation_host_multiarch)"

  export PATH="${KICAD_STUDIO_VALIDATION_APT_ROOT}/usr/bin:${PATH}"
  export LD_LIBRARY_PATH="${KICAD_STUDIO_VALIDATION_APT_ROOT}/usr/lib/${multiarch}:${KICAD_STUDIO_VALIDATION_APT_ROOT}/lib/${multiarch}:${LD_LIBRARY_PATH:-}"
  export FONTCONFIG_PATH="${KICAD_STUDIO_VALIDATION_APT_ROOT}/.fontconfig"
  export FONTCONFIG_FILE="${KICAD_STUDIO_VALIDATION_APT_ROOT}/.fontconfig/fonts.conf"
  export XKB_CONFIG_ROOT="${KICAD_STUDIO_VALIDATION_APT_ROOT}/usr/share/X11/xkb"
}

validation_host_print_environment() {
  printf 'MISE_DATA_DIR=%s\n' "${MISE_DATA_DIR}"
  printf 'MISE_CACHE_DIR=%s\n' "${MISE_CACHE_DIR}"
  printf 'MISE_CONFIG_DIR=%s\n' "${MISE_CONFIG_DIR}"
  printf 'MISE_CONFIG_FILE=%s\n' "${MISE_CONFIG_FILE}"
  printf 'MISE_STATE_DIR=%s\n' "${MISE_STATE_DIR}"
  printf 'KICAD_STUDIO_VALIDATION_CACHE_ROOT=%s\n' "${KICAD_STUDIO_VALIDATION_CACHE_ROOT}"
  printf 'KICAD_STUDIO_VALIDATION_APT_ROOT=%s\n' "${KICAD_STUDIO_VALIDATION_APT_ROOT}"
  printf 'KICAD_STUDIO_VALIDATION_DEB_ROOT=%s\n' "${KICAD_STUDIO_VALIDATION_DEB_ROOT}"
  printf 'PLAYWRIGHT_BROWSERS_PATH=%s\n' "${PLAYWRIGHT_BROWSERS_PATH}"
}
