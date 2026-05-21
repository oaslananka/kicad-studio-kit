# ADR 0006: VS Code Web Compatibility

Status: Accepted

Date: 2026-05-21

## Context

KiCad Studio is a VS Code extension for local KiCad project work. The current
extension runtime depends on Node.js extension-host capabilities for the core
workflow:

- KiCad CLI detection and command execution use Node child processes.
- KiCad desktop launch helpers use local executable discovery.
- MCP discovery and integration assume a local or workspace-side process.
- Manufacturing exports, DRC/ERC, BOM/netlist extraction, and status reporting
  depend on a trusted workspace with access to local files and installed KiCad
  tooling.

KiCanvas is browser-capable and can render schematic and PCB data inside a
webview, but that does not make the complete extension a VS Code Web extension.
The official VS Code Web Extensions guide says web extensions use a `browser`
entry point, run in a browser WebWorker sandbox, cannot use Node.js APIs, and
cannot create child processes or run executables. The VS Code Extension Host
guide also distinguishes Node.js extension hosts from browser extension hosts
and recommends `extensionKind: ["workspace"]` for extensions that need workspace
contents. The Extension Manifest reference defines `extensionKind` as the
manifest field that declares the preferred extension-host location.

Sources checked on 2026-05-21: the official VS Code API Web Extensions guide,
Extension Host guide, and Extension Manifest reference.

## Decision

Choose option 3 from OASLANA-111: KiCad Studio is desktop / remote workspace
extension-host only and is not a VS Code Web target.

The extension manifest must keep:

```json
"main": "./dist/extension.js",
"extensionKind": ["workspace"]
```

The extension manifest must not add:

```json
"browser": "./dist/web/extension.js"
```

No `web/extension.js`, `src/web/extension.ts`, `compile-web`, `package-web`, or
other web build target is supported until a future ADR accepts a web product
mode with a separate feature matrix and tests.

## Consequences

### Build and bundling

- The production bundle remains the Node.js extension-host bundle at
  `dist/extension.js`.
- No browser/WebWorker bundle is produced.
- No browser polyfills are added for Node.js built-ins.
- Web-specific bundler config and `@vscode/test-web` are intentionally absent.

### Dependency choices

- Runtime dependencies may continue to use Node.js APIs that are unavailable in
  VS Code Web when those APIs are required for local KiCad workflows.
- New dependencies must not introduce a hidden web target or browser bundle
  path unless this ADR is superseded.

### Feature matrix

| Feature area                 | Desktop / remote workspace host | VS Code Web |
| ---------------------------- | ------------------------------- | ----------- |
| Syntax and JSON contribution | Supported                       | Not shipped |
| KiCanvas schematic/PCB views | Supported                       | Not shipped |
| KiCad CLI DRC/ERC            | Supported with workspace trust  | Unsupported |
| KiCad desktop launch         | Supported with workspace trust  | Unsupported |
| MCP server integration       | Supported with local tooling    | Unsupported |
| Manufacturing exports        | Supported with KiCad CLI        | Unsupported |

### CI and future change guard

The VS Code extension package validation step is the no-web-target CI guard. It
must fail if a future change adds a `browser` entry point, a web entry file, web
build scripts, or an `extensionKind` that no longer requires the workspace
extension host.

Any future web support proposal must supersede this ADR and add all of the
following before changing the manifest:

- a separate web feature matrix,
- a web entry point,
- a browser/WebWorker build,
- VS Code Web tests,
- user-facing degraded-mode copy for unsupported KiCad CLI and MCP operations.
