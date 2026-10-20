import {
  MCP_2025_PROTOCOL_VERSION,
  Mcp2025ProtocolAdapter
} from './mcp2025ProtocolAdapter';
import {
  Mcp2026ProtocolAdapter,
  MCP_2026_PROTOCOL_VERSION
} from './mcp2026ProtocolAdapter';
import type { McpProtocolAdapter } from './protocolAdapter';

export const SUPPORTED_MCP_PROTOCOL_VERSIONS = [
  '2025-11-25',
  '2026-07-28'
] as const;

export class UnsupportedMcpProtocolVersionError extends Error {
  readonly code = 'MCP_PROTOCOL_VERSION_UNSUPPORTED';
  readonly hint =
    'Keep compatibility metadata on a production-supported protocol version until the matching adapter and published server artifacts are available.';

  constructor(
    readonly requestedVersion: string,
    readonly supportedVersions: readonly string[]
  ) {
    super(
      `Unsupported MCP protocol version ${requestedVersion}. Supported versions: ${supportedVersions.join(', ')}.`
    );
    this.name = 'UnsupportedMcpProtocolVersionError';
  }
}

export function resolveMcpProtocolAdapter(version: string): McpProtocolAdapter {
  if (version === MCP_2026_PROTOCOL_VERSION) {
    return new Mcp2026ProtocolAdapter();
  }
  if (version === MCP_2025_PROTOCOL_VERSION) {
    return new Mcp2025ProtocolAdapter();
  }

  throw new UnsupportedMcpProtocolVersionError(
    version,
    SUPPORTED_MCP_PROTOCOL_VERSIONS
  );
}
