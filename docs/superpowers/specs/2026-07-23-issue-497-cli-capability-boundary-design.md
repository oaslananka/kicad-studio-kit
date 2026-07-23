# Issue #497 CLI Capability Boundary Design

## Status

Approved for incremental implementation on 2026-07-23. This phase is limited to the KiCad CLI capability model, the only current production import cycle, and a durable hotspot/dependency map. It does not decompose viewer, export, PCM, component-search, or state-store behavior in the same PR.

## Problem

The extension production TypeScript graph contains one cycle:

```text
cli/kicadCliDetector.ts -> cli/kicadCliSupport.ts
cli/kicadCliSupport.ts  -> cli/kicadCliDetector.ts
```

The detector imports `parseKiCadMajor()` from the support module, while the support module imports the detector-owned capability snapshot type. This couples platform discovery/probing to product support presentation and makes either module harder to change independently.

The 2026-07-23 snapshot also confirms the next hotspot order:

| Target                          |        Lines | Changes in last 100 commits | Risk boundary                                                |
| ------------------------------- | -----------: | --------------------------: | ------------------------------------------------------------ |
| `providers/viewerHtml.ts`       |        1,997 |                          10 | visual/browser contract; visual regression required          |
| `cli/exportCommands.ts`         |        1,916 |                           4 | command construction/execution; integration and package risk |
| `components/componentSearch.ts` |        1,215 |                           6 | network/cache/UI result normalization                        |
| `library/pcmService.ts`         |        1,142 |                           3 | HTTP, archive verification, install, persistence             |
| `state/stateStores.ts`          |          888 |                           5 | multiple domain stores and migration state                   |
| `types.ts` / `constants.ts`     | 970 combined |                          29 | broad fan-in; split only alongside owning domains            |

`mcpClient.ts` remains out of scope because #492 owns its protocol/transport migration.

## Chosen approach

Create `src/cli/kicadCliCapabilities.ts` as a pure model module. It owns:

- `KiCadCliCapabilityName`;
- `KiCadCliCapabilitySnapshot`;
- `parseKiCadMajor()`;
- `deriveCommandVersionStatus()`.

`kicadCliDetector.ts` keeps platform discovery, process execution, help probing, caches, and snapshot construction. `kicadCliSupport.ts` keeps user-facing support-line and feature descriptions. Both depend on the pure capability model; neither depends on the other.

Existing detector exports are retained as compatibility re-exports during this phase so unrelated consumers are not forced into the same refactor. Direct type-only consumers touched by this phase use the new model module.

## Alternatives rejected

1. **Move only `parseKiCadMajor()`.** This removes the literal cycle but leaves capability types owned by the process-oriented detector. It does not establish a stable model boundary.
2. **Split the entire detector into discovery, process, probe, cache, and snapshot services now.** This is a larger behavioral refactor than needed to remove the cycle and would violate the issue requirement to keep unrelated behavior changes separate.
3. **Introduce an abstract detector interface in the support layer.** The support layer only needs immutable capability data, not a detector service. An interface would preserve unnecessary runtime coupling.

## Architecture guard

Add a dependency-free production TypeScript import-graph checker. It scans `apps/vscode-extension/src/**/*.ts`, resolves relative `.ts` and `index.ts` imports, reports strongly connected components, and fails when any cycle exists. Test, declaration, generated, distribution, and dependency directories are excluded.

The guard is wired into the root `check` command. This prevents the removed cycle or a new production cycle from silently returning.

## Compatibility and error handling

- Public runtime behavior and strings remain unchanged.
- Existing imports from `kicadCliDetector.ts` continue to work through re-exports.
- The graph checker fails closed on unresolved repository roots or detected cycles, but ignores external package imports.
- No runtime dependency is added.

## Testing

- Unit tests cover parsing and version-status derivation in the new pure module.
- Existing detector and support tests must pass unchanged or with import-only updates.
- Architecture tests cover acyclic graphs, direct and multi-node cycles, index resolution, and root script wiring.
- Extension lint, typecheck, focused unit tests, full unit suite, performance budgets, package validation, and the pinned full repository gate must pass.

## Rollback

Revert the phase commit. Do not restore the direct cycle as a temporary workaround; if the new module causes an integration problem, keep the model boundary and restore compatibility through re-exports or adapters.
