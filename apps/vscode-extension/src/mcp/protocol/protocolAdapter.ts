export interface McpProtocolClientInfo {
  name: string;
  version: string;
}

export interface McpProtocolRequest {
  method: string;
  params: Record<string, unknown>;
}

export interface McpDiscoveryResult {
  protocolVersion?: string | undefined;
  serverInfo?:
    | {
        name?: string | undefined;
        title?: string | undefined;
        version?: string | undefined;
      }
    | undefined;
  capabilities?: unknown;
}

export interface McpProtocolResponseMetadata {
  sessionId?: string | undefined;
}

export interface McpProtocolRequestContext {
  method: string;
  sessionId?: string | undefined;
}

export interface McpProtocolReadinessContext {
  force: boolean;
  sessionId?: string | undefined;
  hasServerCard: boolean;
}

export interface McpProtocolAdapter {
  readonly version: string;
  readonly lifecycle: 'initialize-session' | 'stateless-discovery';

  createDiscoveryRequest(clientInfo: McpProtocolClientInfo): McpProtocolRequest;

  createRequestHeaders(
    context: McpProtocolRequestContext
  ): Record<string, string>;

  readResponseMetadata(headers: Headers): McpProtocolResponseMetadata;

  canReuseDiscovery(context: McpProtocolReadinessContext): boolean;

  validateDiscoveryResult(result: McpDiscoveryResult | undefined): void;
}

export class McpProtocolVersionMismatchError extends Error {
  readonly code = 'MCP_PROTOCOL_VERSION_MISMATCH';
  readonly hint =
    'Use a server version that negotiates the active protocol, or add and validate a matching protocol adapter before changing compatibility metadata.';

  constructor(
    readonly expectedVersion: string,
    readonly receivedVersion: string
  ) {
    super(
      `MCP protocol version mismatch: expected ${expectedVersion}, received ${receivedVersion}.`
    );
    this.name = 'McpProtocolVersionMismatchError';
  }
}
