# Protocol Change Checklist

OASLANA-76 defines the required pull request evidence for changes that affect
the MCP protocol boundary between the VS Code extension, `kicad-mcp-pro`, the
npm launcher, and shared compatibility metadata.

The pull request template contains the review checklist. This document explains
when the checklist applies and what each checked item means.

## When It Applies

Complete the protocol section in `.github/PULL_REQUEST_TEMPLATE.md` when a pull
request changes any of these surfaces:

- MCP tool names.
- MCP tool input or output schemas.
- Capability metadata.
- Streamable HTTP or session transport behavior.
- Server-info payload fields, versions, or compatibility ranges.
- Extension MCP adapter behavior.
- Compatibility metadata in `compatibility.yaml`, extension compatibility
  code, MCP server compatibility code, `mcp.json`, or `server.json`.

If none of those surfaces are touched, check `Not applicable` in the pull
request template and include the reason.

## Required Evidence

Protocol-impacting pull requests must account for each item below:

- Protocol schema updated.
- MCP server implementation updated.
- Extension MCP adapter updated.
- Contract tests updated.
- Compatibility matrix updated.
- Server-info/capabilities payload updated.
- Docs updated.
- Release notes considered for both products.
- Backward compatibility impact documented.

Use `Not applicable` only when the item is genuinely outside the changed
surface. For example, a docs-only clarification may not require server code
changes, but a tool schema change must update schemas, server behavior, adapter
expectations, and contract coverage together.

## CI And Review Visibility

The root check runs `check:protocol-pr-template` to keep the pull request
template, this architecture document, and the related contributor guidance in
sync. That check is intentionally lightweight: it verifies that protocol-impact
PRs remain visible in review without trying to infer protocol semantics from a
diff.

Run the narrow policy check directly with:

```bash
corepack pnpm run check:protocol-pr-template
```

Protocol-impacting changes still need the contract gate:

```bash
corepack pnpm run test:contract
```

When compatibility metadata or KiCad fixtures are touched, also run:

```bash
corepack pnpm run check:compatibility
corepack pnpm run test:fixtures
```

## Related Policy

- [Definition of done](definition-of-done.md)
- [Product boundaries](product-boundaries.md)
- [Release model](release-model.md)
- [Testing strategy](../testing-strategy.md)
