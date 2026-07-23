# Release Coordination Runbook

> **Purpose**: Single source of truth for sequencing, verifying, and recovering
> cross-product releases between the KiCad Studio extension repository
> (`oaslananka/kicad-studio-kit`) and the separate KiCad MCP Pro repository.
>
> **Audience**: Maintainers performing or reviewing a release of any product surface.
>
> **Related**: [Release model](architecture/release-model.md) (ownership, compatibility gate),
> [Release](release.md) (dry-runs, manifest, scopes), [Publishing](publishing.md) (environments,
> tokens, evidence, rollback), [Protocol schemas](protocol-schemas.md) (schema lifecycle,
> cross-repo CI), [Emergency release flow](./EMERGENCY-RELEASE-FLOW.md) (incident playbooks,
> recovery procedures).

## A — Release order

Two repositories publish independently versioned artifacts. Breaking contract
changes require an explicit schema → server → extension sequence.

### A.1 Artifact dependency chain

```
KiCad MCP Pro repository
  ├── @oaslananka/kicad-protocol-schemas (npm contract artifact)
  └── kicad-mcp-pro (PyPI + container + MCP Registry)
        └── validated as a published server by KiCad Studio canaries

KiCad Studio repository
  └── kicadstudiokit (VS Code Marketplace + Open VSX)
        ├── consumes @oaslananka/kicad-protocol-schemas
        └── declares the required published kicad-mcp-pro range
```

| Release surface      | Repository                    | Artifact(s)                          | Published from |
| -------------------- | ----------------------------- | ------------------------------------ | -------------- |
| Protocol schemas     | KiCad MCP Pro                 | `@oaslananka/kicad-protocol-schemas` | npm            |
| MCP server (Python)  | KiCad MCP Pro                 | `kicad-mcp-pro` (PyPI)               | GitHub Actions |
| MCP container        | KiCad MCP Pro                 | `ghcr.io/oaslananka/kicad-mcp-pro`   | GitHub Actions |
| MCP Registry listing | KiCad MCP Pro                 | registry metadata                    | GitHub Actions |
| VS Code extension    | `oaslananka/kicad-studio-kit` | VSIX (Marketplace + Open VSX)        | GitHub Actions |

### A.2 Sequencing rules

**Breaking protocol change** (schema fields removed, renamed, or made
incompatible):

1. **KiCad MCP Pro publishes the schema artifact first** — release the
   required `@oaslananka/kicad-protocol-schemas` version with the documented
   compatibility strategy.
2. **KiCad MCP Pro publishes the server artifacts second** — update its
   compatibility metadata and publish the Python package, signed container, and
   MCP Registry evidence.
3. **KiCad Studio publishes third** — consume the published schema, validate the
   published server pair, then tighten `compatibleMcpPro` and publish the VSIX.

**Non-breaking change** (additive only, no range tightening):

- Any surface can ship independently and in any order.
- `compatibility.yaml` ranges may be widened proactively to avoid blocking
  the sibling product.

**Schema-only change** (no consumer code change):

