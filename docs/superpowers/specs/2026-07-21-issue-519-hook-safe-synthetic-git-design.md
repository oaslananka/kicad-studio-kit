# Issue 519 Hook-safe Synthetic Git Design

## Goal

Make Release Please's synthetic Git repositories behave identically when repository validation runs directly or from Husky's `pre-push` hook.

## Problem

Git exports repository-local environment variables such as `GIT_DIR`, `GIT_WORK_TREE`, and related object/index variables to hooks. The Release Please test helper launches nested `git` commands in a temporary directory but currently inherits the caller environment unchanged. Under `pre-push`, those variables redirect the nested commands back to the caller repository, so `git remote add origin ...` fails with `remote origin already exists`.

## Design

The low-level Git subprocess boundary will construct a sanitized environment before every Git invocation. It will preserve the full process environment except variables listed by `git rev-parse --local-env-vars`, and then execute Git with an explicit `cwd`. This follows Git's own definition of repository-local variables instead of maintaining a partial hard-coded list.

The local-variable discovery command must itself run with the relevant inherited variables removed. A small bootstrap list containing the standard repository-local variable names will protect that discovery call from being redirected by a hook environment. If discovery fails, the helper will fall back to the bootstrap list and continue fail-closed for the known variables.

Release Please's spawned CLI will receive the same sanitized base environment plus only the required `GITHUB_TOKEN` and `GH_TOKEN`. This prevents the CLI's local Git operations from being redirected while preserving PATH, toolchain settings, proxies, and other non-Git process configuration.

## Interfaces

- `createGitSubprocessEnv(baseEnv = process.env): NodeJS.ProcessEnv` returns a copy of the environment without repository-local Git variables.
- `runGit(cwd, args)` always executes with `cwd` and `env: createGitSubprocessEnv()`.
- `runSyntheticReleasePleaseDryRun(...)` passes `createGitSubprocessEnv()` to the Release Please subprocess before adding tokens.

## Testing

A regression test will set `GIT_DIR` and `GIT_WORK_TREE` to the real caller repository, invoke the synthetic dry-run with a stubbed Release Please command, and assert that synthetic repository creation still succeeds. The test restores the original environment in `finally`.

The existing direct Release Please test suite remains green. Final acceptance requires a normal branch push through Husky's unmodified `pre-push` hook; `HUSKY=0` is not permitted for that proof.

## Non-goals

- weakening or skipping the root `pnpm run check` pre-push gate;
- changing Release Please scope/version policy;
- clearing unrelated environment variables;
- introducing a new Git wrapper dependency.
