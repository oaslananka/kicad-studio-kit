# Issue #497 Component Search View Extraction Plan

1. Add a focused pure-renderer test before introducing the module.
2. Move view contracts and search/detail HTML helpers into `componentSearchView.ts`.
3. Import and compatibility re-export the extracted API from `componentSearch.ts`.
4. Compare representative generated HTML before and after extraction.
5. Update the hotspot map and architecture ownership guard.
6. Run focused tests, lint, typecheck, architecture, accessibility, packaging, and the full repository gate.
