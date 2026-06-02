# Telemetry and Error Reporting

KiCad Studio Kit supports opt-in telemetry for the VS Code extension and
`kicad-mcp-pro`. It is off by default. No third-party telemetry endpoint is
enabled by default, and no project files, schematics, PCB content, netlists,
BOMs, hostnames, API keys, or user home paths are allowed in telemetry payloads.

## VS Code Extension

The extension uses one explicit opt-in setting:

```json
{
  "kicadstudio.telemetry.enabled": false,
  "kicadstudio.telemetry.endpoint": "",
  "kicadstudio.telemetry.bufferLimit": 100
}
```

`kicadstudio.telemetry.enabled` must be set to `true` before the extension
records usage or error events. `kicadstudio.telemetry.endpoint` must also be
configured before network export is attempted. Leave the endpoint empty to keep
telemetry local-only.

The extension also honors VS Code's `telemetry.telemetryLevel` setting as an
upper bound:

| VS Code level | KiCad Studio behavior                       |
| ------------- | ------------------------------------------- |
| `off`         | No usage or error telemetry                 |
| `crash`       | No KiCad Studio usage or error telemetry    |
| `error`       | Redacted error telemetry only               |
| `all`         | Redacted usage counters and error telemetry |

Usage events are anonymous counters such as activation, command timing, and UI
surface usage. Error events include the error type, message, and a short stack
trace after redaction. The offline retry buffer is bounded by
`kicadstudio.telemetry.bufferLimit`; the newest events are retained when the
buffer is full.

## MCP Server

`kicad-mcp-pro` uses OpenTelemetry for opt-in server telemetry. It is disabled
unless either `KICAD_MCP_TELEMETRY_ENABLED=true`, `--telemetry`, or an OTLP
endpoint is configured.

```bash
KICAD_MCP_TELEMETRY_ENABLED=true \
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
kicad-mcp-pro --telemetry
```

If telemetry is enabled without an endpoint, the server uses a local collector
default:

| Protocol        | Default endpoint        |
| --------------- | ----------------------- |
| `http/protobuf` | `http://127.0.0.1:4318` |
| `grpc`          | `http://127.0.0.1:4317` |

Set `KICAD_MCP_TELEMETRY_BUFFER_MAX_EVENTS` to control the bounded redacted
event buffer. The default is `100`, with `0` disabling the buffer.

## Collected Data

Allowed data classes:

- Anonymous activation and feature usage counters.
- Redacted error type, message, and stack traces.
- MCP protocol version and an anonymous hash of the advertised tool catalog.
- KiCad CLI major.minor version, such as `10.0`.

Forbidden data classes:

- Schematic, PCB, netlist, BOM, or other project content.
- User home paths, workspace paths, project names, file names, or hostnames.
- API keys, bearer tokens, OAuth secrets, passwords, and authorization headers.
- IP addresses or endpoint hostnames in event payloads.

## Verification

The regression tests cover both sides:

```bash
corepack pnpm --filter kicadstudiokit exec jest test/unit/telemetry.test.ts --runInBand --coverage=false
See the [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp) repository for MCP server telemetry tests.
```

These tests prove telemetry disabled means no outbound extension send and no MCP
buffered event. They also validate that enabled telemetry emits only redacted
payloads and keeps bounded offline buffers.
