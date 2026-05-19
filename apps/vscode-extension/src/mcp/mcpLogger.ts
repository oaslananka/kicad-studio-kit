import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { SETTINGS } from '../constants';
import type { McpLogEntry } from '../types';
import { redactApiKey } from '../utils/secrets';

const DEFAULT_SIZE = 200;
const MAX_SIZE = 1000;
const MAX_BODY_CHARS = 8 * 1024;

export class McpLogger {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.onDidChangeEmitter.event;
  private entries: McpLogEntry[] = [];
  private nextId = 1;

  recordRequest(
    method: string,
    payload: string,
    headers: Record<string, string>
  ): void {
    this.push({
      direction: 'request',
      method,
      summary: method,
      payload: redactPayload({ headers, body: payload })
    });
  }

  recordResponse(method: string, payload: unknown): void {
    this.push({
      direction: 'response',
      method,
      summary: `${method} response`,
      payload: redactPayload(payload)
    });
  }

  recordError(method: string, message: string): void {
    this.push({
      direction: 'error',
      method,
      summary: message,
      payload: redactPayload({ error: message })
    });
  }

  list(): McpLogEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }

  clear(): void {
    this.entries = [];
    this.onDidChangeEmitter.fire();
  }

  renderMarkdown(): string {
    if (!this.entries.length) {
      return '# KiCad Studio MCP Log\n\nNo MCP traffic captured yet.\n';
    }
    const lines = ['# KiCad Studio MCP Log', ''];
    for (const entry of this.entries) {
      lines.push(
        `## ${entry.id}. ${entry.direction.toUpperCase()} ${entry.method}`,
        '',
        `- Time: ${entry.timestamp}`,
        `- Summary: ${entry.summary}`,
        '',
        '```json',
        entry.payload,
        '```',
        ''
      );
    }
    return lines.join('\n');
  }

  private push(entry: Omit<McpLogEntry, 'id' | 'timestamp'>): void {
    const size = readLogSize();
    this.entries.push({
      id: this.nextId,
      timestamp: new Date().toISOString(),
      ...entry
    });
    this.nextId += 1;
    if (this.entries.length > size) {
      this.entries = this.entries.slice(this.entries.length - size);
    }
    this.onDidChangeEmitter.fire();
  }
}

function readLogSize(): number {
  const configured = vscode.workspace
    .getConfiguration()
    .get<number>(SETTINGS.mcpLogSize, DEFAULT_SIZE);
  return Math.min(MAX_SIZE, Math.max(1, Math.floor(configured)));
}

function redactPayload(value: unknown): string {
  return truncate(
    redactApiKey(
      redactHome(
        redactBearerTokens(redactSensitiveKeys(JSON.stringify(value, null, 2)))
      )
    )
  );
}

function redactSensitiveKeys(value: string): string {
  return value.replace(
    /("(?:authorization|mcp-session-id|cookie|set-cookie|x-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password)"\s*:\s*")([^"]+)(")/gi,
    '$1[redacted]$3'
  );
}

function redactBearerTokens(value: string): string {
  return value.replace(
    /\b(Bearer\s+|(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token)=)([A-Za-z0-9._~+/-]{8,})/gi,
    '$1[redacted]'
  );
}

function redactHome(value: string): string {
  const home = os.homedir();
  if (!home) {
    return value;
  }
  const normalized = path.normalize(home);
  const jsonEscaped = JSON.stringify(normalized).slice(1, -1);
  const doubleJsonEscaped = jsonEscaped.replace(/\\/g, '\\\\');
  return [normalized, jsonEscaped, doubleJsonEscaped].reduce(
    (next, candidate) =>
      next.replace(new RegExp(escapeRegExp(candidate), 'gi'), '~'),
    value
  );
}

function truncate(value: string): string {
  if (value.length <= MAX_BODY_CHARS) {
    return value;
  }
  return `${value.slice(0, MAX_BODY_CHARS)}\n[truncated]`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
