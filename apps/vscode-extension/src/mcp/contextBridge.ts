import * as os from 'node:os';
import { createHash } from 'node:crypto';
import * as vscode from 'vscode';
import { SETTINGS } from '../constants';
import type { StudioContext } from '../types';
import type { ContextMcpAdapter } from './mcpToolAdapter';

export type ContextPushReason = 'save' | 'focus' | 'cursor' | 'drc' | 'default';

const PUSH_DELAYS: Record<ContextPushReason, number> = {
  save: 0,
  drc: 0,
  focus: 200,
  cursor: 500,
  default: 500
};

export class ContextBridge {
  private lastContextHash: string | undefined;
  private pendingContext:
    | {
        context: StudioContext;
        hash: string;
      }
    | undefined;
  private flushTimer: NodeJS.Timeout | undefined;

  constructor(private readonly adapter: ContextMcpAdapter) {}

  dispose(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    this.flushPending();
  }

  async pushContext(
    context: StudioContext,
    reason: ContextPushReason = 'default'
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration();
    const pushContextEnabled = config.get<boolean>(
      SETTINGS.mcpPushContext,
      true
    );
    const bridgeEnabled = config.get<boolean>(
      SETTINGS.mcpContextBridgeEnabled,
      true
    );
    if (!pushContextEnabled || !bridgeEnabled) {
      return;
    }

    if (!context.mcpConnected) {
      return;
    }

    const sanitised = redactPaths(context);
    const hash = hashContext(sanitised);
    if (hash === this.lastContextHash) {
      return;
    }

    const maxBytes = config.get<number>(
      SETTINGS.mcpContextBridgeMaxBytes,
      64 * 1024
    );
    const serialised = JSON.stringify(sanitised);
    if (Buffer.byteLength(serialised, 'utf8') > maxBytes) {
      const clamped = truncateContext(sanitised, maxBytes);
      this.pendingContext = {
        context: clamped,
        hash: hashContext(clamped)
      };
    } else {
      this.pendingContext = {
        context: sanitised,
        hash
      };
    }

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    const delay = PUSH_DELAYS[reason] ?? PUSH_DELAYS.default;
    if (delay === 0) {
      this.flushPending();
      return;
    }

    this.flushTimer = setTimeout(() => this.flushPending(), delay);
  }

  private flushPending(): void {
    const next = this.pendingContext;
    this.pendingContext = undefined;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    if (!next || next.hash === this.lastContextHash) {
      return;
    }

    this.lastContextHash = next.hash;
    void this.adapter.pushStudioContext(next.context);
  }
}

function redactPaths(context: StudioContext): StudioContext {
  const homeDir = os.homedir();
  if (!homeDir || homeDir === '/') {
    return context;
  }
  const redact = (value: string | undefined): string | undefined =>
    value !== undefined ? value.replaceAll(homeDir, '~') : undefined;
  return {
    ...context,
    activeFile: redact(context.activeFile),
    projectRoot: redact(context.projectRoot),
    projectFile: redact(context.projectFile),
    activeSheetPath: redact(context.activeSheetPath)
  };
}

function truncateContext(
  context: StudioContext,
  maxBytes: number
): StudioContext {
  let shrunk = { ...context, drcErrors: [...context.drcErrors] };
  while (
    Buffer.byteLength(JSON.stringify(shrunk), 'utf8') > maxBytes &&
    shrunk.drcErrors.length > 0
  ) {
    shrunk = {
      ...shrunk,
      drcErrors: shrunk.drcErrors.slice(
        0,
        Math.floor(shrunk.drcErrors.length / 2)
      )
    };
  }
  if (
    Buffer.byteLength(JSON.stringify(shrunk), 'utf8') > maxBytes &&
    shrunk.fileContents
  ) {
    shrunk.fileContents = shrunk.fileContents.slice(
      0,
      Math.floor(shrunk.fileContents.length / 2)
    );
  }
  if (
    Buffer.byteLength(JSON.stringify(shrunk), 'utf8') > maxBytes &&
    shrunk.selectionText
  ) {
    shrunk.selectionText = shrunk.selectionText.slice(
      0,
      Math.floor(shrunk.selectionText.length / 2)
    );
  }
  return shrunk;
}

function hashContext(context: StudioContext): string {
  return createHash('sha256')
    .update(stableJson(context))
    .digest('hex')
    .slice(0, 16);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .filter(
        (key) => typeof (value as Record<string, unknown>)[key] !== 'undefined'
      )
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
