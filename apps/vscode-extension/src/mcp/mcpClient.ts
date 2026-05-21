import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { MCP_REQUEST_TIMEOUT_MS, SETTINGS } from '../constants';
import type {
  FixItem,
  McpCapabilityCard,
  McpConnectionState,
  McpInstallStatus,
  McpServerCard,
  McpServerInfoContract,
  McpToolCall,
  QualityGateResult,
  StructuredMcpError,
  StudioContext
} from '../types';
import { Logger } from '../utils/logger';
import { MCP_COMPAT, getMcpCompatStatus, normalizeMcpVersion } from './compat';
import { MCP_PROTOCOL_VERSION } from './compatibilityMatrix';
import { McpDetector } from './mcpDetector';
import type { McpLogger } from './mcpLogger';

interface JsonRpcResponse<T> {
  result?: T;
  error?: {
    message?: string;
    data?: unknown;
  };
}

interface RpcTransportResult<T> {
  json: JsonRpcResponse<T>;
  sessionId?: string | undefined;
}

export interface McpClientOptions {
  maxRetries?: number | undefined;
  retryBaseDelayMs?: number | undefined;
  reconnectDelaysMs?: readonly number[] | undefined;
  logger?: McpLogger | undefined;
}

const MCP_SESSION_ID_KEY = 'kicadstudio.mcp.sessionId';
const MCP_LAST_SERVER_CARD_KEY = 'kicadstudio.mcp.lastServerCard';
const KNOWN_MCP_SDK_VERSION_HINTS = new Set(['1.27.0']);
const DEFAULT_RECONNECT_DELAYS_MS = [
  1000, 2000, 4000, 8000, 16000, 30000
] as const;

class McpHttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

class McpRequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`MCP request timed out after ${timeoutMs}ms.`);
    this.name = 'McpRequestTimeoutError';
  }
}

export class McpClient {
  private lastInstall: McpInstallStatus = { found: false, source: 'none' };
  private sessionId: string | undefined;
  private initializePromise: Promise<void> | undefined;
  private nextRpcId = 1;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly reconnectDelaysMs: readonly number[];
  private readonly trafficLogger: McpLogger | undefined;
  private state: McpConnectionState;
  private incompatibleWarningLogged = false;
  private reconnectTimers: NodeJS.Timeout[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly detector: McpDetector,
    private readonly logger: Logger,
    options: McpClientOptions = {}
  ) {
    this.sessionId = context.globalState.get<string>(MCP_SESSION_ID_KEY);
    this.maxRetries = Math.max(1, options.maxRetries ?? 3);
    this.retryBaseDelayMs = Math.max(1, options.retryBaseDelayMs ?? 200);
    this.reconnectDelaysMs =
      options.reconnectDelaysMs ?? DEFAULT_RECONNECT_DELAYS_MS;
    this.trafficLogger = options.logger;
    const cachedServer = context.globalState.get<McpServerCard>(
      MCP_LAST_SERVER_CARD_KEY
    );
    this.state = cachedServer
      ? {
          kind:
            cachedServer.compat === 'incompatible'
              ? 'Incompatible'
              : 'Disconnected',
          available: false,
          connected: false,
          server: cachedServer,
          message: 'Using cached MCP server metadata while reconnecting.'
        }
      : { kind: 'Disconnected', available: false, connected: false };
  }

  async detectInstall(): Promise<McpInstallStatus> {
    if (vscode.workspace.isTrusted === false) {
      this.lastInstall = { found: false, source: 'none' };
      return this.lastInstall;
    }
    this.lastInstall = await this.detector.detectKicadMcpPro();
    return this.lastInstall;
  }

  getState(): McpConnectionState {
    return cloneConnectionState(this.state);
  }

  getLastServerCard(): McpServerCard | undefined {
    return this.state.server ? { ...this.state.server } : undefined;
  }

