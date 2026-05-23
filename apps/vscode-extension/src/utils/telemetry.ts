import * as vscode from 'vscode';
import { SETTINGS } from '../constants';

export interface TelemetrySender {
  trackCommand(commandId: string, measurements: { durationMs: number }): void;
  trackEvent?(eventName: string, properties?: Record<string, string>): void;
}

export type TelemetryKind = 'usage' | 'error';
export type TelemetryPrimitive = string | number | boolean | null;
export type TelemetryData = Record<
  string,
  TelemetryPrimitive | TelemetryPrimitive[] | Record<string, TelemetryPrimitive>
>;

export interface TelemetryEnvelope {
  kind: TelemetryKind;
  name: string;
  timestamp: string;
  data: TelemetryData;
}

export interface TelemetryTransport {
  send(envelope: TelemetryEnvelope): Promise<void> | void;
}

type TelemetrySink = TelemetrySender | TelemetryTransport;
type TelemetryLevel = 'all' | 'error' | 'crash' | 'off';

const DEFAULT_BUFFER_LIMIT = 100;
const MAX_BUFFER_LIMIT = 1000;
const SECRET_KEY_PATTERN =
  /(?:api[_-]?key|token|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|authorization)/iu;
const SECRET_VALUE_PATTERN =
  /\b(api[_-]?key|token|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|authorization)\s*[:=]\s*[^\s,;]+/giu;
