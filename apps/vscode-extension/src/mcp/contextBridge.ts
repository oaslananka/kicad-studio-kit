import { createHash } from 'node:crypto';
import type { StudioContext } from '../types';
import { McpClient } from './mcpClient';

export type ContextPushReason = 'save' | 'focus' | 'cursor' | 'drc' | 'default';

const PUSH_DELAYS: Record<ContextPushReason, number> = {
  save: 0,
  drc: 0,
  focus: 200,
  cursor: 1000,
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

  constructor(private readonly client: McpClient) {}

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
    const hash = hashContext(context);
    if (hash === this.lastContextHash) {
      return;
    }

    this.pendingContext = {
      context: cloneContext(context),
      hash
    };
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
    void this.client.pushContext(next.context);
  }
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

function cloneContext(context: StudioContext): StudioContext {
  return typeof structuredClone === 'function'
    ? structuredClone(context)
    : (JSON.parse(JSON.stringify(context)) as StudioContext);
}
