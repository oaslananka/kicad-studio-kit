# Maintenance Policy

## Release Backlog

- MCP fix queue Code Actions stay limited to fix items that include `path` and `line` metadata. Text-only queue items should remain visible until `kicad-mcp-pro` exposes universal source locations for all fixes.
- Replace `assets/screenshots/quality-gates.png` with a fresh development-host capture once a real project/server pair is available in the screenshot environment.
- Revisit MCP-side progress notification plumbing in the manufacturing release wizard after `notifications/progress` support is consistently exposed by the supported server range.
- Track post-release feedback for the `v2.6.x` patch line separately from KiCad Studio-only fixes and MCP-side schema requests.

## Report Hygiene

Transient planning reports belong outside source control. Durable findings should be copied into this policy, the changelog, or the relevant documentation page before generated report files are removed.

## Open Questions

No open maintenance questions are currently recorded.

## Plan Drift

No plan drift items are currently recorded.
