# Emergency Release Flow

> **Purpose**: Operational playbook for responding to bad registry publishes,
> partial publish failures, cross-repo compatibility breaks, and other release
> incidents across the KiCad Studio Kit monorepo (`oaslananka/kicad-studio-kit`)
> and its sibling dependency (`oaslananka/kicad-mcp`).
>
> **Audience**: Maintainers responding to a release incident.
>
> **Related**:
> [Release Coordination Runbook](./RELEASE-COORDINATION.md) (sequencing, pre/post-publish checks, rollback/pin/yank),
> [Publishing](./publishing.md) (environments, tokens, release evidence),
> [Protocol Schemas](./protocol-schemas.md) (schema lifecycle, cross-repo CI).

---

## A — Incident triggers

Each incident type has a distinct recovery path. Identify the type before
taking action.

### A.1 Bad npm protocol-schema package (`@oaslananka/kicad-protocol-schemas`)

A broken schema published from `oaslananka/kicad-mcp`. Consumers detect the
break when:

- `check:protocol-schemas` fails after a dependency bump in this repo.
- The cross-repo compatibility canary reports a protocol contract mismatch.
- `check:compatibility` fails with a schema validation error.

**Root cause**: schema files pushed to npm with incorrect `$ref`, missing
definitions, or breaking changes that the TypeScript/Python validators reject.

### A.2 Bad PyPI kicad-mcp-pro release

A broken Python MCP server published to PyPI. Detection:

- `pip install kicad-mcp-pro==<version>` fails at import or runtime.
- The cross-repo canary finds a protocol mismatch.
- A deployed kicad-studio instance fails to connect to the MCP server.
- Extension webview or panel reports "MCP connection error".

**Root cause**: `packages/mcp-server` shipped with a logic regression,
incompatible `compatibility.yaml` range, or protocol schema drift.

### A.3 Bad npm kicad-mcp-pro launcher

A broken npm launcher published from `packages/mcp-npm`. Detection:

- `npm view kicad-mcp-pro` and `npm install kicad-mcp-pro` fail.
- The cross-repo canary finds the launcher version but cannot invoke it.

**Root cause**: launcher wrapper shipped with incorrect binary path, version
mismatch with the Python server, or wrong `compatibility.yaml` range.

### A.4 Bad VSIX / Marketplace / Open VSX extension

A broken kicadstudiokit extension published to the VS Code Marketplace or
Open VSX. Detection:

- Extension fails to activate, crashes on startup, or shows an error dialog.
- Extension reports "incompatible MCP server version" to a compatible server.
- Webview tests in CI fail after publish.
- User-reported issues with the published version.

**Root cause**: extension code regression, `compatibility.yaml`
`compatibleMcpPro` range too strict or too loose, missing dependency update.

### A.5 Partial publish success

Some registries received the artifact but others did not. Detection:

- Publish workflow log shows `success` for some jobs and `failure` for others.
- `verify:dist` checksum mismatch between releases.
- `ghcr.io/oaslananka/kicad-mcp-pro:<version>` exists but PyPI does not.
- VSIX is on the Marketplace but not on Open VSX.

**Root cause**: network transient, registry timeout, token expiry, runner
failure mid-workflow.

### A.6 Cross-repo canary failure after publish

The canary passes on the release PR branch but fails on `main` after merge.
Detection:

- `.github/workflows/cross-repo-compatibility.yml` run on `main` after a
  publish workflow completes reports a failure.
- `check:compatibility` or `check:protocol-schemas` fails on `main` with
  an error that did not appear on the release branch.

**Root cause**: timestamp skew between the release PR branch and the published
artifacts (the published package is newer than what the branch tested against).

### A.7 Release-please or generated release drift

Release Please generates a release PR with incorrect version, changelog, or
manifest. Detection:

- Release PR version bump targets a wrong semver range.
- `CHANGELOG.md` omits commits or includes unrelated commits.
- `.release-please-manifest.json` version is inconsistent with the tag.

