# kicad-studio-kit Monorepo Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the extracted KiCad Studio IDE and KiCad MCP Pro projects into the canonical `oaslananka/kicad-studio-kit` monorepo with version `1.0.0` and GitHub-only CI/publish metadata.

**Architecture:** Keep the VS Code extension as `apps/vscode-extension`, the Python MCP server as `packages/mcp-server`, and the npm launcher as `packages/mcp-npm`. Root files orchestrate workspace checks, releases, docs, and publish workflows without becoming a publishable package.

**Tech Stack:** Node 24, pnpm 11, TypeScript, VS Code extension tooling, Python 3.12, uv, PyPI trusted publishing, npm trusted publishing, GitHub Actions, MCP Registry metadata.

---

### Task 1: Build Target Topology

**Files:**

- Create directories: `apps/vscode-extension`, `packages/mcp-server`, `packages/mcp-npm`, `docs`, `scripts`, `.github/workflows`
- Move/copy source: `kicad-studio-ide/*` to `apps/vscode-extension/*`
- Move/copy source: `kicad-studio-mcp/*` to `packages/mcp-server/*`
- Move/copy source: `packages/mcp-server/npm-wrapper/*` to `packages/mcp-npm/*`

- [ ] Copy extracted projects into the target layout.
- [ ] Remove generated artifacts: extension `dist/`, extension `out/`, MCP `dist/`, MCP `site/`, coverage outputs, and Hypothesis temp data.
- [ ] Remove old top-level extracted folders after the target layout is populated.

### Task 2: Patch Root Workspace

**Files:**

- Create/modify: `package.json`, `pnpm-workspace.yaml`, `.node-version`, `.nvmrc`, `.python-version`, `.npmrc`, `uv.toml`, `.gitignore`, `.gitattributes`
- Create/modify: `README.md`, `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`
- Create/modify: `.release-please-manifest.json`, `release-please-config.json`, `renovate.json`, `Taskfile.yml`

- [ ] Write root workspace metadata and scripts exactly around version `1.0.0`.
- [ ] Keep root `private: true` and use it only for orchestration.
- [ ] Add release-please monorepo config for the extension, Python server, and npm wrapper.

### Task 3: Patch Package Metadata

**Files:**

- Modify: `apps/vscode-extension/package.json`
- Modify: `packages/mcp-server/pyproject.toml`
- Modify: `packages/mcp-server/src/kicad_mcp/__init__.py`
- Modify: `packages/mcp-server/mcp.json`
- Modify: `packages/mcp-server/server.json`
- Modify: `packages/mcp-npm/package.json`
- Modify: `packages/mcp-npm/bin/kicad-mcp-pro.js`

- [ ] Set every package version to `1.0.0`.
- [ ] Set repository, homepage, bugs, docs, and MCP identity fields to `oaslananka/kicad-studio-kit`.
- [ ] Preserve public package identities: `kicadstudio`, `kicad-mcp-pro`, and `io.github.oaslananka/kicad-mcp-pro`.

### Task 4: Replace CI and Publish Workflows

**Files:**

- Create/modify: `.github/workflows/ci.yml`
- Create/modify: `.github/workflows/release-please.yml`
- Create/modify: `.github/workflows/publish-extension.yml`
- Create/modify: `.github/workflows/publish-python.yml`
- Create/modify: `.github/workflows/publish-npm.yml`
- Create/modify: `.github/workflows/publish-mcp-registry.yml`
- Create/modify: `.github/workflows/docs.yml`
- Create/modify: `.github/workflows/security.yml`
- Create/modify: `.github/workflows/scorecard.yml`
- Create/modify: `.github/workflows/codeql.yml`
- Create/modify: `.github/workflows/gitleaks.yml`
- Create/modify: `.github/workflows/stale.yml`
- Create/modify: `.github/workflows/sync-labels.yml`

- [ ] Use GitHub-only triggers and environments.
- [ ] Use pinned action SHAs that were verified to avoid deprecated Node action runtimes.
- [ ] Avoid token publishing for PyPI/npm by using OIDC trusted publishing.
- [ ] Use only neutral marketplace secrets `VSCE_PAT` and `OVSX_PAT`.

### Task 5: Add Validation Scripts and Docs

**Files:**

- Create: `scripts/check-no-forbidden-refs.mjs`
- Create: `scripts/check-version-consistency.mjs`
- Create: `scripts/check-publish-preflight.mjs`
- Create/modify: `docs/index.md`, `docs/architecture.md`, `docs/release.md`, `docs/publishing.md`, `docs/integration.md`, `docs/security.md`

- [ ] Add forbidden-reference scanning with binary/generated ignores.
- [ ] Add version consistency validation across all release surfaces.
- [ ] Add publish preflight checks for registry availability and required external setup.
- [ ] Rewrite docs around one canonical GitHub repository and remove Azure/GitLab/mirror topology references.

### Task 6: Validate and Report

**Commands:**

- `corepack pnpm install --frozen-lockfile`
- `uv sync --all-extras --frozen --project packages/mcp-server`
- `corepack pnpm run check:forbidden-refs`
- `corepack pnpm run check:version`
- `corepack pnpm --filter kicadstudiokit run build`
- `corepack pnpm --filter kicadstudiokit run package`
- `Push-Location packages/mcp-server; uv build; corepack pnpm run mcp:manifest:check; Pop-Location`
- `Push-Location packages/mcp-npm; npm pack --dry-run; Pop-Location`

- [ ] Run the narrow required checks and fix failures.
- [ ] Run broader checks where the local toolchain supports them.
- [ ] Record Git, remote CI, NotebookLM, and external publish setup blockers honestly.
