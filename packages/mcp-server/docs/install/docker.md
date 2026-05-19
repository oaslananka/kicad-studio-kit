# Docker Install

The runtime image is published to GitHub Container Registry:

```text
ghcr.io/oaslananka/kicad-studio-kit/kicad-mcp-pro
```

The image defaults to stdio MCP behavior and runs as a non-root user. It does
not include KiCad and does not contain secrets.

## stdio

Use this form for MCP clients that communicate over standard input and output:

```bash
docker run --rm -i ghcr.io/oaslananka/kicad-studio-kit/kicad-mcp-pro:<version>
```

For reproducible deployments, pin the image by the GHCR digest shown on the
release package page:

```bash
docker run --rm -i ghcr.io/oaslananka/kicad-studio-kit/kicad-mcp-pro@sha256:<digest>
```

Claude Desktop container example:

```json
{
  "mcpServers": {
    "kicad-mcp-pro": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "ghcr.io/oaslananka/kicad-studio-kit/kicad-mcp-pro:<version>"]
    }
  }
}
```

## HTTP

Run streamable HTTP explicitly:

```bash
docker run --rm -p 3334:3334 ghcr.io/oaslananka/kicad-studio-kit/kicad-mcp-pro:<version> kicad-mcp-pro serve --transport http --host 0.0.0.0 --port 3334
```

HTTP mode is not the default because stdio is the safest MCP client path. Bind
HTTP only on trusted networks and configure authentication/CORS for shared
deployments.

## Local Smoke Test

```bash
docker build -t kicad-mcp-pro:local .
docker run --rm kicad-mcp-pro:local --help
docker run --rm kicad-mcp-pro:local health --json
```

The health command exits successfully without KiCad installed. KiCad-dependent
checks are reported as unavailable or deferred.
