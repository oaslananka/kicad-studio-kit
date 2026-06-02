# ADR 0009: Split kicad-mcp-pro Into Separate Repository

Status: Accepted

Supersedes: ADR 0001 (in part — see Consequences)

Date: 2026-06-01

## Context

The KiCad Studio Kit monorepo (`oaslananka/kicad-studio-kit`) currently hosts
two product workspaces and three shared packages:

| Surface           | Path                         | Ecosystem         | Release Cadence |
| ----------------- | ---------------------------- | ----------------- | --------------- |
| **kicad-studio**  | `apps/vscode-extension/`     | VS Code extension | Independent     |
| **kicad-mcp-pro** | `packages/mcp-server/`       | PyPI (Python)     | Independent     |
| protocol-schemas  | `packages/protocol-schemas/` | npm (schemas)     | Shared          |
| kicad-fixtures    | `packages/kicad-fixtures/`   | Test fixtures     | Shared          |
| test-harness      | `packages/test-harness/`     | npm (test utils)  | Shared          |

The two products have fundamentally different consumers:

- **kicad-studio** is installed via VS Code Marketplace / Open VSX as a VSIX.
- **kicad-mcp-pro** is installed via PyPI (`pip install kicad-mcp-pro`) or npm
  (`npm install kicad-mcp-pro`) and consumed by MCP-capable AI clients (Claude
  Code, Cursor, Gemini CLI, etc.).

They share no source-code dependencies — integration is exclusively through the
MCP protocol and `compatibility.yaml` (ADR 0002, ADR 0004). Despite this
decoupling, sharing a single repository creates friction:

1. **Mixed CI/CD pipelines** — VS Code builds (Webpack, VSIX) and Python builds
   (sdist/wheel, PyPI publish) in the same workflow graph creates unnecessary
   noise. A kicad-mcp-pro PR triggers vscode-extension checks and vice versa.
2. **Release-please complexity** — linked-versions plugin and
   `check-release-please-monorepo.mjs` enforce commit-scope rules that require
   careful hygiene (e.g., cannot touch both product dirs in one commit).
3. **Release gate coupling** — both products wait on the same CI run.
4. **Contributor confusion** — `oaslananka/kicad-studio-kit` sounds like a
   VS Code extension, not an MCP server. MCP clients reference the repo URL.
5. **ADRs reference the monorepo** — ADR 0001 and `product-boundaries.md`
   explicitly say "Do not introduce additional canonical repositories." This
   ADR supersedes that restriction for the MCP product.

The MCP ecosystem is growing independently of VS Code extensions. A dedicated
`oaslananka/kicad-mcp` repository will give the MCP product its own identity,
CI/CD, issue tracker, and release cadence — matching how its consumers
(Claude Code, Cursor, etc.) discover and reference it.

### Constraints

- **Public identity stays `kicad-mcp-pro`.** The npm and PyPI package names
  do not change. Documentation, badges, and MCP Registry references use the
  same public name.
- **KiCad Studio consumes via released dependencies, not source.** After the
  split, `kicad-studio-kit` will install `kicad-mcp-pro` from npm/PyPI, not
  from a workspace path. This is already enforced by ADR 0004 (no direct
  source imports).
- **BoardReadyOps stays separate.** Not affected by this split.
- **No code movement in Phase 1.** This ADR and companion issues are planning
  artifacts only.

## Decision

Split kicad-mcp-pro into `oaslananka/kicad-mcp` using
a two-phase approach.

### Phase 1: Planning (this ADR + companion issues)

Document the decision, enumerate the work items, and get maintainer agreement.
No files are moved, no configs are changed.

Artifacts:

1. This ADR (0009)
2. GitHub issues tracking each Phase 2 work stream (companion issues)

### Phase 2: Migration (future)

1. **Create `oaslananka/kicad-mcp`** — new GitHub repository with identical
   branch protection, CODEOWNERS, and repository settings.
