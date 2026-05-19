export interface WebviewEnvelope {
  type: string;
  payload?: Record<string, unknown> | undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

export function asString(value: unknown): string | undefined {
  return isString(value) ? value : undefined;
}

export function asNumber(value: unknown): number | undefined {
  return isNumber(value) ? value : undefined;
}

export function hasType(
  value: unknown,
  allowedTypes: string[]
): value is WebviewEnvelope {
  if (!isRecord(value)) {
    return false;
  }

  const type = asString(value['type']);
  if (!type) {
    return false;
  }

  return allowedTypes.includes(type);
}
