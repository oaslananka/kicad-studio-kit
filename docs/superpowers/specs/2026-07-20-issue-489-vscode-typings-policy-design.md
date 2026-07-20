# Issue 489 VS Code Typings Policy Design

## Goal

Align Renovate's `@types/vscode` cap with the extension's supported VS Code minimum and prevent policy drift among package metadata, compatibility metadata, and dependency automation.

## Policy

The extension compiles against the API surface available at its minimum supported VS Code version. Therefore:

- `apps/vscode-extension/package.json` `engines.vscode` uses a caret range whose lower bound is the supported minimum;
- `compatibility.yaml` `vscode.minimum` equals that lower bound;
- `compatibility.yaml` `vscode.enginesRange` equals `engines.vscode`;
- the exact `@types/vscode` development dependency equals the lower bound;
- Renovate's dedicated `@types/vscode` `allowedVersions` cap equals `<=<lower-bound>`.

This prevents source code from silently compiling against APIs unavailable at the declared minimum. Raising VS Code API typings requires an intentional minimum-engine change across all surfaces.

## Validation design

A standalone Node script will parse the three repository surfaces and return all policy errors in one run. It will require explicit `major.minor.patch` versions and explicit `^`/`<=` syntax so ambiguous ranges fail closed. It will identify the dedicated Renovate cap rule by the presence of both `@types/vscode` in `matchPackageNames` and an `allowedVersions` field; the separate high-risk review rule remains valid and unchanged.

The check will be deterministic and offline. It will be wired into the root `check` chain immediately after the compatibility contract.

## Testing

Node tests will cover:

- the repository's current state;
- a stale Renovate cap;
- compatibility minimum/range drift;
- an `@types/vscode` version above the declared minimum;
- package-script wiring.

Tests and contract metadata will reference `#489`.

## Scope boundaries

This change does not raise the extension engine, update the typings package, alter Renovate scheduling, or change runtime behavior.
