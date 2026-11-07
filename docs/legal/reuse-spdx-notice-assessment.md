# REUSE, SPDX, and NOTICE Assessment

Audit baseline: 2026-09-14
Updated for current MIT license: 2026-11-04

This assessment records the repository's current license metadata, historical MIT
status, REUSE readiness, SPDX posture, and third-party notice handling.

## Current license posture

| Area                       | Status    | Evidence                                                                                          |
| -------------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| Repository license         | Passed    | Root `LICENSE` is MIT.                                                                            |
| Root package metadata      | Passed    | Root `package.json` declares `MIT`.                                                               |
| Extension package metadata | Passed    | `apps/vscode-extension/package.json` declares the same current license.                           |
| Extension packaged license | Passed    | The VSIX includes `apps/vscode-extension/LICENSE`.                                                |
| Earlier MIT revisions      | Preserved | Previously published MIT revisions remain under the MIT grants already made.                      |
| Third-party notices        | Preserved | KiCanvas retains its upstream MIT notice under `apps/vscode-extension/media/kicanvas/NOTICE.txt`. |
| Per-file SPDX headers      | Partial   | Not consistently present across all source and documentation files.                               |
| REUSE compliance           | Partial   | Full repository-wide REUSE metadata is not currently claimed.                                     |

## Decision

Current project-authored source returned to the MIT License on 2026-11-04,
including commercial reuse under MIT notice conditions. This does not
retroactively rewrite terms of already distributed PolyForm-licensed releases.
Third-party dependencies and bundled materials retain their own licenses.
