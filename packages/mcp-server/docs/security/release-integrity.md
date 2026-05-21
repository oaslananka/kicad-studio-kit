# Release Integrity

Release integrity controls are emitted only from the canonical repository,
`oaslananka/kicad-studio-kit`.

## SBOM

The release workflow generates a CycloneDX SBOM as a release artifact:

```text
dist/bom.json
```

Download it from the GitHub Release or the release workflow artifacts and keep
it with the Python distributions being audited.

## SHA256SUMS

Release checksums are published as workflow evidence, separate from the PyPI
distribution upload directory:

```text
packages/mcp-server/release-evidence/SHA256SUMS.txt
```

In workflow artifacts, download `python-release-evidence` next to the
`python-dist` wheel and source distribution artifacts before verification.

Verify a downloaded artifact:

```bash
sha256sum --check SHA256SUMS.txt
```

On Windows PowerShell:

```powershell
Get-FileHash .\kicad_mcp_pro-<version>-py3-none-any.whl -Algorithm SHA256
```

Compare the hash with the matching line in `SHA256SUMS.txt`.

## Sigstore

The release workflow signs Python distribution artifacts with Sigstore using
GitHub Actions OIDC identity. Verify identity-bound signatures with the Sigstore
CLI:

```bash
python -m sigstore verify identity \
  --cert-identity "https://github.com/oaslananka/kicad-studio-kit/.github/workflows/release-please.yml@refs/tags/v<version>" \
  --cert-oidc-issuer "https://token.actions.githubusercontent.com" \
  dist/kicad_mcp_pro-<version>-py3-none-any.whl
```

Use the matching tag reference and artifact filename for the release being
verified.

## GitHub Artifact Attestations

The release workflow creates GitHub artifact attestations for release assets.
Verify a local artifact:

```bash
gh attestation verify dist/kicad_mcp_pro-<version>-py3-none-any.whl \
  --repo oaslananka/kicad-studio-kit
```

For source distributions:

```bash
gh attestation verify dist/kicad_mcp_pro-<version>.tar.gz \
  --repo oaslananka/kicad-studio-kit
```

## GHCR Image Digest and Provenance

Inspect the published image digest:

```bash
docker buildx imagetools inspect ghcr.io/oaslananka/kicad-studio-kit/kicad-mcp-pro:<version>
```

Pull by digest for reproducible deployment:

```bash
docker pull ghcr.io/oaslananka/kicad-studio-kit/kicad-mcp-pro@sha256:<digest>
```

Verify the image attestation with GitHub CLI:

```bash
gh attestation verify oci://ghcr.io/oaslananka/kicad-studio-kit/kicad-mcp-pro@sha256:<digest> \
  --repo oaslananka/kicad-studio-kit
```

The Docker workflow publishes provenance only when the image is pushed.

## PyPI Trusted Publishing

The release workflow is configured for PyPI Trusted Publishing through GitHub
Actions OIDC. PyPI and TestPyPI project owners must configure trusted
publishers for:

- Owner: `oaslananka`
- Repository: `kicad-mcp-pro`
- Workflow: `release-please.yml`
- Environment: `release`

After the publisher is configured, long-lived package-index token secrets should
not be used by CI.

## DockerHub

DockerHub publishing is not enabled. GHCR is the canonical container registry.
If DockerHub support is added later, it must be manual or tag gated, protected by
the `release` environment, and documented with the exact digest and provenance
verification path.