2. **Fork product code** — copy `packages/mcp-server/`
   (with `git history` using `git filter-repo` or subtree split) into the new
   repo. (The npm launcher was migrated separately in Phase 2.)
3. **Publish shared packages** — `packages/protocol-schemas/` published to npm
   as public package. Both repos consume from npm.
4. **Split CI/CD** — each repo gets its own CI, publish workflows, and
   release-please configuration.
5. **Split compatibility.yaml** — each repo maintains its own copy; the
   cross-product contract (compatibleMcpPro/compatibleExtension) is the
   overlapping section.
6. **Remove from monorepo** — `packages/mcp-server/` is
   removed from `kicad-studio-kit`. Release-please-config is simplified.
   (`packages/mcp-npm/` was removed in Phase 2 step 6a.)
7. **Update docs** — ADR 0001 status updated to Superseded;
   product-boundaries.md updated; README badges and URLs updated in both repos.

## Consequences

### Positive

- **Independent CI/CD** — MCP PRs run only MCP checks; extension PRs run only
  extension checks. Faster feedback loops for both teams.
- **Clear identity** — `oaslananka/kicad-mcp` is discoverable by MCP
  ecosystem users who have no interest in VS Code extensions.
- **Simplified release-please** — each repo has a single product (extension
  or mcp-server), eliminating scope-enforcement complexity.
- **Cleaner issue tracking** — MCP bugs and feature requests live in the MCP
  repo; extension issues in the extension repo.
- **Independent contributors** — someone contributing to the MCP server does
  not need to clone the VS Code extension source tree.
- **Release independence** — kicad-mcp-pro releases are not gated on
  kicad-studio CI and vice versa.

### Negative

- **Shared package versioning overhead** — `protocol-schemas` currently lives
  as a workspace package with zero publishing ceremony. Post-split, it must be
  published to npm and versioned independently. This adds release management
  for a package that was previously internal.
- **Cross-repo compatibility testing** — After split, CI cannot test
  extension-against-unreleased-server in a single run. Compatibility
  validation must use published artifacts or a manual cross-repo workflow.
- **Duplicated tooling** — Both repos need similar CI setup, linting configs,
  and release infrastructure.
- **Loss of atomic cross-product changes** — If a protocol change requires
  simultaneous extension + server updates, it must be coordinated across two
  repos instead of one PR. (In practice, this is already rare — ADR 0002's
  contract-first model means protocol changes are additive.)
- **Two repos to maintain** — CODEOWNERS, branch protection, and GitHub
  settings must be kept in sync.

### Supersedes ADR 0001 (In Part)

ADR 0001's topology — "two products in one monorepo" — described the correct
architecture for a project that started as a single VS Code extension with a
bundled MCP server. As the MCP product matured into an independently consumed
surface, the monorepo constraint became friction rather than discipline. This
ADR adjusts the topology: `kicad-studio-kit` becomes a single-product
monorepo (extension), and `kicad-mcp` becomes a single-product monorepo (MCP
server).

The following ADR 0001 principles are **retained**:

- No direct source imports between products (ADR 0004) remains binding.
- Protocol changes still require cross-product coordination.
- Compatibility metadata (compatibility.yaml) continues to define the contract.

The following ADR 0001 principle is **modified**:

- "One repository for all products" → one repository per product with shared
  packages published independently.

## Shared Package Strategy

### protocol-schemas (`packages/protocol-schemas/`)

**Decision: Publish to npm as public package.**

- Both products consume JSON schemas from this package.
- Currently installed in both via workspace protocol (`"@oaslananka/kicad-protocol-schemas": "workspace:^"`).
- Post-split: publish as `@oaslananka/kicad-protocol-schemas` on npm. Both
  repos add it as a regular dependency.
- Versioning: independent semver. Initial version matches the current unreleased
  state. Schema additions are minor bumps; breaking schema changes are major.

