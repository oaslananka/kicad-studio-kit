# Issue #497 Phase 5b: PCM Archive Boundary

## Goal

Extract checksum verification and ZIP archive extraction from `library/pcmService.ts` without changing repository fetching, install orchestration, extension state, or KiCad library-table persistence.

## Scope

- Add a narrow `library/pcmArchive.ts` module.
- Move SHA-256 verification and ZIP extraction into the module.
- Keep repository/network access, install path selection, CLI fallback, persisted state, reindexing, and notifications in `pcmService.ts`.
- Preserve existing direct-install behavior and injected test extractor support.

## Test-first contract

1. Add direct checksum and archive tests before the module exists.
2. Cover stored and deflate entries, malformed archives, unsupported methods, and traversal names.
3. Require the module to depend only on reviewed Node built-ins and no repository or VS Code module.
4. Preserve existing PCM service tests and the production zero-cycle graph.

## Validation

- focused `pcmArchive` and `pcmService` tests
- architecture dependency guard
- full extension unit, coverage-ratchet, security, accessibility, build, package, and repository pre-push gates

## Delivery

Use a dedicated PR referencing #497. Do not close #497; PCM persistence/table adapters and state-store decomposition remain later phases.
