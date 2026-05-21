# Publishing

The canonical source and release authority is
`https://github.com/oaslananka/kicad-studio-kit`.

All CI/CD, release, registry, package-manager, signing, provenance, and
attestation workflows are owned by that canonical repository.

## PyPI

Python package releases use `.github/workflows/release-please.yml` in
`oaslananka/kicad-studio-kit`. The workflow builds the Python distributions,
creates release artifacts, generates SBOM and checksum files, signs artifacts
with Sigstore, creates GitHub artifact attestations, and publishes to PyPI only
when release-please reports that a release was created and the protected
`release` environment is approved.

The release workflow uses PyPI Trusted Publishing through GitHub Actions OIDC.
Long-lived package-index token secrets should not be needed once the PyPI
trusted publisher is configured.

## GitHub Releases

GitHub Release artifacts are produced by `.github/workflows/release-please.yml`.
Expected release assets include:

- Python wheel and source distribution under `dist/`
- `SHA256SUMS.txt` from the `python-release-evidence` workflow artifact
- `bom.json` SBOM
- Sigstore signing artifacts
- GitHub artifact attestations attached to the release workflow run

Verification guidance lives in
[Release Integrity](security/release-integrity.md).

## GHCR Container Image

Container image publishing is handled by `.github/workflows/docker-publish.yml`
in the canonical repository. The image name is:

```text
ghcr.io/oaslananka/kicad-studio-kit/kicad-mcp-pro
```

The Docker workflow runs from published GitHub Releases and uses the
release-please tag as the image version. Provenance attestation runs only when
an image was pushed. The workflow does not publish a mutable `latest` tag; use
the release version tag or the immutable GHCR digest.

Use the stdio image with MCP clients:

```bash
docker run --rm -i ghcr.io/oaslananka/kicad-studio-kit/kicad-mcp-pro:<version>
```

Run streamable HTTP explicitly:

```bash
docker run --rm -p 3334:3334 ghcr.io/oaslananka/kicad-studio-kit/kicad-mcp-pro:<version> kicad-mcp-pro serve --transport http --host 0.0.0.0 --port 3334
```

DockerHub publishing is not enabled. The configured DockerHub secrets are
reserved for a future explicitly gated workflow.

## MCP Registry

`server.json` is the official MCP registry manifest because the current MCP
registry documentation points publishers at the `server.json` schema hosted by
Model Context Protocol. `mcp.json` is kept as a compatibility manifest for
clients and registries that still expect the older repository-root metadata
shape.

Both files must remain synchronized with:

- `pyproject.toml` project name and version
- Canonical repository URL
- CLI command `kicad-mcp-pro`
- PyPI package metadata
- GHCR image metadata

Validation commands:

```bash
uv run python scripts/sync_mcp_metadata.py --check
uv run python scripts/validate_mcp_manifest.py
```

Publishing is handled by `.github/workflows/mcp-registry.yml`. The workflow
validates metadata on pull requests and relevant pushes. Real publishing is
manual only, requires `publish=true`, uses the protected `release` environment,
and requires `MCP_REGISTRY_TOKEN` when a token-backed target is configured.

If an official target is selected, the workflow uses `mcp-publisher` with
GitHub OIDC. If a generic or third-party target is selected without a configured
URL, the adapter fails fast instead of pretending to publish.

## Homebrew

Homebrew tap updates are scaffolded by `.github/workflows/homebrew-publish.yml`
after a GitHub Release is published.

- The workflow creates a pull request against `oaslananka/homebrew-tap`.
- The workflow uses `PACKAGE_MANAGER_TOKEN`.
- The workflow does not push directly to the tap `main` branch.

The formula installs from the PyPI source distribution using Homebrew's Python
virtualenv helper and generated Python resources.

## Scoop

Scoop bucket updates are scaffolded by `.github/workflows/scoop-publish.yml`
after a GitHub Release is published.

- The workflow creates a pull request against `oaslananka/scoop-bucket`.
- The workflow uses `PACKAGE_MANAGER_TOKEN`.
- The workflow does not push directly to the bucket `main` branch.

The manifest references the PyPI wheel for version/hash metadata and installs
the Python package into the Scoop app directory at install time.

## npm Wrapper

The repository root `package.json` is private and exists only for hooks and CI
scripts. It must not be published to npm.

The optional npm wrapper lives under `npm-wrapper/`:

```text
npm-wrapper/package.json
npm-wrapper/bin/kicad-mcp-pro.js
```

The wrapper package name is `@oaslananka/kicad-mcp-pro`. It does not install
Python dependencies during the package-manager install lifecycle; at runtime it
executes:

```bash
uvx kicad-mcp-pro
```

No npm publish workflow is enabled yet. npm trusted publishing is available, but
the package must be configured in npm before a guarded workflow is added.

## Required Configuration

Required GitHub environment:

- `release`

Required GitHub secrets:

- `MCP_REGISTRY_TOKEN`
- `PACKAGE_MANAGER_TOKEN`
- `NPM_TOKEN` only if npm trusted publishing is not used for a future wrapper
  publish workflow

Required GitHub variables:

- `MCP_REGISTRY_URL`

## Install Examples

Linux and macOS:

```bash
uvx kicad-mcp-pro
pipx install kicad-mcp-pro
docker run --rm -i ghcr.io/oaslananka/kicad-studio-kit/kicad-mcp-pro:<version>
```

Windows PowerShell:

```powershell
uvx kicad-mcp-pro
pipx install kicad-mcp-pro
docker run --rm -i ghcr.io/oaslananka/kicad-studio-kit/kicad-mcp-pro:<version>
```

Claude Desktop stdio example:

```json
{
  "mcpServers": {
    "kicad-mcp-pro": {
      "command": "uvx",
      "args": ["kicad-mcp-pro"]
    }
  }
}
```

The CLI can also generate client snippets:

```bash
kicad-mcp-pro mcp-config generate --client claude
kicad-mcp-pro mcp-config generate --client cursor
kicad-mcp-pro mcp-config generate --client vscode
kicad-mcp-pro mcp-config generate --client codex
```

Container stdio example:

```json
{
  "mcpServers": {
    "kicad-mcp-pro": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "ghcr.io/oaslananka/kicad-studio-kit/kicad-mcp-pro:<version>"]
    }
  }
}
```
