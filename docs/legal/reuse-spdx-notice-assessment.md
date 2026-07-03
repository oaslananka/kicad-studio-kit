# REUSE, SPDX, and NOTICE Assessment

Audit date: 2026-07-03

This assessment resolves the solo-maintainer Professional OSS legal/readiness follow-up for license metadata, REUSE readiness, SPDX headers, and NOTICE handling.

## Current license posture

| Area | Status | Evidence |
| --- | --- | --- |
| Repository license | Passed | Root `LICENSE` is MIT. |
| Root package metadata | Passed | Root `package.json` declares MIT. |
| Extension package metadata | Passed | `apps/vscode-extension/package.json` declares MIT. |
| Extension packaged license | Passed | Extension package includes license files during VSIX packaging. |
| Per-file SPDX headers | Partial | Not consistently present across all source and documentation files. |
| REUSE compliance | Partial | Repository-level MIT license is clear, but full REUSE metadata is not yet implemented. |
| NOTICE file | Not required currently | MIT does not require a NOTICE file by default, and no bundled third-party notice requirement was identified in this pass. |

## Decision

For the current solo-maintainer Professional OSS target, the repository-level MIT license and package metadata are sufficient. A `NOTICE` file is not added in this pass because there is no confirmed bundled dependency notice requirement.

## Policy

- Keep the root `LICENSE` as the authoritative repository license.
- Keep package metadata aligned with the root license.
- Add per-file SPDX identifiers opportunistically for new source files when practical.
- Do not claim full REUSE compliance until a dedicated REUSE pass is completed.
- Add `NOTICE` only after a concrete dependency or legal review identifies a notice obligation.

## Future optional work

A future REUSE hardening PR may add:

- `REUSE.toml` or equivalent metadata;
- SPDX headers for source files;
- generated-file exclusions;
- a CI check using a REUSE-compatible tool;
- a third-party notice inventory for packaged artifacts.