- `@oaslananka/kicad-protocol-schemas` publishes alone.
- See [When a release is NOT required](protocol-schemas.md#when-a-release-is-not-required).

### A.3 Version-linked MCP product

The Python MCP server source has moved to [KiCad MCP Pro](https://oaslananka.github.io/kicad-mcp-pro/). It was formerly version-linked with the npm launcher through Release Please `linked-versions`, which is no longer in use.

The VS Code extension is **not** version-linked to the MCP product. It
releases independently from its own Release Please PR.

## B — Artifact ownership

### B.1 Who owns what

| Artifact                                          | Owned by                            | Release trigger                                         |
| ------------------------------------------------- | ----------------------------------- | ------------------------------------------------------- |
| `@oaslananka/kicad-protocol-schemas`              | KiCad MCP Pro                       | Release published (tag-based) + `workflow_dispatch`     |
| PyPI `kicad-mcp-pro`                              | KiCad MCP Pro                       | Release Please + `publish-python.yml`                   |
| `ghcr.io/oaslananka/kicad-mcp-pro`                | KiCad MCP Pro                       | MCP server GitHub Release + `publish-mcp-container.yml` |
| MCP Registry `io.github.oaslananka/kicad-mcp-pro` | KiCad MCP Pro                       | MCP server GitHub Release + `publish-mcp-registry.yml`  |
| VS Code Marketplace `oaslananka.kicadstudiokit`   | This repo (`apps/vscode-extension`) | Release Please + `publish-extension.yml`                |
| Open VSX `oaslananka.kicadstudiokit`              | This repo (same VSIX)               | Same workflow, non-blocking after Marketplace           |

### B.2 No cross-repo publish

This repository never publishes another repository's artifact. There is no
workflow in `oaslananka/kicad-studio-kit` that creates a KiCad MCP Pro tag,
package, container, registry entry, or release. Cross-repo coordination is limited to:

- `compatibility.yaml` range declarations.
- The cross-repo compatibility canary (`.github/workflows/cross-repo-compatibility.yml`)
  which validates **published** artifacts only.
- Protocol schema dependency version bumps in `package.json`.

### B.3 Package ownership on registries

| Registry            | Package / namespace                  | Publish auth                 | Owner / Org                               |
| ------------------- | ------------------------------------ | ---------------------------- | ----------------------------------------- |
| npm                 | `kicad-mcp-pro`                      | Trusted publishing (OIDC)    | `oaslananka`                              |
| npm                 | `@oaslananka/kicad-protocol-schemas` | KiCad MCP Pro publish policy | `oaslananka` (published by KiCad MCP Pro) |
| PyPI / TestPyPI     | `kicad-mcp-pro`                      | Trusted publishing (OIDC)    | `oaslananka`                              |
| VS Code Marketplace | `oaslananka.kicadstudiokit`          | `VSCE_PAT`                   | `oaslananka`                              |
| Open VSX            | `oaslananka.kicadstudiokit`          | `OVSX_PAT`                   | `oaslananka` (Eclipse Foundation)         |
| GHCR                | `ghcr.io/oaslananka/kicad-mcp-pro`   | `GITHUB_TOKEN`               | `oaslananka`                              |
| MCP Registry        | `io.github.oaslananka/kicad-mcp-pro` | GitHub OIDC                  | `oaslananka`                              |

## C — Required checks before release

### C.1 Pre-flight checklist (run ALL before triggering a release)

```bash
## 1. Repository is clean on the release branch
git status
git log --oneline -5

## 2. Version manifest consistency
corepack pnpm run check:version

## 3. Compatibility matrix against published schemas
corepack pnpm run check:compatibility-contract

## 4. Protocol schema contract suite
corepack pnpm run check:protocol-schemas
corepack pnpm run check:compatibility-contract

## 5. Standard CI gate
corepack pnpm run lint
corepack pnpm run typecheck
corepack pnpm run test
corepack pnpm run build
corepack pnpm run verify:dist
```

### C.2 Release-please dry-runs

Before merging a release PR or merging a change to release workflows:

```bash
corepack pnpm run release:dry-run:kicad-studio
corepack pnpm run release:dry-run
corepack pnpm run check:release-please
```

Run `kicad-mcp-pro` dry-runs from the
[KiCad MCP Pro](https://oaslananka.github.io/kicad-mcp-pro/) repository.

See [Product Dry Runs](publishing.md#product-dry-runs) for what each validates.

### C.3 Pre-publish checks (per release PR)

**For a kicad-mcp-pro release PR (in KiCad MCP Pro):**

- [ ] `pyproject.toml` version bumped (Release Please handles this).
- [ ] `CHANGELOG.md` written (Release Please handles this).
- [ ] `compatibility.yaml` ranges reflect the new version.
- [ ] Server metadata matches the new version.
- [ ] `docs/support-matrix.md` updated if KiCad, VS Code, MCP protocol,
      Node, pnpm, Python, or tool-schema support changed.
- [ ] Cross-repo compatibility canary passes on the release PR branch.
- [ ] `compatibility.yaml` `compatibleExtension` range widened if the
      new MCP server introduces protocol changes that the old extension
      must still tolerate.
- [ ] KiCad MCP Pro has already published the required protocol-schema
      artifact if this release depends on new or changed schemas.

**For a kicadstudiokit release PR:**

- [ ] `apps/vscode-extension/package.json` version bumped (Release Please).
- [ ] `CHANGELOG.md` written (Release Please).
- [ ] `compatibility.yaml` `compatibleMcpPro` range covers the required
      MCP server version.
- [ ] `docs/support-matrix.md` updated if KiCad, VS Code, MCP protocol, or
      extension runtime support changed.
- [ ] Cross-repo compatibility canary passes on the release PR branch.
- [ ] If this release tightens `compatibleMcpPro` (breaking protocol change):
      the new kicad-mcp-pro must already be published on PyPI/npm.

**For a protocol-schema release in KiCad MCP Pro:**

- [ ] GitHub Release published or `workflow_dispatch` triggers the publish workflow.
- [ ] After publication, this KiCad Studio repository must:
  1. Bump `@oaslananka/kicad-protocol-schemas` in `package.json`.
  2. Run `corepack pnpm install --frozen-lockfile` to update lockfile.
  3. Run `check:protocol-schemas` and `check:compatibility-contract`.
  4. Create a PR if any of those gates fail or the dependency version
     needs to be recorded.
  5. Add the exact new version to `minimumReleaseAgeExclude` in
     `pnpm-workspace.yaml` if CI must consume it before the seven-day cooldown;
     document the reason and revert the exclusion on the next version bump.

### C.4 CI gates on PRs

All PRs — release or not — must pass these CI gates before merging:

| Check                          | What it guards                                           |
| ------------------------------ | -------------------------------------------------------- |
| `lint`                         | Code style                                               |
| `typecheck`                    | Type safety                                              |
| `test`                         | Unit and integration tests                               |
| `build` / `verify:dist`        | Compilation and packaging                                |
| `check:version`                | Release-please scope policy (conventional commit scopes) |
| `check:compatibility-contract` | Compatibility matrix consistency                         |
| `check:protocol-schemas`       | Published schema contract compliance                     |
| `check:protocol-pr-template`   | Protocol-impact PRs fill the template                    |
| `cross-repo-compatibility`     | Published artifact compatibility (canary)                |
| `docs:lint` / `docs:links`     | Documentation integrity                                  |

The `vscode-extension (windows-2025-vs2026)` job is slow and occasionally
flakey. It is not a required check on the main branch. Inspect the failure
log before dismissing: Playwright timeout in webview tests is a known flake;
a real extension build failure is actionable.

### C.5 Post-publish verification

After the publish workflow completes, verify:

1. **VSIX**: Marketplace shows the new version at the VS Code marketplace
   extension page for `oaslananka.kicadstudiokit`.
2. **PyPI**: `python -m pip index versions kicad-mcp-pro` includes the new version.
3. **npm**: `npm view kicad-mcp-pro versions --json` includes the new version.
4. **GHCR**: `ghcr.io/oaslananka/kicad-mcp-pro:<version>` digest matches the
   release evidence checksum.
5. **MCP Registry**: server metadata reflects the new version.
6. **GitHub Release**: release assets include SHA256SUMS.txt and SBOM evidence
   for each published surface. See [Release Evidence](publishing.md#release-evidence).
7. **Cross-repo canary**: manually trigger
   `.github/workflows/cross-repo-compatibility.yml` on `main` and confirm it
   passes with the newly published artifacts.

## D — Release freeze, rollback, pin, and yank

### D.1 Release freeze conditions

Do not publish any product when any of the following is true:

- A sibling product release is in progress (release PR open OR publish
  workflow running) that changes overlapping compatibility ranges.
- A known-breaking protocol schema version is published but the MCP server
  or extension has not yet updated its `compatibility.yaml` range.
- The cross-repo compatibility canary is failing on `main`.
- A `critical`-severity code scanning or automated dependency alert is open on
  the release branch without a documented accept-risk decision.
- An active secret scanning alert exists on the repository (P0 — rotate
  the secret first).

### D.2 Rollback

No product surface supports automated rollback. Registry immutability
rules prevent replacing a published version.

**If a defective release was published:**

1. **Do not delete or overwrite the published version.** PyPI and npm
   enforce immutability for stable releases; VS Code Marketplace discourages
   deletion.
2. **Publish a fixed patch version** with the correction and fresh release
   evidence.
3. **Deprecate or yank the defective version** per registry policy:
   - **npm**: `npm deprecate kicad-mcp-pro@<version> "<reason>"`.
   - **PyPI**: yank the version from the PyPI admin console.
   - **Marketplace / Open VSX**: unpublish the extension, then publish the
     fixed version. Keep the original GitHub Release evidence; add a
     maintainer note to the replacement release explaining the superseded
     version.
4. **Update `compatibility.yaml` ranges** in both repos if the defective
   version is referenced as a compatible sibling.

### D.3 Pin

Pins are used to **prevent a known-bad version from being selected** by
consumers or CI:

| Mechanism                       | Scope                  | How                                                             |
| ------------------------------- | ---------------------- | --------------------------------------------------------------- |
| `compatibility.yaml` range      | Cross-product contract | Tighten `compatibleMcpPro` or `compatibleExtension` upper bound |
| `package.json` dependency       | npm dependency         | `"@oaslananka/kicad-protocol-schemas": "<version>"`             |
| `pnpm-workspace.yaml`           | npm minimum age        | `minimumReleaseAge` + `minimumReleaseAgeExclude`                |
| `.release-please-manifest.json` | Release Please version | Locked by Release Please PR                                     |

**Emergency pin flow:**

If a kicad-mcp-pro release breaks a deployed kicad-studio instance:

1. (Preferred) Yank the broken PyPI/npm version.
2. Pin the affected extension range to the last known good version by
   tightening `compatibleMcpPro` upper bound in `compatibility.yaml`.
3. Cut a patch extension release with the pinned range.
4. Document the incident in both repos' changelogs.

If kicad-studio must urgently pin without waiting for a new MCP server
release:

1. Issue an advisory pin with `required: "<current-fixed-version"` in the
   extension code or documentation.
2. Validate the pinned range against the cross-repo canary before widening
   again.

### D.4 Yank

| Registry            | Yank mechanism                    | Impact on consumers                                          |
| ------------------- | --------------------------------- | ------------------------------------------------------------ |
| npm                 | `npm deprecate`                   | Existing installs continue; new installs warn                |
| PyPI                | Admin console "yank"              | Existing installs continue; new installs blocked             |
| VS Code Marketplace | Unpublish from publisher console  | Extension disappears from search; existing installs continue |
| Open VSX            | Unpublish from publisher console  | Same as Marketplace                                          |
| GHCR                | Delete tag / digest (destructive) | Untag only; digest-based pulls continue unless GC'd          |

Do **not** yank a version that is the only compatible sibling for a
published consumer. Sequence the patch release before yanking.

## E — Cleanup dependency

Issue #286 (Simplify compatibility) must be resolved **after** this runbook
is in place. The following dependencies exist:

| #286 task                                            | Depends on                  |
| ---------------------------------------------------- | --------------------------- |
| Remove deprecated `compatibility.yaml` fields        | This runbook being reviewed |
| Consolidate version sources                          | This runbook being reviewed |
| Update CI gates to reference this runbook            | This runbook being reviewed |
| Remove or update `docs/protocol-schemas.md` sections | This runbook being reviewed |

Approach for #286:

1. This PR (release-coordination-runbook) merges first.
2. #286 is implemented in a follow-up PR that references this runbook as the
   coordination source of truth.
3. #286 may simplify or remove the release coordination sections from
   `docs/protocol-schemas.md` since they now live in this standalone document.
4. #286 must not change any publish workflow, package manifest, version file,
   or release automation — only documentation and CI validation gates.