  async testConnection(): Promise<McpConnectionState> {
    if (vscode.workspace.isTrusted === false) {
      return this.setState({
        kind: 'Disconnected',
        available: false,
        connected: false,
        message: 'MCP integration is disabled in Restricted Mode.'
      });
    }

    const install = await this.detectInstall();
    const endpoint = this.getEndpoint();
    if (!endpoint) {
      // No HTTP endpoint configured — check for VS Code stdio MCP config.
      if (hasVsCodeMcpJsonWithKicad()) {
        return this.setState({
          kind: 'VsCodeStdio',
          available: true,
          connected: true,
          install,
          message:
            'kicad-mcp-pro configured via .vscode/mcp.json (VS Code stdio).'
        });
      }
      return this.setState({
        kind: install.found ? 'Disconnected' : 'NotInstalled',
        available: install.found,
        connected: false,
        install
      });
    }

    try {
      await this.ensureInitialized({ force: true });
      if (this.state.kind === 'Incompatible') {
        return this.setState({
          ...this.state,
          available: install.found,
          connected: false,
          install
        });
      }
      await this.rpc('tools/list', {});
      return this.setState({
        kind: 'Connected',
        available: install.found,
        connected: true,
        install,
        server: this.state.server,
        message: this.state.message
      });
    } catch (error) {
      this.logger.debug(
        `MCP connection test failed: ${error instanceof Error ? error.message : String(error)}`
      );
      // HTTP endpoint unreachable — fall back to VS Code stdio detection.
      if (hasVsCodeMcpJsonWithKicad()) {
        return this.setState({
          kind: 'VsCodeStdio',
          available: true,
          connected: true,
          install,
          server: this.state.server,
          message:
            'kicad-mcp-pro configured via .vscode/mcp.json (VS Code stdio). HTTP endpoint unavailable.'
        });
      }
      return this.setState({
        kind: install.found ? 'Disconnected' : 'NotInstalled',
        available: install.found,
        connected: false,
        install,
        server: this.state.server,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async pushContext(context: StudioContext): Promise<void> {
    if (vscode.workspace.isTrusted === false) {
      return;
    }
    if (
      !vscode.workspace
        .getConfiguration()
        .get<boolean>(SETTINGS.mcpPushContext, true)
    ) {
      return;
    }

    try {
      await this.callTool('studio_push_context', {
        ...context
      });
    } catch (error) {
      this.logger.debug(
        `MCP context push skipped: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown> | undefined> {
    const result = await this.rpc<{
      content?: Array<{ text?: string }>;
      structuredContent?: Record<string, unknown>;
    }>('tools/call', {
      name,
      arguments: args
    });

    const structuredError = normalizeStructuredError(result?.structuredContent);
    if (structuredError) {
      throw new McpStructuredError(structuredError);
    }

    if (
      result?.structuredContent &&
      typeof result.structuredContent === 'object'
    ) {
      return result.structuredContent;
    }

    const firstText = result?.content?.find(
      (item) => typeof item.text === 'string'
    )?.text;
    if (firstText) {
      try {
        return JSON.parse(firstText) as Record<string, unknown>;
      } catch {
        return {
          text: firstText
        };
      }
    }

    return undefined;
  }

  async previewToolCall(toolCall: McpToolCall): Promise<string> {
    const preview =
      (await this.callTool('studio_preview_tool_call', {
        name: toolCall.name,
        arguments: toolCall.arguments
      })) ?? {};
    return String(
      preview['preview'] ??
        preview['text'] ??
        toolCall.preview ??
        'Preview unavailable.'
    );
  }

  async readResource(
    uri: string
  ): Promise<Record<string, unknown> | undefined> {
    const result = await this.rpc<{
      contents?: Array<{ text?: string }>;
    }>('resources/read', {
      uri
    });
    const text = result?.contents?.find(
      (item) => typeof item.text === 'string'
    )?.text;
    if (!text) {
      return undefined;
    }
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { text };
    }
  }

  async fetchFixQueue(): Promise<FixItem[]> {
    const resource = await this.readResource('kicad://project/fix_queue');
    const items =
      (Array.isArray(resource?.['items']) ? resource['items'] : undefined) ??
      (Array.isArray(resource?.['fixes']) ? resource['fixes'] : undefined);

    if (items) {
      return items.map((item, index) => normalizeFixItem(item, index));
    }

    const toolResult = await this.callTool('project_get_fix_queue', {});
    const fixItems =
      (Array.isArray(toolResult?.['items'])
        ? toolResult['items']
        : undefined) ??
      (Array.isArray(toolResult?.['fixes'])
        ? toolResult['fixes']
        : undefined) ??
      [];
    return fixItems.map((item, index) => normalizeFixItem(item, index));
  }

  async runProjectQualityGate(): Promise<QualityGateResult[]> {
    const result = await this.callTool('project_quality_gate_report', {});
    return normalizeProjectGateResults(result);
  }

  async runPlacementQualityGate(): Promise<QualityGateResult> {
    const result =
      (await this.callTool('pcb_placement_quality_report', {})) ??
      (await this.callTool('pcb_placement_quality_gate', {})) ??
      {};
    return normalizeSingleGate('placement', 'Placement', result);
  }

  async runTransferQualityGate(): Promise<QualityGateResult> {
    const result = await this.callTool('pcb_transfer_quality_gate', {});
    return normalizeSingleGate('transfer', 'PCB Transfer', result ?? {});
  }

  async runManufacturingQualityGate(): Promise<QualityGateResult> {
    const result = await this.callTool('manufacturing_quality_gate', {});
    return normalizeSingleGate('manufacturing', 'Manufacturing', result ?? {});
  }

  async exportManufacturingPackage(
    variant: string | undefined
  ): Promise<Record<string, unknown> | undefined> {
    return this.callTool('export_manufacturing_package', {
      ...(variant ? { variant } : {})
    });
  }

  retryNow(): Promise<McpConnectionState> {
    this.clearReconnectTimers();
    return this.testConnection();
  }

  async deactivate(timeoutMs = 2000): Promise<void> {
    this.clearReconnectTimers();
    await Promise.race([
      Promise.resolve(),
      new Promise((resolve) => setTimeout(resolve, timeoutMs))
    ]);
  }

  private getEndpoint(): string {
    const endpoint = vscode.workspace
      .getConfiguration()
      .get<string>(SETTINGS.mcpEndpoint, 'http://127.0.0.1:27185')
      .replace(/\/$/, '');
    validateEndpoint(endpoint);
    return endpoint;
  }

  private async rpc<T>(
    method: string,
    params: Record<string, unknown>
  ): Promise<T | undefined> {
    if (method !== 'initialize') {
      // kicad-mcp-pro is connected via VS Code stdio (.vscode/mcp.json).
      // The extension's HTTP client cannot reach it — tool calls are routed
      // through VS Code's native MCP infrastructure, not our HTTP layer.
      if (this.state.kind === 'VsCodeStdio') {
        throw new Error(
          'kicad-mcp-pro is connected via VS Code stdio. ' +
            'Use the AI chat with MCP tools enabled, or Claude Code / Cursor instead.'
        );
      }
      await this.ensureInitialized();
      if (this.state.kind === 'Incompatible') {
        throw new Error(
          `MCP server is incompatible. Server ${this.state.server?.version ?? '0.0.0'} does not satisfy ${MCP_COMPAT.required}.`
        );
      }
    }

    const { json, sessionId } = await this.postJsonRpcWithRetry<T>(
      method,
      params
    );
    if (sessionId) {
      await this.persistSessionId(sessionId);
    }
    if (json.error) {
      throw createErrorFromRpc(json.error);
    }
    return json.result;
  }

  private async ensureInitialized(
    options: { force?: boolean } = {}
  ): Promise<void> {
    if (!options.force && this.sessionId && this.state.server) {
      return;
    }
    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.initializePromise = (async () => {
      this.setState({
        ...this.state,
        kind: 'Connecting',
        connected: false
      });
      const { json, sessionId } =
        await this.postJsonRpcWithRetry<InitializeResult>('initialize', {
          protocolVersion: MCP_PROTOCOL_VERSION,
          clientInfo: {
            name: 'kicad-studio',
            version: getExtensionVersion(this.context)
          },
          capabilities: {}
        });
      if (sessionId) {
        await this.persistSessionId(sessionId);
      }
      if (json.error) {
        throw createErrorFromRpc(json.error);
      }
      await this.captureServerCard(json.result);
    })();

    try {
      await this.initializePromise;
    } finally {
      this.initializePromise = undefined;
    }
  }

  private async postJsonRpc<T>(
    method: string,
    params: Record<string, unknown>
  ): Promise<RpcTransportResult<T>> {
    const baseEndpoint = this.getEndpoint();
    const primaryEndpoint = `${baseEndpoint}/mcp`;
    const requestBody = JSON.stringify({
      jsonrpc: '2.0',
      id: this.nextRpcId++,
      method,
      params
    });
    this.trafficLogger?.recordRequest(method, requestBody, this.buildHeaders());

    const timeoutMs = getMcpRequestTimeoutMs();
    const primaryResponse = await fetchWithTimeout(
      primaryEndpoint,
      {
        method: 'POST',
        headers: this.buildHeaders(),
        body: requestBody
      },
      timeoutMs
    );

    if (primaryResponse.status === 404 || primaryResponse.status === 405) {
      const allowLegacySse = vscode.workspace
        .getConfiguration()
        .get<boolean>(SETTINGS.mcpAllowLegacySse, false);
      if (!allowLegacySse) {
        throw new Error(
          `The configured MCP server at ${primaryEndpoint} does not expose Streamable HTTP. Upgrade kicad-mcp-pro or enable ${SETTINGS.mcpAllowLegacySse} to try the legacy /sse fallback.`
        );
      }

      this.logger.warn(
        'Falling back to legacy MCP /sse transport because allowLegacySse is enabled.'
      );
      const fallback = await this.readRpcResponse<T>(
        await fetchWithTimeout(
          `${baseEndpoint}/sse`,
          {
            method: 'POST',
            headers: this.buildHeaders(),
            body: requestBody
          },
          timeoutMs
        )
      );
      this.trafficLogger?.recordResponse(method, fallback.json);
      return fallback;
    }

    const result = await this.readRpcResponse<T>(primaryResponse);
    this.trafficLogger?.recordResponse(method, result.json);
    return result;
  }

  private async postJsonRpcWithRetry<T>(
    method: string,
    params: Record<string, unknown>
  ): Promise<RpcTransportResult<T>> {
    let lastError: unknown;
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      try {
        return await this.postJsonRpc<T>(method, params);
      } catch (error) {
        lastError = error;
        this.trafficLogger?.recordError(
          method,
          error instanceof Error ? error.message : String(error)
        );
        if (attempt === this.maxRetries - 1 || !isTransientMcpError(error)) {
          throw error;
        }
        this.logger.debug(
          `MCP ${method} failed transiently; retrying in ${
            this.retryBaseDelayMs * 2 ** attempt
          }ms.`
        );
        await sleep(this.retryBaseDelayMs * 2 ** attempt);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async persistSessionId(sessionId: string): Promise<void> {
    this.sessionId = sessionId;
    await this.context.globalState.update(MCP_SESSION_ID_KEY, sessionId);
  }

  private async captureServerCard(
    initializeResult: InitializeResult | undefined
  ): Promise<void> {
    const initializeServerInfo = initializeResult?.serverInfo;
    const initializeVersion = normalizeMcpVersion(
      initializeServerInfo?.version
    );
    const metadata = shouldReadWellKnownServerMetadata(
      initializeServerInfo,
      initializeVersion
    )
      ? await this.readWellKnownServerMetadata()
      : undefined;
    const version = metadata?.version ?? initializeVersion;
    const serverInfo = metadata?.serverInfo;
    const diagnostics = serverInfo ? serverInfoDiagnostics(serverInfo) : [];
    const baseCompat = getMcpCompatStatus(version);
    const compat =
      baseCompat === 'incompatible'
        ? baseCompat
        : diagnostics.length
          ? 'warn'
          : baseCompat;
    const card: McpServerCard = {
      version,
      capabilities: normalizeCapabilities(
        initializeResult?.capabilities,
        serverInfo,
        diagnostics
      ),
      compat,
      capturedAt: new Date().toISOString()
    };
    await this.context.globalState.update(MCP_LAST_SERVER_CARD_KEY, card);

    if (compat === 'incompatible') {
      await this.context.globalState.update(MCP_SESSION_ID_KEY, undefined);
      this.sessionId = undefined;
      if (!this.incompatibleWarningLogged) {
        this.incompatibleWarningLogged = true;
        this.logger.warn(
          `MCP Incompatible (server ${version}, need ${MCP_COMPAT.required})`
        );
        void Promise.resolve(
          vscode.window.showWarningMessage(
            `MCP Incompatible (server ${version}, need ${MCP_COMPAT.required})`,
            'Open Upgrade Guide',
            'Dismiss'
          )
        ).then((choice) => {
          if (choice === 'Open Upgrade Guide') {
            void vscode.commands.executeCommand(
              'kicadstudio.mcp.openUpgradeGuide'
            );
          }
        });
      }
      this.setState({
        kind: 'Incompatible',
        available: this.lastInstall.found,
        connected: false,
        install: this.lastInstall,
        server: card,
        message: `Server ${version} does not satisfy ${MCP_COMPAT.required}.`
      });
      return;
    }

    this.setState({
      kind: 'Connected',
      available: this.lastInstall.found,
      connected: true,
      install: this.lastInstall,
      server: card,
      message: diagnostics.length ? diagnostics.join(' ') : undefined
    });
  }

  private async readWellKnownServerMetadata(): Promise<
    | {
        version: string;
        serverInfo?: McpServerInfoContract | undefined;
      }
    | undefined
  > {
    const { readWellKnownMcpServerMetadata } = await import('./serverMetadata');
    return readWellKnownMcpServerMetadata(this.getEndpoint(), this.logger);
  }

  private setState(state: McpConnectionState): McpConnectionState {
    this.state = cloneConnectionState(state);
    return this.getState();
  }

  private clearReconnectTimers(): void {
    for (const timer of this.reconnectTimers) {
      clearTimeout(timer);
    }
    this.reconnectTimers = [];
  }

  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(this.sessionId ? { 'MCP-Session-Id': this.sessionId } : {})
    };
  }

  private async readRpcResponse<T>(
    response: Response
  ): Promise<RpcTransportResult<T>> {
    if (!response.ok) {
      throw new McpHttpError(response.status);
    }

    const sessionId = response.headers.get('MCP-Session-Id') ?? undefined;
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('text/event-stream')) {
      return {
        json: parseSseJsonRpc<T>(await response.text()),
        sessionId
      };
    }

    return {
      json: (await response.json()) as JsonRpcResponse<T>,
      sessionId
    };
  }
}

function validateEndpoint(endpoint: string): void {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error(`Invalid MCP endpoint URL: ${endpoint}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('The MCP endpoint must use http:// or https://.');
  }

  const host = parsed.hostname.toLowerCase();
  const isLoopback =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]';
  const allowRemoteEndpoint = vscode.workspace
    .getConfiguration()
    .get<boolean>(SETTINGS.mcpAllowRemoteEndpoint, false);

  if (!isLoopback && !allowRemoteEndpoint) {
    throw new Error(
      `Refusing remote MCP endpoint ${endpoint}. Use a loopback endpoint or enable ${SETTINGS.mcpAllowRemoteEndpoint} intentionally.`
    );
  }
}

function getExtensionVersion(context: vscode.ExtensionContext): string {
  const version = (
    context as {
      extension?: {
        packageJSON?: {
          version?: unknown;
        };
      };
    }
  ).extension?.packageJSON?.version;
  return typeof version === 'string' && version.trim() ? version : '0.0.0';
}

function getMcpRequestTimeoutMs(): number {
  const seconds = vscode.workspace
    .getConfiguration()
    .get<number>(SETTINGS.mcpTimeout, MCP_REQUEST_TIMEOUT_MS / 1000);
  return Math.max(1, Math.min(seconds, 120)) * 1000;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new McpRequestTimeoutError(timeoutMs));
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: init.signal
        ? AbortSignal.any([init.signal, controller.signal])
        : controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw controller.signal.reason instanceof Error
        ? controller.signal.reason
        : new McpRequestTimeoutError(timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

interface InitializeResult {
  serverInfo?:
    | {
        name?: string | undefined;
        title?: string | undefined;
        version?: string | undefined;
      }
    | undefined;
  capabilities?: unknown;
}

function shouldReadWellKnownServerVersion(
  serverInfo: InitializeResult['serverInfo'],
  version: string
): boolean {
  if (getMcpCompatStatus(version) === 'incompatible') {
    return true;
  }

  const name = `${serverInfo?.name ?? ''} ${serverInfo?.title ?? ''}`;
  if (/kicad[- ]mcp[- ]pro/i.test(name)) {
    return false;
  }

  return KNOWN_MCP_SDK_VERSION_HINTS.has(version);
}

function shouldReadWellKnownServerMetadata(
  serverInfo: InitializeResult['serverInfo'],
  version: string
): boolean {
  const name = `${serverInfo?.name ?? ''} ${serverInfo?.title ?? ''}`;
  return (
    /kicad[- ]mcp[- ]pro/i.test(name) ||
    shouldReadWellKnownServerVersion(serverInfo, version)
  );
}

class McpStructuredError extends Error {
  readonly code: string;
  readonly hint: string | undefined;

  constructor(error: StructuredMcpError) {
    super(error.message);
    this.name = 'McpStructuredError';
    this.code = error.code;
    this.hint = error.hint;
  }
}

function isTransientMcpError(error: unknown): boolean {
  if (error instanceof McpRequestTimeoutError) {
    return true;
  }
  if (error instanceof McpHttpError) {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }
  return (
    error instanceof TypeError ||
    /(?:ECONNRESET|ETIMEDOUT|EAI_AGAIN|network|fetch)/i.test(String(error))
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeFixItem(value: unknown, index: number): FixItem {
  const item = typeof value === 'object' && value !== null ? value : {};
  const record = item as Record<string, unknown>;
  return {
    id: String(record['id'] ?? `fix-${index + 1}`),
    title:
      typeof record['title'] === 'string'
        ? record['title']
        : typeof record['description'] === 'string'
          ? record['description']
          : undefined,
    description: String(
      record['description'] ?? record['title'] ?? `Suggested fix ${index + 1}`
    ),
    severity:
      record['severity'] === 'error' ||
      record['severity'] === 'warning' ||
      record['severity'] === 'info'
        ? record['severity']
        : 'info',
    tool: String(record['tool'] ?? record['name'] ?? 'unknown_tool'),
    args:
      typeof record['args'] === 'object' && record['args'] !== null
        ? (record['args'] as Record<string, unknown>)
        : {},
    status:
      record['status'] === 'pending' ||
      record['status'] === 'applying' ||
      record['status'] === 'done' ||
      record['status'] === 'failed'
        ? record['status']
        : 'pending',
    ...(typeof record['preview'] === 'string'
      ? { preview: record['preview'] }
      : {}),
    ...(typeof record['path'] === 'string' ? { path: record['path'] } : {}),
    ...(typeof record['line'] === 'number'
      ? { line: record['line'] }
      : typeof record['line'] === 'string' &&
          Number.isFinite(Number(record['line']))
        ? { line: Number(record['line']) }
        : {}),
    ...(typeof record['confidence'] === 'number'
      ? { confidence: record['confidence'] }
      : {})
  };
}

function parseSseJsonRpc<T>(payload: string): JsonRpcResponse<T> {
  const events = payload
    .split(/\r?\n\r?\n/)
    .map((chunk) =>
      chunk
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice('data:'.length).trim())
        .join('')
    )
    .filter(Boolean);

  const lastEvent = events.at(-1);
  if (!lastEvent) {
    throw new Error('The MCP server returned an empty SSE payload.');
  }

  return JSON.parse(lastEvent) as JsonRpcResponse<T>;
}

function normalizeCapabilities(
  value: unknown,
  serverInfo?: McpServerInfoContract | undefined,
  diagnostics: string[] = []
): McpCapabilityCard {
  const record = isRecord(value) ? value : {};
  return {
    tools: normalizeCapabilityNames(record['tools']),
    resources: normalizeCapabilityNames(record['resources']),
    prompts: normalizeCapabilityNames(record['prompts']),
    ...(serverInfo ? { serverInfo } : {}),
    ...(diagnostics.length ? { diagnostics } : {})
  };
}

function serverInfoDiagnostics(serverInfo: McpServerInfoContract): string[] {
  const diagnostics = [...serverInfo.diagnostics];
  if (!serverInfo.kicad.cliFound) {
    diagnostics.push(
      'KiCad CLI is unavailable; file-backed DRC/ERC/export operations are disabled.'
    );
  }
  if (!serverInfo.kicad.livePcbContext) {
    diagnostics.push('Live KiCad PCB context is unavailable.');
  }
  if (!serverInfo.capabilities.fileBackedExports) {
    diagnostics.push('File-backed export operations are unavailable.');
  }
  if (!serverInfo.transport.streamableHttp) {
    diagnostics.push('Streamable HTTP transport is unavailable.');
  }
  return [...new Set(diagnostics)];
}

function normalizeCapabilityNames(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === 'string'
          ? item
          : isRecord(item) && typeof item['name'] === 'string'
            ? item['name']
            : undefined
      )
      .filter((item): item is string => Boolean(item));
  }
  if (isRecord(value)) {
    return Object.keys(value);
  }
  return [];
}

function cloneConnectionState(state: McpConnectionState): McpConnectionState {
  return {
    ...state,
    install: state.install ? { ...state.install } : undefined,
    server: state.server
      ? {
          ...state.server,
          capabilities: {
            tools: [...state.server.capabilities.tools],
            resources: [...state.server.capabilities.resources],
            prompts: [...state.server.capabilities.prompts],
            ...(state.server.capabilities.serverInfo
              ? {
                  serverInfo: cloneServerInfoContract(
                    state.server.capabilities.serverInfo
                  )
                }
              : {}),
            ...(state.server.capabilities.diagnostics
              ? { diagnostics: [...state.server.capabilities.diagnostics] }
              : {})
          }
        }
      : undefined
  };
}

function cloneServerInfoContract(
  serverInfo: McpServerInfoContract
): McpServerInfoContract {
  return {
    ...serverInfo,
    compatibilityRange: {
      kicadStudio: { ...serverInfo.compatibilityRange.kicadStudio },
      kicadMcpPro: { ...serverInfo.compatibilityRange.kicadMcpPro }
    },
    transport: { ...serverInfo.transport },
    kicad: { ...serverInfo.kicad },
    capabilities: {
      ...serverInfo.capabilities,
      cliExports: { ...serverInfo.capabilities.cliExports }
    },
    diagnostics: [...serverInfo.diagnostics]
  };
}

function normalizeProjectGateResults(
  result: Record<string, unknown> | undefined
): QualityGateResult[] {
  const outcomes = Array.isArray(result?.['outcomes'])
    ? result['outcomes']
    : [];
  if (!outcomes.length) {
    return [normalizeSingleGate('project', 'Project Quality', result ?? {})];
  }
  return outcomes.map((outcome, index) => {
    const record = isRecord(outcome) ? outcome : {};
    const label = String(record['name'] ?? `Gate ${index + 1}`);
    return normalizeSingleGate(gateIdFromLabel(label), label, record);
  });
}

function normalizeSingleGate(
  id: string,
  label: string,
  value: Record<string, unknown>
): QualityGateResult {
  const text = typeof value['text'] === 'string' ? value['text'] : undefined;
  const details = Array.isArray(value['details'])
    ? value['details'].map((item) => String(item))
    : text
      ? text.split(/\r?\n/).filter((line) => line.startsWith('- '))
      : [];
  const status = normalizeGateStatus(value['status'], details, text);
  const summary =
    typeof value['summary'] === 'string'
      ? value['summary']
      : (text
          ?.split(/\r?\n/)
          .find((line) => line.startsWith('- '))
          ?.slice(2) ??
        (status === 'PENDING' ? 'Run gate to populate results.' : label));
  return {
    id,
    label,
    status,
    summary,
    details,
    violations: details
      .filter((detail) => /(?:fail|blocked|warn)/i.test(detail))
      .map((detail) => ({ message: detail.replace(/^-\s*/, '') })),
    lastRun: new Date().toISOString(),
    raw: text ?? JSON.stringify(value, null, 2)
  };
}

function normalizeGateStatus(
  value: unknown,
  details: string[],
  text: string | undefined
): QualityGateResult['status'] {
  if (value === 'PASS' || value === 'FAIL' || value === 'BLOCKED') {
    if (
      value === 'PASS' &&
      (details.some((detail) => /warn/i.test(detail)) ||
        /warn/i.test(text ?? ''))
    ) {
      return 'WARN';
    }
    return value;
  }
  const haystack = `${String(value ?? '')}\n${text ?? ''}`;
  if (/blocked/i.test(haystack)) {
    return 'BLOCKED';
  }
  if (/fail/i.test(haystack)) {
    return 'FAIL';
  }
  if (/warn/i.test(haystack)) {
    return 'WARN';
  }
  if (/pass/i.test(haystack)) {
    return 'PASS';
  }
  return 'PENDING';
}

function gateIdFromLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function createErrorFromRpc(error: {
  message?: string | undefined;
  data?: unknown;
}): Error {
  const structured = normalizeStructuredError(error.data);
  if (structured) {
    return new McpStructuredError(structured);
  }
  return new Error(error.message ?? 'Unknown MCP error');
}

function normalizeStructuredError(
  value: unknown
): StructuredMcpError | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const code =
    typeof value['error_code'] === 'string'
      ? value['error_code']
      : typeof value['code'] === 'string'
        ? value['code']
        : undefined;
  const message =
    typeof value['message'] === 'string' ? value['message'] : undefined;
  if (!code || !message) {
    return undefined;
  }
  return {
    code,
    message,
    hint: typeof value['hint'] === 'string' ? value['hint'] : undefined
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Returns true when a .vscode/mcp.json file in any workspace folder contains
 * a server entry that runs kicad-mcp-pro (stdio transport). This indicates
 * the MCP server is managed by VS Code rather than the extension's HTTP client.
 */
function hasVsCodeMcpJsonWithKicad(): boolean {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    return false;
  }
  for (const folder of folders) {
    const mcpJsonPath = path.join(folder.uri.fsPath, '.vscode', 'mcp.json');
    try {
      const raw = fs.readFileSync(mcpJsonPath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const servers = isRecord(parsed['servers']) ? parsed['servers'] : {};
      return Object.values(servers).some((server) => {
        if (!isRecord(server)) {
          return false;
        }
        const cmd =
          typeof server['command'] === 'string' ? server['command'] : '';
        const args = Array.isArray(server['args']) ? server['args'] : [];
        return (
          cmd === 'kicad-mcp-pro' ||
          args.some(
            (arg) => typeof arg === 'string' && arg.includes('kicad-mcp-pro')
          )
        );
      });
    } catch {
      // File not found or invalid JSON — continue to next folder.
    }
  }
  return false;
}
