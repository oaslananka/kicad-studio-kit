# Input Validation

## Input classes

The extension treats the following as untrusted until validated:

- KiCad project file contents;
- workspace paths and filenames;
- settings values;
- MCP endpoint URLs;
- command inputs;
- imported/exported artifact locations;
- webview-rendered project data.

## Required validation controls

| Input           | Control                                                          |
| --------------- | ---------------------------------------------------------------- |
| Paths           | Canonicalize and confine to workspace where required.            |
| File writes     | Gate by workspace trust and path boundary checks.                |
| MCP endpoints   | Prefer loopback/local endpoints; document remote endpoint risks. |
| Webview content | Use CSP, nonces, and restricted local resources.                 |
| Secrets         | Use VS Code SecretStorage, not plaintext settings.               |

## Review expectations

Changes touching path handling, webview rendering, MCP transport, secrets, shell execution, release artifacts, or dependency installation require explicit test evidence and human review.
