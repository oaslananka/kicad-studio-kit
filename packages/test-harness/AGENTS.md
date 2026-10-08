# Test Harness Agent Instructions

These instructions apply to `packages/test-harness/**` and supplement the repository
root `AGENTS.md`.

## Boundary

`@oaslananka/kicad-test-harness` is private, test-only infrastructure. It is not a
production dependency or release surface.

- Product tests may import this package.
- Production source must not import the test harness.
- The harness must not import product internals from `apps/vscode-extension`.
- Keep helpers generic enough to serve tests without becoming a second implementation of
  product behavior.
- Prefer Node standard-library and test-only dependencies; do not add runtime coupling to
  VS Code or KiCad product modules.

## Helper design

- Helpers should be deterministic, cross-platform and safe for parallel test execution.
- Temporary workspace helpers must isolate state and avoid assuming developer-specific
  absolute paths.
- Golden/snapshot helpers should normalize unstable data deliberately rather than hide real
  semantic drift.
- Log helpers must redact secrets and private paths consistently with product tests.
- A reusable helper should not require a running VS Code or KiCad GUI session unless the
  helper is explicitly an integration harness for that environment.

## Architecture guard

The root `check:boundaries` gate enforces both sides of this contract: production source
cannot import the harness and the harness cannot reach into product internals. Do not add
exceptions simply to share a convenience function.

## Validation

Run:

```text
corepack pnpm --dir packages/test-harness run check
corepack pnpm run check:boundaries
```
