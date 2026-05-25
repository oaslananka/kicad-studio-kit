import { getMcpCompatStatus, normalizeMcpVersion } from './compat';
import { validateMcpServerInfoContract } from '@oaslananka/kicad-protocol-schemas';
import type { Logger } from '../utils/logger';
import type { McpServerInfoContract } from '../types';

export interface WellKnownMcpServerMetadata {
  version: string;
  serverInfo?: McpServerInfoContract | undefined;
}

export async function readWellKnownMcpServerVersion(
  endpoint: string,
  logger: Pick<Logger, 'debug'>
): Promise<string | undefined> {
  return (await readWellKnownMcpServerMetadata(endpoint, logger))?.version;
}

export async function readWellKnownMcpServerMetadata(
  endpoint: string,
  logger: Pick<Logger, 'debug'>
): Promise<WellKnownMcpServerMetadata | undefined> {
  for (const path of ['/.well-known/mcp-server', '/well-known/mcp-server']) {
    try {
      const response = await fetch(`${endpoint}${path}`, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) {
        continue;
      }
      const payload = (await response.json()) as unknown;
      const version = normalizeMcpVersion(readWellKnownVersion(payload));
      if (getMcpCompatStatus(version) !== 'incompatible') {
        logger.debug(`Using MCP server-card version ${version} from ${path}.`);
        const serverInfo = readWellKnownServerInfoContract(payload);
        return {
          version,
          ...(serverInfo ? { serverInfo } : {})
        };
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

function readWellKnownVersion(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const serverInfo = isRecord(value['serverInfo']) ? value['serverInfo'] : {};
  const name = String(serverInfo['name'] ?? serverInfo['title'] ?? '');
  if (!/kicad[- ]mcp[- ]pro/i.test(name)) {
    return undefined;
  }
  return typeof serverInfo['version'] === 'string'
    ? serverInfo['version']
    : typeof value['version'] === 'string'
      ? value['version']
      : undefined;
}

function readWellKnownServerInfoContract(
  value: unknown
): McpServerInfoContract | undefined {
  if (!isRecord(value) || !isRecord(value['serverInfoContract'])) {
    return undefined;
  }
  const contract = value['serverInfoContract'];
  const validation = validateMcpServerInfoContract(contract);
  return validation.valid ? validation.data : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
