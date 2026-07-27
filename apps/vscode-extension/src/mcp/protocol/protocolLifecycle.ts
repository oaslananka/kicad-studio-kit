import type {
  McpDiscoveryResult,
  McpProtocolAdapter,
  McpProtocolClientInfo
} from './protocolAdapter';
import type {
  HttpJsonRpcRequest,
  HttpJsonRpcResult,
  JsonRpcResponse,
  McpRpcTransport
} from '../transport/httpJsonRpcTransport';

export interface McpProtocolRuntime {
  baseEndpoint: string;
  allowLegacySse: boolean;
  timeoutMs: number;
  hasDiscoveryState: boolean;
}

export interface McpProtocolSessionStore {
  read(): string | undefined;
  write(sessionId: string | undefined): Promise<void>;
}

export interface McpProtocolLifecycleHooks {
  onConnecting?(): void;
  onDiscovery(result: McpDiscoveryResult | undefined): Promise<void> | void;
  createRpcError?(error: NonNullable<JsonRpcResponse<unknown>['error']>): Error;
}

export interface McpProtocolLifecycleOptions {
  adapter: McpProtocolAdapter;
  transport: McpRpcTransport;
  clientInfo: McpProtocolClientInfo;
  sessionStore: McpProtocolSessionStore;
}

export class McpProtocolLifecycle {
  private readonly adapter: McpProtocolAdapter;
  private readonly transport: McpRpcTransport;
  private readonly clientInfo: McpProtocolClientInfo;
  private readonly sessionStore: McpProtocolSessionStore;
  private sessionId: string | undefined;
  private readyPromise: Promise<void> | undefined;
  private nextRequestId = 1;

  constructor(options: McpProtocolLifecycleOptions) {
    this.adapter = options.adapter;
    this.transport = options.transport;
    this.clientInfo = { ...options.clientInfo };
    this.sessionStore = options.sessionStore;
    this.sessionId = this.usesProtocolSessions()
      ? this.sessionStore.read()
      : undefined;
  }

  async ensureReady(
    runtime: McpProtocolRuntime,
    hooks: McpProtocolLifecycleHooks,
    options: { force?: boolean } = {}
  ): Promise<void> {
    if (
      this.adapter.canReuseDiscovery({
        force: options.force ?? false,
        sessionId: this.activeSessionId(),
        hasServerCard: runtime.hasDiscoveryState
      })
    ) {
      return;
    }
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = this.runDiscovery(runtime, hooks);
    try {
      await this.readyPromise;
    } finally {
      this.readyPromise = undefined;
    }
  }

  async execute<T>(
    method: string,
    params: Record<string, unknown>,
    runtime: McpProtocolRuntime
  ): Promise<HttpJsonRpcResult<T>> {
    const result = await this.transport.execute<T>(
      this.createTransportRequest(method, params, runtime)
    );
    await this.applyResponseMetadata(result.headers);
    return result;
  }

  async clearSession(): Promise<void> {
    if (!this.usesProtocolSessions()) {
      return;
    }
    this.sessionId = undefined;
    await this.sessionStore.write(undefined);
  }

  private async runDiscovery(
    runtime: McpProtocolRuntime,
    hooks: McpProtocolLifecycleHooks
  ): Promise<void> {
    hooks.onConnecting?.();
    const discovery = this.adapter.createDiscoveryRequest(this.clientInfo);
    const result = await this.execute<McpDiscoveryResult>(
      discovery.method,
      discovery.params,
      runtime
    );
    if (result.json.error) {
      throw (
        hooks.createRpcError?.(result.json.error) ??
        new Error(result.json.error.message ?? 'Unknown MCP error')
      );
    }
    this.adapter.validateDiscoveryResult(result.json.result);
    await hooks.onDiscovery(result.json.result);
  }

  private createTransportRequest(
    method: string,
    params: Record<string, unknown>,
    runtime: McpProtocolRuntime
  ): HttpJsonRpcRequest {
    const sessionId = this.activeSessionId();
    return {
      baseEndpoint: runtime.baseEndpoint,
      id: this.nextRequestId++,
      method,
      params,
      headers: this.adapter.createRequestHeaders({
        method,
        ...(sessionId ? { sessionId } : {})
      }),
      allowLegacySse: runtime.allowLegacySse,
      timeoutMs: runtime.timeoutMs
    };
  }

  private async applyResponseMetadata(headers: Headers): Promise<void> {
    if (!this.usesProtocolSessions()) {
      return;
    }
    const metadata = this.adapter.readResponseMetadata(headers);
    if (!metadata.sessionId) {
      return;
    }
    this.sessionId = metadata.sessionId;
    await this.sessionStore.write(metadata.sessionId);
  }

  private activeSessionId(): string | undefined {
    return this.usesProtocolSessions() ? this.sessionId : undefined;
  }

  private usesProtocolSessions(): boolean {
    return this.adapter.lifecycle === 'initialize-session';
  }
}
