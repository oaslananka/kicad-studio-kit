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

Validate the canonical Git checkout before running toolchain diagnostics:

```bash
corepack pnpm run validation-host:workspace
corepack pnpm run validation-host:doctor
corepack pnpm run validation-host:check
corepack pnpm run validation-host:package
```

`validation-host:workspace` is a read-only check. It does not fetch, reset,
prune, remove worktrees, or edit Git configuration. The doctor runs this check
first so an invalid checkout cannot produce misleading release evidence.

The pre-push hook automatically selects this pinned environment when the
validation host is bootstrapped. Other contributor environments fall back to
`corepack pnpm run check`; the hook never disables or bypasses validation.

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

## Canonical workspace topology

The supported validation-host topology is a normal, non-bare canonical checkout
on `main`. Issue and pull-request work belongs in linked worktrees created from
that checkout. In the canonical checkout, `core.bare` must be `false`,
`core.worktree` must be unset, the working tree must be clean, and `HEAD` must
match the fetched `origin/main` revision. Linked worktrees are valid development environments,
but they are not canonical release-recovery checkouts.

Use the porcelain inventory when reviewing workspace state:

```bash
git status --short --branch
git worktree list --porcelain
corepack pnpm run validation-host:workspace
```

A worktree entry marked `prunable` is a failed invariant. Do not prune it until
its directory, branch, uncommitted state, and associated pull request have been
reviewed.

## Workspace recovery and rollback

Workspace repair is deliberately manual because deleting the wrong linked
worktree can discard uncommitted work. Stop repository automation before making
changes, then use this non-destructive sequence:

1. Save a **private backup** of `.git/config` and the output of
   `git worktree list --porcelain` outside the repository. Never commit this
   backup because it can contain local paths or remote configuration.
2. For every linked worktree, run `git status --porcelain`, record its branch
   and revision, and confirm whether its pull request is active, merged, or
   abandoned. Preserve any active or dirty worktree.
3. Restore the canonical checkout configuration without rewriting history:

   ```bash
   git config --file .git/config core.bare false
   git config --file .git/config --unset-all core.worktree || true
   ```

4. Remove only clean worktrees whose changes are confirmed merged or otherwise
   preserved. Then run `git worktree prune --verbose`. Do not delete local branch
   references as part of worktree cleanup.
5. Synchronize the default branch with a fast-forward only update:

   ```bash
   git fetch --prune origin
   git switch main
   git merge --ff-only origin/main
   ```

6. Run `corepack pnpm run validation-host:workspace`, followed by
   `corepack pnpm run validation-host:doctor` and
   `corepack pnpm run validation-host:check`.

For rollback, stop automation, restore the private `.git/config` backup, and
recreate any removed linked worktree from its preserved branch or revision. A
rollback must not force-push, rewrite public history, or restore an invalid
`core.bare`/`core.worktree` combination as the final state.

## Runtime cache recovery

1. Remove `$HOME/.cache/kicad-studio-kit` only when rebuilding the extracted
   Ubuntu layer is desired.
2. Remove `$HOME/.cache/ms-playwright` only when refreshing browser artifacts.
3. Re-run `bash scripts/bootstrap-validation-host.sh`.
4. Run `corepack pnpm run validation-host:doctor` and
   `corepack pnpm run validation-host:check` before relying on the host for
   release recovery.

The scripts never read or create marketplace, GitHub, or release credentials.
