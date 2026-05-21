export type McpMappedErrorKind =
  | 'bad-request'
  | 'http'
  | 'incompatible'
  | 'missing-tool'
  | 'network'
  | 'server'
  | 'session'
  | 'stdio'
  | 'timeout'
  | 'unknown';

export interface McpMappedError {
  kind: McpMappedErrorKind;
  message: string;
  retryable: boolean;
  status?: number | undefined;
  code?: string | undefined;
  hint?: string | undefined;
}

export function mapMcpError(error: unknown): McpMappedError {
  const message = error instanceof Error ? error.message : String(error);
  const status = httpStatusFromMessage(message);
  const code = stringProperty(error, 'code');
  const hint = stringProperty(error, 'hint');

  if (
    code &&
    /(?:tool|method).*(?:missing|not[_-]?found)|not[_-]?found/i.test(code)
  ) {
    return {
      kind: 'missing-tool',
      message,
      retryable: false,
      code,
      hint
    };
  }

  if (/stdio/i.test(message)) {
    return { kind: 'stdio', message, retryable: false, code, hint };
  }
  if (/incompatible/i.test(message)) {
    return { kind: 'incompatible', message, retryable: false, code, hint };
  }
  if (/timed out|timeout|AbortError/i.test(message)) {
    return { kind: 'timeout', message, retryable: true, code, hint };
  }
  if (status === 400) {
    return {
      kind: 'bad-request',
      message,
      retryable: false,
      status,
      code,
      hint
    };
  }
  if (status === 421) {
    return { kind: 'session', message, retryable: true, status, code, hint };
  }
  if (typeof status === 'number' && status >= 500) {
    return { kind: 'server', message, retryable: true, status, code, hint };
  }
  if (typeof status === 'number') {
    return { kind: 'http', message, retryable: false, status, code, hint };
  }
  if (
    error instanceof TypeError ||
    /(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|network|fetch)/i.test(
      message
    )
  ) {
    return { kind: 'network', message, retryable: true, code, hint };
  }

  return { kind: 'unknown', message, retryable: false, code, hint };
}

export function isRecoverableMcpUnavailableError(error: unknown): boolean {
  const mapped = mapMcpError(error);
  return (
    mapped.kind === 'stdio' ||
    mapped.kind === 'network' ||
    mapped.kind === 'timeout'
  );
}

function httpStatusFromMessage(message: string): number | undefined {
  const match = /\bHTTP\s+(\d{3})\b/i.exec(message);
  if (!match) {
    return undefined;
  }
  const status = Number(match[1]);
  return Number.isFinite(status) ? status : undefined;
}

function stringProperty(value: unknown, property: string): string | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return typeof record[property] === 'string' ? record[property] : undefined;
}
