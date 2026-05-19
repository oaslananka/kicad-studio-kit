import semver from 'semver';

export const MCP_COMPAT = {
  required: '>=1.0.0 <2.0.0',
  recommended: '>=1.0.0 <2.0.0',
  testedAgainst: '1.0.0'
} as const;

export type McpCompatStatus = 'ok' | 'warn' | 'incompatible';

export function normalizeMcpVersion(version: string | undefined): string {
  if (!version) {
    return '0.0.0';
  }
  const parsed = semver.coerce(version);
  return parsed?.version ?? '0.0.0';
}

export function isMcpVersionSupported(version: string | undefined): boolean {
  const normalized = normalizeMcpVersion(version);
  return Boolean(normalized && semver.satisfies(normalized, MCP_COMPAT.required));
}

export function getMcpCompatStatus(version: string | undefined): McpCompatStatus {
  const normalized = normalizeMcpVersion(version);
  if (!semver.satisfies(normalized, MCP_COMPAT.required)) {
    return 'incompatible';
  }
  return semver.satisfies(normalized, MCP_COMPAT.recommended)
    ? 'ok'
    : 'warn';
}

export function describeMcpCompatibility(version: string | undefined): string {
  const normalized = normalizeMcpVersion(version);
  if (!normalized) {
    return `Unable to determine kicad-mcp-pro version. Required range: ${MCP_COMPAT.required}.`;
  }
  const status = getMcpCompatStatus(normalized);
  if (status === 'incompatible') {
    return `kicad-mcp-pro ${normalized} is outside the required range ${MCP_COMPAT.required}.`;
  }
  if (status === 'warn') {
    return `kicad-mcp-pro ${normalized} satisfies the required range but is older than ${MCP_COMPAT.recommended}.`;
  }
  return `kicad-mcp-pro ${normalized} is supported.`;
}
