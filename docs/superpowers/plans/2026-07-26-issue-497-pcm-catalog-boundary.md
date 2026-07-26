# Issue #497 Phase 5a: PCM Catalog Boundary

## Goal

Extract the immutable PCM catalog model from `library/pcmService.ts` without changing package discovery, installation, persistence, or UI behavior.

## Scope

- Add a pure `library/pcmCatalog.ts` module.
- Move public PCM catalog types and `PCM_PACKAGE_KINDS` into the pure module.
- Move package/version normalization, classification, selection, comparison, search scoring, and KiCad JSON serialization into the pure module.
- Preserve the existing `pcmService.ts` import surface through compatibility re-exports.
- Keep networking, checksums, ZIP extraction, filesystem writes, library-table persistence, VS Code state, CLI execution, and notifications in `pcmService.ts`.

## Test-first contract

1. Add direct catalog unit tests before the module exists.
2. Require the catalog module to have zero relative production dependencies and no `node:*` or `vscode` imports.
3. Preserve existing PCM service tests and legacy imports.
4. Keep the production TypeScript graph at zero cycles.

## Validation

- `corepack pnpm --filter kicadstudiokit test -- --runInBand test/unit/pcmCatalog.test.ts test/unit/pcmService.test.ts`
- `corepack pnpm run check:vscode-architecture`
- `corepack pnpm --filter kicadstudiokit run lint`
- `corepack pnpm --filter kicadstudiokit run typecheck`
- full pre-push repository gate

## Delivery

Use a dedicated PR referencing #497. Do not close #497; PCM installation and persistence boundaries remain later phases.
