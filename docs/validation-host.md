# Rootless Validation Host

VPS-2 can reproduce repository, extension, browser, packaging, and emergency
release checks without administrator access. The checked-in validation-host
contract complements the [dev container](devcontainer.md): use the container
when a daemon is available, and use this rootless profile for the least-privilege
`exec-agent` service account.

## Host prerequisites

The host must provide Ubuntu 24.04, Git, `mise` 2026.7.7 or newer, and the
standard `apt-get`, `apt-cache`, `dpkg`, `dpkg-deb`, and `dpkg-architecture`
commands. The service account needs a writable `$HOME` and read access to the
host's signed apt metadata. It does not need sudo, Docker, or repository
credentials. The bootstrap manages every project runtime below that `$HOME`; it
does not install `mise` itself.

## What the bootstrap installs

`mise.toml` pins Node 24.18.0, Python 3.13.14, uv 0.11.21, actionlint 1.7.12,
and ShellCheck 0.9.0. Bootstrap forces mise state below the executing account's
`$HOME`, enables pnpm through Corepack, installs the frozen workspace lockfile,
and installs Playwright Chromium.

On Ubuntu 24.04, Chromium and Xvfb system packages are downloaded through the
host's signed apt metadata and extracted below
`$HOME/.cache/kicad-studio-kit`. Nothing is written to `/usr`, no daemon is
required, and repeated runs reuse a manifest-keyed cache. The cache can be
removed safely; the next bootstrap reconstructs it.

## Bootstrap

From the repository root:

```bash
bash scripts/bootstrap-validation-host.sh
```

Preview the actions without changing caches:

```bash
bash scripts/bootstrap-validation-host.sh --dry-run
```

The bootstrap ends with the strict CI-safe developer doctor. Optional remote
`tunnel` tooling is not installed.

## Validation commands

```bash
corepack pnpm run validation-host:doctor
corepack pnpm run validation-host:check
corepack pnpm run validation-host:package
```

Run another command inside the same pinned/rootless environment:

```bash
bash scripts/run-validation-host.sh corepack pnpm --filter kicadstudiokit run test:a11y
```

Inspect the isolated paths:

```bash
bash scripts/run-validation-host.sh --print-environment
```

## KiCad CLI canary boundary

The configured Ubuntu 24.04 repository offers KiCad 7.0.11, while this repository
supports KiCad CLI 8.x, 9.x, and 10.x. VPS-2 therefore must not install that
unsupported package or claim real KiCad compatibility evidence. Strict CI-mode
doctor reports `kicad-cli` as a warning on this host.

Real KiCad CLI, GUI IPC, and file-format canaries remain owned by KiCad MCP Pro,
using the shared fixture corpus and the scheduled/manual canary process described
in [testing strategy](testing-strategy.md) and the
[KiCad support matrix](support-matrix.md). VPS-2 remains authoritative for the
repository, browser, extension package, and release-recovery checks listed above.

## Recovery

1. Remove `$HOME/.cache/kicad-studio-kit` only when rebuilding the extracted
   Ubuntu layer is desired.
2. Remove `$HOME/.cache/ms-playwright` only when refreshing browser artifacts.
3. Re-run `bash scripts/bootstrap-validation-host.sh`.
4. Run `corepack pnpm run validation-host:doctor` and
   `corepack pnpm run validation-host:check` before relying on the host for
   release recovery.

The scripts never read or create marketplace, GitHub, or release credentials.