**Risk**: Zero-to-npm publishing overhead. Mitigated by npm trusted publishing
(OIDC) already set up in the monorepo's `publish-npm.yml`.

### kicad-fixtures (`packages/kicad-fixtures/`)

**Decision: Move to `kicad-mcp`; kicad-studio-kit retains copy if needed.**

- Primarily used by mcp-server tests (KiCad project files for canary/integration tests).
- Extension tests reference some fixtures through path references.
- Post-split: fixtures move with the server code. If extension tests still
  reference them, a snapshot is retained in kicad-studio-kit or the extension
  references them from the published MCP server test artifact.

### test-harness (`packages/test-harness/`)

**Decision: Keep in kicad-studio-kit; kicad-mcp duplicates minimal needed utilities.**

- Private package used by both products for cross-product test utilities.
- After split, cross-product tests become rare (compatibility tests are the
  main use). The kicad-mcp repo can either:
  - Keep a simplified in-repo test helper, or
  - Add `@oaslananka/kicad-test-harness` as a (private or public) npm dep
    if there is repeated compatibility test logic.

### compatibility.yaml

**Decision: Both repos get their own copy with overlapping contract.**

- `kicad-studio-kit` keeps the file with `products.kicad-studio` section and
  the `compatibleMcpPro` range (the external contract).
- `kicad-mcp` gets a copy with `products.kicad-mcp-pro` section and the
  `compatibleExtension` range.
- Both copies share the `mcp:`, `kicad:`, and shared runtime sections.
- Release compatibility checks in each repo validate against the last published
  version of the other product.

## CI/CD Split

### kicad-studio-kit (post-split)

- CI runs: build (Webpack), lint/typecheck (TypeScript), unit tests, VSIX
  packaging, marketplace validation.
- Release-please: single component `vscode-extension`.
- Publish: `publish-extension.yml` (VS Code Marketplace + Open VSX).
- Pre-existing shared workflow checks (security, drift, gitleaks, CodeQL)
  remain in this repo for its code.

### kicad-mcp (new repo)

- CI runs: lint (ruff), typecheck (mypy), pytest (mcp-server), MCP Registry manifest validation.
- Release-please: single `mcp-server` component.
- Publish: `publish-python.yml` (PyPI), `publish-mcp-registry.yml` (MCP Registry).
- Cross-repo compatibility test: CI installs the latest published
  `@oaslananka/kicadstudiokit` (or just the VSIX) and runs compatibility
  smoke tests.

### Cross-Repo Compatibility

The compatibility gate becomes looser — instead of testing against an
in-flight sibling, each repo validates against the **last published** version
of the other product:

1. **Before kicad-mcp-pro release**: CI installs latest published
   `kicadstudiokit` VSIX and runs `check:compatibility` and `test:contract`.
2. **Before kicad-studio release**: CI installs latest published
   `kicad-mcp-pro` from PyPI/npm and runs compatibility checks.
3. **Breaking protocol changes**: Must release kicad-mcp-pro first (with
   backward-compatible contract), then kicad-studio can release with the new
   compat range.

This matches the existing contract-first model — compatibility.yaml already
defines the version ranges. The only difference is that testing uses published
artifacts instead of workspace references.

## Files Requiring Changes (Phase 2)

### kicad-studio-kit changes