**Root cause**: conventional commit scope mismatch, Release Please
configuration drift, release branch cherry-pick collision.

### A.8 Runtime support policy drift

A KiCad, VS Code, Node, Python, or pnpm version used in CI no longer matches
the documented support matrix. Detection:

- CI workflow fails with a toolchain version mismatch.
- `docs/support-matrix.md` states one version range but `.github/workflows`
  pins a different range.
- A dependency declares a minimum engine version that the repo does not meet.

See issue [#295](https://github.com/oaslananka/kicad-studio-kit/issues/295)
for tracking. This document covers **detection and freeze** only; the
procedural fix (updating manifests and docs) is tracked in #295.

---

## B — Immediate freeze rules

When any incident is detected, execute these steps **before** any fix attempt.

### B.1 Stop all publish workflows

```bash
echo ":: If a publish workflow is running, do NOT cancel it mid-step."
echo ":: Let it complete to avoid partial state. If it has not started the"
echo ":: actual registry push, manually cancel from the GitHub Actions UI."
echo ":: Cancel any queued release PR merge."
gh pr close <release-pr-number> --comment "Incident freeze — do not merge"
```

### B.2 Stop rerunning non-idempotent publish jobs

Do **not** retry a failed publish step until the root cause is identified.
Re-running a partially successful publish can double-publish or corrupt
registry state.

### B.3 Preserve all evidence

Before any remediation, capture:

```bash
: Record the published version (npm view, pip index, ghcr digest)
npm view @oaslananka/kicad-protocol-schemas version
npm view kicad-mcp-pro version
python -m pip index versions kicad-mcp-pro
gh release view <tag> --repo oaslananka/kicad-studio-kit

: Record the failing CI run
gh run view <run-id> --log-failed > incident-<run-id>-failed.log

: Record the SHAs of all involved commits
git log --oneline -10

: Record the compatibility.yaml state on main
git show main:compatibility.yaml
```

### B.4 Pin known-good versions

Before attempting forward fixes, record the last known good version for each
product surface. This gives you a safe fallback point:

```bash
: Record the known-good versions
echo "kicad-mcp-pro (PyPI):  <known-good>"  >> incident-evidence.md
echo "kicad-mcp-pro (npm):   <known-good>"  >> incident-evidence.md
echo "kicadstudiokit (VSIX): <known-good>"  >> incident-evidence.md
echo "protocol-schemas:      <known-good>"  >> incident-evidence.md
```

---

## C — Registry-specific recovery playbooks

### C.1 npm (`@oaslananka/kicad-protocol-schemas`, `kicad-mcp-pro`)

| Action                         | Command / Procedure                                                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Deprecate** (warn consumers) | `npm deprecate @oaslananka/kicad-protocol-schemas@<version> "Broken schema — use <known-good> instead"`                                       |
| **Pin in consuming repo**      | Update `package.json`—`"@oaslananka/kicad-protocol-schemas": "<known-good>"`, then `corepack pnpm install --frozen-lockfile`                  |
| **Publish fix**                | Push a patch version from `oaslananka/kicad-mcp`, let the publish workflow run                                                                |
| **Verify fix**                 | Run `corepack pnpm run check:protocol-schemas` and the cross-repo canary                                                                      |
| **Remove deprecation**         | `npm deprecate @oaslananka/kicad-protocol-schemas@<version> ""` (empty string removes the deprecation message; the version remains available) |

**What npm does NOT allow:**

- Deleting a published version (even `--force` unpublish is revoked for
  packages with dependents).
- Overwriting a version's tarball.
- Modifying a version's metadata after 72 hours.

### C.2 PyPI / TestPyPI (`kicad-mcp-pro`)

| Action                        | Command / Procedure                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| **Yank** (block new installs) | PyPI admin console → Release → Options → "Yank release". Existing installs continue.           |
| **Pin in consuming repo**     | Tighten `compatibility.yaml`—`compatibleMcpPro` upper bound to `"<known-good"`                 |
| **Publish fix**               | Bump `packages/mcp-server/pyproject.toml`, let Release Please + `publish-python.yml` handle it |
| **Verify fix**                | Run cross-repo canary on the release PR branch                                                 |
| **Un-yank**                   | PyPI admin console → Release → Options → "Un-yank release"                                     |

**What PyPI does NOT allow:**

- Deleting a project (requires a manual PyPI admin request).
- Re-uploading the same version (even after yank).
- Renaming a package after the first release.

**TestPyPI note**: TestPyPI has no yank. Delete and re-upload a fixed version
with the same version string (this is the only registry where overwrite is
possible). Rotate the TestPyPI token after a leaked-credential incident.

### C.3 VS Code Marketplace and Open VSX (`oaslananka.kicadstudiokit`)

| Action                         | Command / Procedure                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unpublish from Marketplace** | VS Code publisher console → extension → "Unpublish". Existing installs continue; new installs blocked. Marketplace prevents re-upload of the same VSIX. |
| **Unpublish from Open VSX**    | Open VSX publisher console → extension → "Unpublish". Same behavior as Marketplace.                                                                     |
| **Pin in consuming context**   | Instruct users to install a specific VSIX: `gh release download <tag> -p "*.vsix" && code --install-extension *.vsix --force`                           |
| **Publish fix**                | Bump `apps/vscode-extension/package.json`, let Release Please + `publish-extension.yml` handle it                                                       |
| **Verify fix**                 | Run cross-repo canary and extension webview tests                                                                                                       |

**What Marketplace does NOT allow:**

- Re-uploading the same version VSIX (version string must change).
- Deleting a published extension entirely (only unpublish; deletion is
  irreversible and requires a new extension name).
- Rolling back by overwriting a version.

### C.4 GitHub Releases (`ghcr.io/oaslananka/kicad-mcp-pro`, release assets)

| Action                                           | Command / Procedure                                                                                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Delete a release tag** (before consumers pull) | `gh release delete <tag> --yes && git push --delete origin <tag>` — only safe if no consumer has pulled the tag.                                     |
| **Delete a container tag**                       | `gh api -X DELETE "orgs/oaslananka/packages/container/kicad-mcp-pro/versions/<version-id>"` — removes the tag; digest-based pulls continue until GC. |
| **Remove release assets**                        | `gh release delete <tag> -p <asset-name>` — removes a single asset file from the release.                                                            |
| **Publish fix**                                  | Push a new tag and let `publish-mcp-container.yml` rebuild.                                                                                          |
| **Verify fix**                                   | `docker pull ghcr.io/oaslananka/kicad-mcp-pro:<new-version>` and cross-repo canary.                                                                  |

**What GHCR does NOT allow:**

- Re-tagging a deleted container tag with a different digest.
- Reverting a tag deletion (the tag name is freed; anyone could claim it).

### C.5 MCP Registry (`io.github.oaslananka/kicad-mcp-pro`)

| Action                    | Command / Procedure                                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Update metadata**       | Re-run `publish-mcp-registry.yml` with corrected metadata (no version change required for metadata-only fixes). |
| **Deprecate listing**     | Contact MCP Registry maintainers or follow the registry's deprecation procedure.                                |
| **Publish fixed version** | The next MCP server GitHub Release triggers a fresh registry publish.                                           |

**What MCP Registry does NOT allow:**

- Deleting a published server listing (deprecation only).

---

## D — Decision tree

Use this table to identify the correct response based on the incident state.

| Scenario                                                     | Freeze?                                                                                                                    | Yank/Deprecate?                                                                                                                                                                                       | Pin?                                                                                             | Publish fix?                                                                                                                                                         | Post-incident                                                                                                             |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Bad artifact published, no consumer has upgraded**         | Yes. Stop all publish workflows. Lock the release branch.                                                                  | Yes. Deprecate (npm) or yank (PyPI) so new installs cannot fetch it.                                                                                                                                  | Yes. Pin consuming repo ranges to exclude the bad version.                                       | Yes. Patch release with fix. Cleanup: un-yank/un-deprecate deprecated version only when fix is verified.                                                             | Verify cross-repo canary on `main` with fix published.                                                                    |
| **Bad artifact consumed by CI but not shipped to end users** | Yes. Stop the CI pipeline that consumed it. Do not merge the consuming PR.                                                 | Optional. If the bad version is not referenced by `compatibility.yaml` or `package.json` on main, deprecation is not urgent.                                                                          | Yes. Pin to the known-good version in `package.json` or `compatibility.yaml`.                    | Yes. Patch the bad artifact and bump the dependency.                                                                                                                 | Verify CI gates on the fix branch. The cross-repo canary must pass before merging.                                        |
| **Bad artifact consumed by a shipped VSIX extension**        | Yes. Issue an advisory notice in the extension's Marketplace README and GitHub releases.                                   | Yes. Deprecate the bad artifact (npm/PyPI) and unpublish the VSIX from Marketplace if the break is user-visible.                                                                                      | Yes. Tighten `compatibleMcpPro` to exclude the bad MCP server version.                           | Yes. Cut a patch extension release with the pinned range.                                                                                                            | Verify the fix against the cross-repo canary on `main`. Add an entry to the extension changelog explaining the incident.  |
| **Publish succeeded but post-publish verification failed**   | Yes. Do not announce the release. Do not update `docs/support-matrix.md`.                                                  | Optional. If the artifact is technically correct but verification was wrong (e.g., flaky test), retry verification first. If the artifact is actually broken, treat as a bad-artifact scenario above. | Not applicable (the verification failure means you have not promoted the version as compatible). | Yes. Fix the verification gap or fix the artifact and re-publish.                                                                                                    | Re-run verification against the fixed publish.                                                                            |
| **Publish failed halfway**                                   | Yes. Do not manually push the missing registries.                                                                          | Not applicable (no published version to yank).                                                                                                                                                        | Not applicable.                                                                                  | Yes. Identify what was published and what was not. Fix the issue, then re-run the publish workflow for the missing registries only. The workflow must be idempotent. | Verify every expected registry has the new version. Run cross-repo canary.                                                |
| **Cross-repo canary fails on `main` after publish**          | Yes. Do not cut any new release until the canary passes.                                                                   | Optional. If the canary failure is due to a test flake (not an actual contract break), re-run the canary. If it is a real contract break, the artifact counts as bad and must be deprecated.          | Yes. Pin the consuming repo to the last known-good version that passes the canary.               | Yes. Fix the contract break and re-publish.                                                                                                                          | Re-run the canary on `main` after the fix is published. Add a `compatibility.yaml` note if a version range was tightened. |
| **Release-please generates a bad release PR**                | Yes. Do not merge the release PR. Close it with a comment.                                                                 | Not applicable (nothing published).                                                                                                                                                                   | Not applicable.                                                                                  | No publish needed. Fix the Release Please configuration or the commit message scopes. Re-run `release:dry-run` to validate.                                          | Re-open the release PR after the fix, or manually trigger a fresh release-please run.                                     |
| **Runtime support policy drift detected**                    | Evaluate. If the drift blocks CI (e.g., runner image dropped the runtime), freeze releases until the toolchain is updated. | Not applicable.                                                                                                                                                                                       | Pin the CI runner or toolchain version to the known-working range.                               | Update `.github/workflows`, `docs/support-matrix.md`, and any manifest that declares engine requirements. See #295.                                                  | Verify CI passes with the pinned toolchain.                                                                               |

### D.1 Quick-reference: freeze thresholds

| Signal                                         | Freeze immediately?               |
| ---------------------------------------------- | --------------------------------- |
| Canary failure on `main`                       | Yes                               |
| Bad npm/PyPI/VSIX published                    | Yes                               |
| Partial publish                                | Yes — until root cause identified |
| Release-please version mismatch                | Yes — do not merge the PR         |
| Secret scanning alert                          | Yes (P0 — rotate the secret)      |
| Critical code-scanning alert on release branch | Yes — document accept-risk or fix |
| Flaky canary (verify by re-run)                | No — re-run first                 |
| Non-product surface CI failure                 | No — isolate the failure          |

---

## E — Post-incident checklist

After the recovery is complete, create a **release incident issue** to
document what happened, what was fixed, and what evidence was preserved.

### E.1 Create incident issue

```markdown
## Release incident YYYY-MM-DD: <short description>

### Trigger

- [ ] A.1 Bad npm protocol-schema
- [ ] A.2 Bad PyPI kicad-mcp-pro
- [ ] A.3 Bad npm kicad-mcp-pro launcher
- [ ] A.4 Bad VSIX / Marketplace / OpenVSX extension
- [ ] A.5 Partial publish success
- [ ] A.6 Cross-repo canary failure after publish
- [ ] A.7 Release-please / generated release drift
- [ ] A.8 Runtime support policy drift

### Evidence

- Failed run URL: <link>
- Published bad version(s): <versions>
- Known-good version(s): <versions>
- Incident evidence file: incident-<date>.md

### Recovery actions

- [ ] Freeze applied (stopped publishes, locked branch)
- [ ] Deprecated/yanked bad version(s) per registry playbook
- [ ] Pin applied in consuming repo (`compatibility.yaml` / `package.json`)
- [ ] Fix published (version, tag, release)
- [ ] Cross-repo canary verified on `main`

### Verification

- [ ] Canary passes on `main` (run ID: <id>)
- [ ] Post-fix CI green on `main`
- [ ] No open critical/high security alerts
- [ ] `compatibility.yaml` updated (if ranges were tightened)

### Final safe versions

| Surface                              | Version   |
| ------------------------------------ | --------- |
| `kicad-mcp-pro` (PyPI)               | <version> |
| `kicad-mcp-pro` (npm)                | <version> |
| `kicadstudiokit` (VSIX)              | <version> |
| `@oaslananka/kicad-protocol-schemas` | <version> |

### Lessons

- What went wrong:
- What prevented earlier detection:
- What should be automated (tracked in #288 Item D):
```

### E.2 Post-incident tasks

1. **Pin the incident evidence** — save the incident file to a persistent
   location (GitHub issue or repo `docs/incidents/`).
2. **Update `compatibility.yaml`** — if ranges were tightened, commit the
   change and ensure it is the first PR after recovery.
3. **Re-run the cross-repo canary** on `main` — confirm all components are
   compatible at the pinned versions.
4. **Document safe versions** — update the incident issue with the final
   safe versions for each product surface.
5. **Do not resume cleanup**—do not merge #286 or perform any source cleanup
   PR—until the release path is green and the next regular release can go
   through the full runbook flow.
6. **Forward reference to #288 Item D** — note which part of the incident
   could have been prevented or detected automatically by compatibility
   contract maintenance automation.

---

## F — Cleanup dependency

Issue #286 (simplify compatibility) and source cleanup are blocked on the
emergency flow being in place. The following dependencies apply:

| #286 task                                      | Depends on                                   |
| ---------------------------------------------- | -------------------------------------------- |
| Remove deprecated compatibility fields         | Emergency flow and runbook being operational |
| Consolidate version sources                    | Emergency flow and runbook being operational |
| Delete packages/mcp-server or packages/mcp-npm | Emergency flow consensus (not yet reached)   |
| Merge cross-repo cleanup PRs                   | Release path verified green after this flow  |

Approach for #286:

1. This PR (emergency-release-flow) merges first.
2. Ensure the first regular release after this flow goes through the full
   runbook (pre-flight → publish → post-publish verification).
3. Only then begin #286 cleanup, starting with small, reversible PRs
   (remove deprecated fields, consolidate sources).
4. Do **not** delete or rename `packages/mcp-server` or `packages/mcp-npm`
   in any #286 PR until emergency flow consensus is reached.
