# Release Integrity

## Goals

Release integrity means users and maintainers can connect a published VSIX to reviewed source, repeatable packaging, checksums, SBOM, provenance, and GitHub release evidence.

## Current controls

- Release Please manages version PRs.
- Publish workflow packages and validates the extension.
- Release assets include checksums, SBOM, provenance, and release summary.
- GitHub artifact attestations are generated where workflow permissions allow.
- Marketplace publish jobs are separated from package/evidence generation.

## Required release evidence

| Evidence                  | Purpose                                |
| ------------------------- | -------------------------------------- |
| VSIX                      | Installable extension artifact.        |
| SHA256SUMS                | Integrity verification.                |
| SBOM                      | Dependency transparency.               |
| Provenance JSON           | Build and source traceability.         |
| Attestation               | Platform-verifiable artifact metadata. |
| Changelog/release summary | Human-readable impact summary.         |

## Not claimed

The repository does not currently claim a specific SLSA level. Make that claim only after an explicit SLSA assessment.
