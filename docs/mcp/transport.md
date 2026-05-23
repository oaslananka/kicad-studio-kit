# MCP Transport

kicad-mcp-pro supports local MCP workflows through stdio and Streamable HTTP. The extension uses
the transport configured in its MCP profile and validates server-info before calling tools.

## Streamable HTTP

Use Streamable HTTP when a client needs a stable local endpoint, session handling, bearer-token
authentication, or integration with ChatGPT-style connectors.

```bash
uv run --project packages/mcp-server --all-extras kicad-mcp-pro --transport streamable-http --host 127.0.0.1 --port 3334
```

The default MCP path is `/mcp`.

## stdio

Use stdio when the MCP client launches the server process directly and keeps it bound to the local
client session.

```bash
uv run --project packages/mcp-server --all-extras kicad-mcp-pro --transport stdio
```

## Compatibility

Protocol and capability expectations are generated in [MCP API reference](api-reference.md). Runtime
support boundaries are tracked in the [support matrix](../support-matrix.md).
