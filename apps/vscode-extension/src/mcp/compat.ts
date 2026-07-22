import semver from 'semver';

import { COMPATIBILITY_MATRIX } from './compatibilityMatrix';

export const MCP_COMPAT =
  COMPATIBILITY_MATRIX.products.kicadStudio.compatibleMcpPro;

export type McpCompatStatus = 'ok' | 'warn' | 'incompatible';

function coerceMcpVersion(version: string | undefined): string | undefined {
  if (!version) {
    return undefined;
  }
  return semver.coerce(version)?.version;
}

export function normalizeMcpVersion(version: string | undefined): string {
  return coerceMcpVersion(version) ?? '0.0.0';
}

export function isMcpVersionSupported(version: string | undefined): boolean {
  const normalized = normalizeMcpVersion(version);
  return Boolean(
    normalized && semver.satisfies(normalized, MCP_COMPAT.required)
  );
}

export function getMcpCompatStatus(
  version: string | undefined
): McpCompatStatus {
  const normalized = normalizeMcpVersion(version);
  if (!semver.satisfies(normalized, MCP_COMPAT.required)) {
    return 'incompatible';
  }
  return semver.satisfies(normalized, MCP_COMPAT.recommended) ? 'ok' : 'warn';
}

export function describeMcpCompatibility(version: string | undefined): string {
  const normalized = coerceMcpVersion(version);
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