| File                                                            | Change                                                                                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `release-please-config.json`                                    | Remove `mcp-server` package; remove `linked-versions` plugin                                                            |
| `.release-please-manifest.json`                                 | Remove mcp-server entry                                                                                                 |
| `compatibility.yaml`                                            | Remove `products.kicad-mcp-pro` section; update `source` URL; keep `compatibleMcpPro` range as external contract        |
| `docs/adr/0001-monorepo-two-products.md`                        | Set status to `Superseded by 0009`                                                                                      |
| `docs/adr/0009-split-kicad-mcp-pro-into-separate-repository.md` | Set status to `Accepted`                                                                                                |
| `docs/architecture/product-boundaries.md`                       | Remove MCP server/npm from allowed dependencies table; remove "Do not introduce additional canonical repositories" note |
| `docs/architecture/release-model.md`                            | Remove MCP server/npm release rows                                                                                      |
| `docs/architecture/protocol-change-checklist.md`                | References to mcp-server point to new repo                                                                              |
| `README.md`                                                     | Update badges, remove MCP references or redirect to new repo                                                            |
| `.github/workflows/ci.yml`                                      | Remove mcp-server, mcp-npm matrix jobs                                                                                  |
| `.github/workflows/publish-python.yml`                          | Delete or archive (moved to kicad-mcp)                                                                                  |
| `.github/workflows/publish-mcp-registry.yml`                    | Delete or archive (moved to kicad-mcp)                                                                                  |
| `.github/CODEOWNERS`                                            | Remove mcp-server entry                                                                                                 |
| `package.json`                                                  | Remove mcp-server from workspace config                                                                                 |
| Root `pnpm-workspace.yaml`                                      | Remove mcp-server from workspace                                                                                        |
| `tsconfig.json` (root)                                          | Remove path aliases referencing mcp-server                                                                              |
| `packages/protocol-schemas/package.json`                        | Change from `"workspace:^"` deps to published npm versions                                                              |
| `apps/vscode-extension/package.json`                            | Change `@oaslananka/kicad-protocol-schemas` from workspace to npm version                                               |
| `scripts/check-release-please-monorepo.mjs`                     | Remove or simplify; no longer needed for single-product config                                                          |

### kicad-mcp changes (new repo)

| File                                         | Change                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| `release-please-config.json`                 | New: mcp-server component                                               |
| `.release-please-manifest.json`              | New: server@3.6.0                                                       |
| `compatibility.yaml`                         | New: products.kicad-mcp-pro section + shared runtime/mcp/kicad sections |
| `.github/workflows/ci.yml`                   | New: mcp-server lint/typecheck/test, mcp-npm build/test                 |
| `.github/workflows/publish-python.yml`       | New (copied from monorepo)                                              |
| `.github/workflows/publish-mcp-registry.yml` | New (copied from monorepo)                                              |
| `.github/CODEOWNERS`                         | New: all @oaslananka                                                    |

| `packages/mcp-server/pyproject.toml` | Update repository URLs |
| `packages/mcp-server/server.json` | Update repo URL |
| `packages/mcp-server/mcp.json` | Update repo URL |
| `packages/protocol-schemas` | Add as npm dependency instead of workspace package |
| `README.md` | New: MCP-focused README with badges pointing to kicad-mcp |

## Alternatives Considered

| Alternative                                        | Reason for Rejection                                                                                                                                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep monorepo; improve CI gating                   | Avoids split effort but does not solve identity/discoverability problem. MCP consumers still find a "VS Code extension" repo. CI noise reduction could be done with path filters, but release-please complexity and contributor confusion remain. |
| Extract into `oaslananka/mcp-kicad`                | Name implies MCP-first, but `kicad-mcp-pro` is the established public identity. Renaming the public package would break every existing consumer.                                                                                                  |
| Monorepo with all shared packages published to npm | The split itself is the goal — staying in one repo just to keep shared packages internal is not worth the coupling cost.                                                                                                                          |
| Git submodules / subtree                           | Adds massive workflow complexity (submodules are notorious for CI friction). The products are already decoupled at source level — a separate repo is cleaner.                                                                                     |
| Phased over 6+ months with incremental extraction  | Over-engineered for two products that already have no source dependency. A clean split with parallel repositories is simpler.                                                                                                                     |

## Related

- Supersedes ADR 0001 (Monorepo Two Products) — topology is adjusted from
  "two products, one repo" to "one product per repo."
- Related issues: Phase 2 work items tracked as companion issues.
- See `docs/architecture/product-boundaries.md` — will be updated in Phase 2.
