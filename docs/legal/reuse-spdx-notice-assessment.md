# REUSE, SPDX, and NOTICE Assessment

Audit date: 2026-09-14

This assessment records the repository's current license metadata, historical MIT
status, REUSE readiness, SPDX posture, and third-party notice handling.

## Current license posture

| Area                       | Status    | Evidence                                                                                          |
| -------------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| Repository license         | Passed    | Root `LICENSE` is PolyForm Noncommercial 1.0.0.                                                   |
| Root package metadata      | Passed    | Root `package.json` declares `PolyForm-Noncommercial-1.0.0`.                                      |
| Extension package metadata | Passed    | `apps/vscode-extension/package.json` declares the same current license.                           |
| Extension packaged license | Passed    | The VSIX includes `apps/vscode-extension/LICENSE`.                                                |
| Earlier MIT revisions      | Preserved | Previously published MIT revisions remain under the MIT grants already made.                      |
| Third-party notices        | Preserved | KiCanvas retains its upstream MIT notice under `apps/vscode-extension/media/kicanvas/NOTICE.txt`. |
| Per-file SPDX headers      | Partial   | Not consistently present across all source and documentation files.                               |
| REUSE compliance           | Partial   | Full repository-wide REUSE metadata is not currently claimed.                                     |

## Decision

Current project-authored source is source-available under PolyForm Noncommercial
1.0.0. Commercial use requires a separate written license. This change is
prospective and does not revoke rights already granted for MIT-licensed versions.
Third-party dependencies and bundled materials retain their own licenses.
