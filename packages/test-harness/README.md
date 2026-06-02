# KiCad Test Harness

`@oaslananka/kicad-test-harness` contains reusable test utilities for the
KiCad Studio Kit monorepo. It is a private workspace package and is not a
production dependency for any released product.

## What Belongs Here

- KiCad fixture path helpers.
- Temporary workspace and project copy helpers.
- Golden text and JSON comparison helpers.
- KiCad CLI command wrappers for tests.
- Mock MCP Streamable HTTP server and client helpers.
- VS Code extension integration launch/workspace helpers.
- VS Code and Playwright-compatible webview API mocks.
- Log redaction helpers.
- Cross-platform path helpers for Windows, Linux, and macOS.

## Usage Rules

- Product tests may import helpers from this package.
- Production code under `apps/vscode-extension/src` and `packages/mcp-server/src`
  must not import this package.
- The harness must not import product internals. Keep it limited to Node
  standard library utilities and other shared packages.
- New helpers should be deterministic and should not require a running VS Code
  or KiCad GUI session.

## Examples

```ts
import {
  createTempWorkspace,
  kicadFixturePath,
  readGoldenJson,
  stableJson,
} from "@oaslananka/kicad-test-harness";

const fixture = kicadFixturePath("clean-led-kicad10");
const workspace = createTempWorkspace({ sourcePath: fixture });

try {
  const expected = readGoldenJson(
    kicadFixturePath(
      "clean-led-kicad10",
      "expected",
      "project-tree.snapshot.json",
    ),
  );
  const actual = stableJson({ fixture: "clean-led-kicad10" });
  void expected;
  void actual;
} finally {
  workspace.cleanup();
}
```

## Validation

```bash
corepack pnpm --dir packages/test-harness run check
corepack pnpm run check:boundaries
```

The root boundary check enforces both sides of the contract: production sources
cannot import the harness, and the harness cannot import product internals.
