import type {
  McpDiscoveryResult,
  McpProtocolAdapter,
  McpProtocolClientInfo,
  McpProtocolReadinessContext,
  McpProtocolRequest,
  McpProtocolRequestContext,
  McpProtocolResponseMetadata
} from './protocolAdapter';
import { McpProtocolVersionMismatchError } from './protocolAdapter';

export const MCP_2025_PROTOCOL_VERSION = '2025-11-25' as const;

export class Mcp2025ProtocolAdapter implements McpProtocolAdapter {
  readonly version = MCP_2025_PROTOCOL_VERSION;
  readonly lifecycle = 'initialize-session' as const;

  createDiscoveryRequest(
    clientInfo: McpProtocolClientInfo
  ): McpProtocolRequest {
    return {
      method: 'initialize',
      params: {
        protocolVersion: this.version,
        clientInfo,
        capabilities: {}
      }
    };
  }

  createRequestHeaders(
    context: McpProtocolRequestContext
  ): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': this.version,
      ...(context.sessionId ? { 'MCP-Session-Id': context.sessionId } : {})
    };
  }

  readResponseMetadata(headers: Headers): McpProtocolResponseMetadata {
    const sessionId = headers.get('MCP-Session-Id') ?? undefined;
    return sessionId ? { sessionId } : {};
  }

  canReuseDiscovery(context: McpProtocolReadinessContext): boolean {
    return (
      !context.force && Boolean(context.sessionId) && context.hasServerCard
    );
  }

  validateDiscoveryResult(result: McpDiscoveryResult | undefined): void {
    const receivedVersion = result?.protocolVersion;
    if (receivedVersion && receivedVersion !== this.version) {
      throw new McpProtocolVersionMismatchError(this.version, receivedVersion);
    }
  }
}
