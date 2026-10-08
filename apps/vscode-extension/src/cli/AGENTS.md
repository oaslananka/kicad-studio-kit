# KiCad CLI Boundary Agent Instructions

These instructions apply to `apps/vscode-extension/src/cli/**` and supplement the parent
extension and root instructions.

## External-process boundary

KiCad CLI paths, command arguments, working directories, project files and process output
cross an external-process trust boundary.

- Use argument-array process execution; do not introduce shell-string execution for KiCad
  commands.
- Require an existing absolute working directory where the runner contract expects one.
- Reject empty arguments and control-line characters that can corrupt logs or command
  interpretation.
- Preserve timeout, cancellation and request de-duplication behavior.
- Keep stdout/stderr bounded; the current runner uses a 10 MiB limit per captured stream.
- Redact sensitive paths, define-variable values and secret-bearing output before logging
  or surfacing failures.
- Do not turn unsupported/missing capability probes into optimistic success.

## Capability ownership

- `kicadCliCapabilities.ts` owns the pure immutable capability/version model.
- `kicadCliDetector.ts` owns discovery, path validation, subprocess probes and caches.
- `kicadCliSupport.ts` owns user-facing support decisions/descriptions.
- Deterministic command construction belongs in the existing pure builders where one
  exists; keep process/UI/filesystem concerns out of those modules.

Do not re-couple these responsibilities merely to reduce file count.

## Compatibility and paths

- Gate version-specific commands on detected KiCad capabilities and the repository support
  matrix.
- Preserve canonical path handling and workspace confinement in the higher-level guarded
  export/import flows.
- Never log a full private project path when the existing redaction layer would hide it.

## Validation

Run focused CLI tests plus extension lint/typecheck. For command/export behavior, also run
the relevant compatibility, fixture or integration lane and
`corepack pnpm run check:vscode-architecture`.
