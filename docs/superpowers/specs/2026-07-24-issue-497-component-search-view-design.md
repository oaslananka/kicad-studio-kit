# Issue #497 Component Search View Boundary Design

## Goal

Separate deterministic Component Search view contracts and HTML rendering from provider, cache, secret, filesystem, PCM, and VS Code orchestration without changing generated webview output or public imports.

## Boundary

`components/componentSearchView.ts` owns the search/detail view-state contracts, CSP-bearing HTML documents, remote-text escaping, result rows, provider chips, suggestions, and browser message wiring. It may depend only on shared result types and the repository localization injector.

`components/componentSearch.ts` keeps provider selection, network/cache fallbacks, local-library and PCM lookup, secrets/settings, project-context recommendations, view-model calculation, panel lifecycle, and command handling. It re-exports the existing renderer API during this phase.

## Regression Contract

The phase must preserve representative search and detail HTML byte-for-byte, keep remote values escaped, pass Component Search unit and accessibility tests, keep the production graph cycle-free, and pass the full repository release-confidence gate.
