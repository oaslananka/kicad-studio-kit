# Issue 490 VPS Validation Host Design

## Goal

Make VPS-2 a reproducible, least-privilege validation and release-recovery host without weakening repository runtime requirements or requiring root access.

## Architecture

The checked-in contract has three layers:

1. `mise.toml` pins the user-space toolchain: Node, Python, uv, actionlint, and ShellCheck.
2. `scripts/bootstrap-validation-host.sh` installs the pinned tools, enables Corepack pnpm, performs the frozen-lockfile install, installs Playwright Chromium, and builds a rootless Ubuntu runtime under the user's cache.
3. `scripts/run-validation-host.sh` activates the pinned mise tools and rootless runtime before executing doctor, check, package, or an arbitrary validation command.

The rootless runtime is not a chroot and does not modify `/usr`. It derives the required Chromium/Xvfb package names from Playwright's own `install-deps --dry-run chromium` output, adds `xauth`, downloads packages through the host's signed apt metadata, and extracts the `.deb` payloads into `$HOME/.cache/kicad-studio-kit`. `PATH`, `LD_LIBRARY_PATH`, XKB, font, and Playwright cache variables expose that layer only to wrapped commands.

## Idempotence and trust

All mise state is forced under the executing account's real `$HOME`; this prevents the current service environment from leaking the read-only `/home/opsrunner` configuration into the `exec-agent` account. The repository config contains only safe plain `[tools]` entries, but bootstrap still records trust explicitly. Repeated runs reuse pinned mise installations, pnpm's store, Playwright's browser cache, downloaded `.deb` files, and an apt-root manifest hash.

The rootless apt layer is rebuilt atomically when the Ubuntu release, architecture, Playwright dependency package list, or apt candidate versions change. Repository files never contain credentials or host-specific absolute paths.

## KiCad CLI boundary

Ubuntu 24.04's configured repository offers KiCad 7.0.11, below this repository's supported 8–10 range. Bootstrap must not install or pretend to validate against that unsupported version. VPS-2 covers repository, extension, browser, packaging, and release-recovery gates; supported KiCad CLI/GUI compatibility remains isolated to the existing scheduled/manual canary lanes and is reported as a non-blocking doctor warning in CI mode.

## Validation contract

The implementation is complete when these commands pass from a fresh user cache:

```bash
bash scripts/bootstrap-validation-host.sh
corepack pnpm run validation-host:doctor
corepack pnpm run validation-host:check
corepack pnpm run validation-host:package
```

Static repository checks must verify exact tool pins, executable scripts, rootless package behavior, documentation, package-script wiring, and the canary boundary.
