# Issue #497 Export Command Builder Boundary Design

## Goal

Reduce change coupling in `cli/exportCommands.ts` by separating deterministic KiCad CLI argument construction from VS Code configuration, filesystem discovery, command execution, and result presentation without changing any exported command line or user-visible behavior.

## Context

The issue #497 hotspot map ranks `cli/exportCommands.ts` next after the completed CLI capability and viewer-controller phases. The file currently owns command-kind types, settings lookup, command argument construction for every export format, Gerber layer discovery, a large VS Code-facing execution service, output validation, preset workflows, and presentation. The command-construction switch is a stable responsibility boundary because it transforms typed inputs into argument arrays and does not need filesystem or process access.

## Approaches Considered

### 1. Extract a pure command builder and keep a compatibility wrapper

Create `cli/exportCommandBuilder.ts` with the command-kind types, structured options, version gates, default values, output-path derivation, and 3D/variant argument helpers. Keep `buildCliExportCommands()` in `exportCommands.ts` as the public compatibility wrapper that reads VS Code settings and delegates to the pure builder.

**Advantages:** behavior-neutral; narrow typed interface; no VS Code, filesystem, process, or UI dependency in the builder; existing callers and tests continue to use the current API; future service extraction has a stable dependency.

**Disadvantages:** `exportCommands.ts` remains large because execution and presentation stay together until a later phase.

### 2. Move the complete export service in one change

Extract command construction, target resolution, execution, output collection, presets, packaging, and UI notifications together.

**Advantages:** largest immediate line-count reduction.

**Disadvantages:** combines several risk boundaries, creates a difficult review, and makes regressions in path safety, cancellation, packaging, and presentation harder to localize.

### 3. Split one module per export format

Create separate builders for Gerber, schematic, 3D, manufacturing, BOM, and netlist exports.

**Advantages:** fine-grained ownership.

**Disadvantages:** premature fragmentation before a shared pure-builder contract exists; increases module and dispatch complexity without first proving the boundary.

## Decision

Use approach 1 as phase 3a. This phase extracts only deterministic command construction. Gerber layer discovery, active-variant project-file reading, option probing, execution, path validation, packaging, presets, and user notifications remain in `exportCommands.ts` for later #497 phases.

## Architecture

- `cli/exportCommandBuilder.ts` owns `ExportCommandKind`, `ExportCommandBuildOptions`, deterministic default values, command arrays, KiCad-major feature gates, output-file naming, common 3D arguments, and variant flags.
- `cli/exportCommands.ts` remains the compatibility and orchestration surface. Its `buildCliExportCommands()` reads the existing VS Code settings and delegates to `buildExportCommands()` with resolved options.
- `KiCadExportService` continues to own target selection, capability detection, command execution, cancellation, safe output paths, packaging, presets, state reporting, and user-facing messages.
- Existing imports from `cli/exportCommands.ts` remain valid through type re-exports and the compatibility wrapper.
- The pure builder has no `vscode`, filesystem, process, state-store, detector, runner, logger, or UI dependency.

## Interfaces

```ts
export type ExportCommandKind = /* existing command-kind union */;

export interface ExportCommandBuildOptions {
  versionMajor?: number;
  precision?: string;
  ipcVersion?: string;
  ipcUnits?: string;
  theme?: string;
  bomFields?: string[];
  gerberLayers?: string[];
  variant?: string;
  includeTracks?: boolean;
  includePads?: boolean;
  includeZones?: boolean;
  includeInnerCopper?: boolean;
  includeSilkscreen?: boolean;
  includeSoldermask?: boolean;
  substModels?: boolean;
  noOptimizeStep?: boolean;
  boardOnly?: boolean;
  translateDNP?: boolean;
  noUnspecified?: boolean;
}

export function buildExportCommands(
  kind: ExportCommandKind,
  file: string,
  outputDir: string,
  options?: ExportCommandBuildOptions
): string[][];
```

The direct builder uses the same current fallback values when an option is absent: KiCad 9, Gerber precision 6, IPC-2581 revision C, millimetres, dark theme, and no BOM fields. The compatibility wrapper supplies configured values first, so existing settings behavior remains unchanged.

## Error Handling and Security

- The builder never executes commands or touches the filesystem.
- Path safety remains enforced by `KiCadExportService` before execution.
- Caller-provided file and output paths remain opaque command arguments; the builder does not invoke a shell.
- Unsupported KiCad-major combinations continue to return an empty command list.
- No command flags, defaults, file extensions, layer lists, or output naming rules change.

## Validation

1. Add a focused unit test that defines the pure builder contract and fails before the module exists.
2. Exercise every command kind and the KiCad 7/8/9/10 version gates through the pure interface.
3. Assert the builder source has no `vscode` import and that direct options are deterministic.
4. Keep all existing `exportCommands.test.ts` service and compatibility-wrapper tests passing.
5. Run lint, typecheck, security tests, architecture-cycle validation, full unit/coverage gates, build, repeatable VSIX, package validation, and the complete repository gate.
6. Confirm production bundle and performance budgets do not regress.

## Scope Boundaries

This phase does not:

- change any CLI arguments, defaults, output paths, or supported versions;
- change export execution, cancellation, progress, state reporting, or notifications;
- move Gerber layer discovery or project variant discovery;
- alter preset, jobset, manufacturing-package, BOM, or archive behavior;
- modify MCP code or protocol behavior;
- combine unrelated hotspot work.
