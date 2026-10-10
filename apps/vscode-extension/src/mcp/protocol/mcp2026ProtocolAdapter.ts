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

// Staged adapter for the final published revision. Deliberately absent from
// protocolAdapterRegistry while compatibility.yaml activation is blocked.
export const MCP_2026_PROTOCOL_VERSION = '2026-07-28' as const;
const PROTOCOL_META = 'io.modelcontextprotocol/protocolVersion';
const CLIENT_INFO_META = 'io.modelcontextprotocol/clientInfo';
const CLIENT_CAPABILITIES_META = 'io.modelcontextprotocol/clientCapabilities';

export class Mcp2026UnsupportedResultError extends Error {
  readonly code = 'MCP_2026_RESULT_UNSUPPORTED';

  constructor() {
    super(
      'The MCP 2026 response was incomplete or requires unsupported multi-round-trip input.'
    );
    this.name = 'Mcp2026UnsupportedResultError';
  }
}

export class Mcp2026InvalidDiscoveryError extends Error {
  readonly code = 'MCP_2026_DISCOVERY_INVALID';

  constructor() {
    super(
      'MCP 2026 discovery did not satisfy the required stateless contract.'
    );
    this.name = 'Mcp2026InvalidDiscoveryError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export class Mcp2026ProtocolAdapter implements McpProtocolAdapter {
  readonly version = MCP_2026_PROTOCOL_VERSION;
  readonly lifecycle = 'stateless-discovery' as const;

  createDiscoveryRequest(
    _clientInfo: McpProtocolClientInfo
  ): McpProtocolRequest {
    return { method: 'server/discover', params: {} };
  }

  prepareRequestParams(
    params: Record<string, unknown>,
    clientInfo: McpProtocolClientInfo
  ): Record<string, unknown> {
    const metadata = params['_meta'];
    if (
      metadata !== undefined &&
      (metadata === null ||
        typeof metadata !== 'object' ||
        Array.isArray(metadata))
    ) {
      throw new TypeError('MCP request _meta must be an object.');
    }
    return {
      ...params,
      _meta: {
        ...(metadata as Record<string, unknown> | undefined),
        [PROTOCOL_META]: this.version,
        [CLIENT_INFO_META]: { ...clientInfo },
        [CLIENT_CAPABILITIES_META]: {}
      }
    };
  }

  createRequestHeaders(
    context: McpProtocolRequestContext
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': this.version,
      'Mcp-Method': context.method
    };
    let field: string | undefined;
    if (context.method === 'tools/call' || context.method === 'prompts/get') {
      field = 'name';
    } else if (context.method === 'resources/read') {
      field = 'uri';
    }
    if (field) {
      const name = context.params?.[field];
      if (typeof name !== 'string' || !name || /[\r\n]/u.test(name)) {
        throw new TypeError(
          `MCP ${context.method} requires a safe ${field} for Mcp-Name.`
        );
      }
      headers['Mcp-Name'] = /^[\x20-\x7e]+$/u.test(name)
        ? name
        : `=?base64?${Buffer.from(name, 'utf8').toString('base64')}?=`;
    }
    return headers;
  }

  readResponseMetadata(_headers: Headers): McpProtocolResponseMetadata {
    return {};
  }

  canReuseDiscovery(_context: McpProtocolReadinessContext): boolean {
    // No 2026 cache-validity contract is established yet; avoid reusing a
    // persisted 2025 server card as evidence of successful modern discovery.
    return false;
  }

  validateDiscoveryResult(result: McpDiscoveryResult | undefined): void {
    const versions = result?.supportedVersions;
    if (
      result === undefined ||
      !Array.isArray(versions) ||
      !versions.includes(this.version) ||
      (result?.protocolVersion && result.protocolVersion !== this.version)
    ) {
      throw new McpProtocolVersionMismatchError(
        this.version,
        result?.protocolVersion ??
          (Array.isArray(versions) ? versions.join(', ') : 'missing')
      );
    }

    // These fields are mandatory in the final 2026 DiscoverResult. A
    // matching version string by itself must never enable the staged client.
    if (
      !versions.every(
        (version) => typeof version === 'string' && version.length > 0
      ) ||
      !isRecord(result.capabilities) ||
      !Number.isSafeInteger(result.ttlMs) ||
      result.ttlMs === undefined ||
      result.ttlMs < 0 ||
      (result.cacheScope !== 'public' && result.cacheScope !== 'private') ||
      (result._meta !== undefined && !isRecord(result._meta))
    ) {
      throw new Mcp2026InvalidDiscoveryError();
    }
    const metadata = result._meta;
    const serverInfo = isRecord(metadata)
      ? metadata['io.modelcontextprotocol/serverInfo']
      : undefined;
    if (
      serverInfo !== undefined &&
      (!isRecord(serverInfo) ||
        typeof serverInfo['name'] !== 'string' ||
        typeof serverInfo['version'] !== 'string')
    ) {
      throw new Mcp2026InvalidDiscoveryError();
    }
    // serverInfo and cacheScope are untrusted server assertions, not
    // authorization or permission to select an otherwise blocked adapter.
  }

  validateResponseResult(result: unknown): void {
    // 2026 requires explicit completion discrimination. Never treat the
    // multi-round-trip input_required result (or unknown kinds) as success.
    if (
      result === null ||
      typeof result !== 'object' ||
      !('resultType' in result) ||
      result.resultType !== 'complete'
    ) {
      throw new Mcp2026UnsupportedResultError();
    }
  }
}