const URL_PATTERN = /\bhttps?:\/\/[^\s"'<>]+/giu;
const WINDOWS_PATH_PATTERN = /\b[A-Za-z]:\\[^\s"'<>]+/gu;
const POSIX_PRIVATE_PATH_PATTERN =
  /(^|[\s("'=])\/(?:home|Users)\/[^\s"'<>),;]+/gu;
const KICAD_FILE_PATH_PATTERN =
  /(^|[\s("'=])\/[^\s"'<>),;]+\.(?:kicad_pcb|kicad_sch|kicad_pro|kicad_dru|kicad_jobset|net|csv|xml|json|zip)\b/giu;
const IP_ADDRESS_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/gu;
const HOSTNAME_PATTERN =
  /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|local|test)\b/giu;

function isTelemetryTransport(sink: TelemetrySink): sink is TelemetryTransport {
  return typeof (sink as { send?: unknown }).send === 'function';
}

function isLegacyTelemetrySender(sink: TelemetrySink): sink is TelemetrySender {
  return (
    typeof (sink as { trackCommand?: unknown }).trackCommand === 'function'
  );
}

function configurationValue<T>(key: string, fallback: T): T {
  return vscode.workspace.getConfiguration().get<T>(key, fallback);
}

function telemetryEndpoint(): string {
  return configurationValue<string>(SETTINGS.telemetryEndpoint, '').trim();
}

function clampBufferLimit(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BUFFER_LIMIT;
  }
  return Math.max(0, Math.min(MAX_BUFFER_LIMIT, Math.trunc(value)));
}

function configuredBufferLimit(): number {
  return clampBufferLimit(
    configurationValue<number>(
      SETTINGS.telemetryBufferLimit,
      DEFAULT_BUFFER_LIMIT
    )
  );
}

function sanitizeText(value: string): string {
  return value
    .replace(SECRET_VALUE_PATTERN, '$1=[redacted]')
    .replace(URL_PATTERN, '[url]')
    .replace(WINDOWS_PATH_PATTERN, '[path]')
    .replace(POSIX_PRIVATE_PATH_PATTERN, '$1[path]')
    .replace(KICAD_FILE_PATH_PATTERN, '$1[path]')
    .replace(IP_ADDRESS_PATTERN, '[ip]')
    .replace(HOSTNAME_PATTERN, '[host]');
}

function sanitizeTelemetryName(name: string): string {
  return (
    name
      .replace(/[^\w.:-]/gu, '_')
      .replace(/_{2,}/gu, '_')
      .slice(0, 120) || 'kicadstudio.event'
  );
}

function sanitizePropertyKey(key: string): string {
  return key.replace(/[^\w.-]/gu, '_').slice(0, 80) || 'property';
}

function sanitizeProperties(
  properties?: Record<string, string>
): Record<string, string> | undefined {
  if (!properties) {
    return undefined;
  }
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(properties)) {
    const safeKey = sanitizePropertyKey(key);
    sanitized[safeKey] = SECRET_KEY_PATTERN.test(key)
      ? '[redacted]'
      : sanitizeText(String(value)).slice(0, 500);
  }
  return sanitized;
}

function sanitizeError(error: Error): Record<string, TelemetryPrimitive> {
  return {
    name: sanitizeText(error.name || 'Error'),
    message: sanitizeText(error.message).slice(0, 500),
    stack: error.stack
      ? sanitizeText(error.stack).split('\n').slice(0, 12).join('\n')
      : null
  };
}

function telemetryLevel(): TelemetryLevel {
  const rawLevel = configurationValue<string>(
    'telemetry.telemetryLevel',
    'all'
  ).toLowerCase();
  if (rawLevel === 'off' || rawLevel === 'crash' || rawLevel === 'error') {
    return rawLevel;
  }
  return 'all';
}

function levelAllows(kind: TelemetryKind): boolean {
  const level = telemetryLevel();
  if (level === 'off' || level === 'crash') {
    return false;
  }
  return kind === 'error' || level === 'all';
}

class HttpTelemetryTransport implements TelemetryTransport {
  constructor(
    private readonly endpoint: string,
    private readonly fetchImpl: typeof fetch | undefined
  ) {}

  async send(envelope: TelemetryEnvelope): Promise<void> {
    if (!this.fetchImpl) {
      throw new Error('No fetch implementation available for telemetry');
    }
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(envelope)
    });
    if (!response.ok) {
      throw new Error(`Telemetry endpoint returned ${response.status}`);
    }
  }
}

export class TelemetryService {
  private readonly pending: TelemetryEnvelope[] = [];
  private activeFlush: Promise<void> | undefined;
  private cachedEndpointTransport:
    | { endpoint: string; transport: TelemetryTransport }
    | undefined;

  constructor(
    private readonly sink?: TelemetrySink | undefined,
    private readonly fetchImpl:
      | typeof fetch
      | undefined = globalThis.fetch?.bind(globalThis)
  ) {}

  trackCommand(commandId: string, durationMs: number): void {
    if (!this.shouldEmit('usage')) {
      return;
    }
    if (this.sink && isLegacyTelemetrySender(this.sink)) {
      this.sink.trackCommand(sanitizeTelemetryName(commandId), { durationMs });
      return;
    }
    this.enqueue({
      kind: 'usage',
      name: 'kicadstudio.command',
      timestamp: new Date().toISOString(),
      data: {
        commandId: sanitizeTelemetryName(commandId),
        durationMs
      }
    });
    void this.flush();
  }

  trackEvent(eventName: string, properties?: Record<string, string>): void {
    if (!this.shouldEmit('usage')) {
      return;
    }
    const sanitizedName = sanitizeTelemetryName(eventName);
    const sanitizedProperties = sanitizeProperties(properties);
    if (this.sink && isLegacyTelemetrySender(this.sink)) {
      this.sink.trackEvent?.(sanitizedName, sanitizedProperties);
      return;
    }
    this.enqueue({
      kind: 'usage',
      name: sanitizedName,
      timestamp: new Date().toISOString(),
      data: {
        properties: sanitizedProperties ?? {}
      }
    });
    void this.flush();
  }

  trackError(error: Error, properties?: Record<string, string>): void {
    if (!this.shouldEmit('error')) {
      return;
    }
    const sanitizedProperties = sanitizeProperties(properties);
    if (this.sink && isLegacyTelemetrySender(this.sink)) {
      this.sink.trackEvent?.('kicadstudio.error', {
        errorName: sanitizeText(error.name || 'Error'),
        errorMessage: sanitizeText(error.message).slice(0, 500),
        ...(sanitizedProperties ?? {})
      });
      return;
    }
    this.enqueue({
      kind: 'error',
      name: 'kicadstudio.error',
      timestamp: new Date().toISOString(),
      data: {
        error: sanitizeError(error),
        properties: sanitizedProperties ?? {}
      }
    });
    void this.flush();
  }

  async flush(): Promise<void> {
    if (this.activeFlush) {
      return this.activeFlush;
    }
    this.activeFlush = this.flushPending().finally(() => {
      this.activeFlush = undefined;
    });
    return this.activeFlush;
  }

  bufferedEvents(): number {
    return this.pending.length;
  }

  pendingEvents(): readonly TelemetryEnvelope[] {
    return [...this.pending];
  }

  private shouldEmit(kind: TelemetryKind): boolean {
    return (
      configurationValue<boolean>(SETTINGS.telemetryEnabled, false) &&
      levelAllows(kind)
    );
  }

  private enqueue(envelope: TelemetryEnvelope): void {
    const limit = configuredBufferLimit();
    if (limit === 0) {
      return;
    }
    this.pending.push(envelope);
    while (this.pending.length > limit) {
      this.pending.shift();
    }
  }

  private resolveTransport(): TelemetryTransport | undefined {
    if (this.sink && isTelemetryTransport(this.sink)) {
      return this.sink;
    }
    const endpoint = telemetryEndpoint();
    if (!endpoint) {
      return undefined;
    }
    if (this.cachedEndpointTransport?.endpoint === endpoint) {
      return this.cachedEndpointTransport.transport;
    }
    const transport = new HttpTelemetryTransport(endpoint, this.fetchImpl);
    this.cachedEndpointTransport = { endpoint, transport };
    return transport;
  }

  private async flushPending(): Promise<void> {
    const transport = this.resolveTransport();
    if (!transport) {
      return;
    }
    while (this.pending.length > 0) {
      const envelope = this.pending.shift();
      if (!envelope) {
        return;
      }
      try {
        await transport.send(envelope);
      } catch {
        const limit = configuredBufferLimit();
        if (limit > 0) {
          this.pending.unshift(envelope);
          while (this.pending.length > limit) {
            this.pending.shift();
          }
        }
        return;
      }
    }
  }
}

export const telemetry = new TelemetryService();
