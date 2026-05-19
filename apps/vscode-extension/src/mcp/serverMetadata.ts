import { getMcpCompatStatus, normalizeMcpVersion } from './compat';
import type { Logger } from '../utils/logger';

export async function readWellKnownMcpServerVersion(
  endpoint: string,
  logger: Pick<Logger, 'debug'>
): Promise<string | undefined> {
  for (const path of ['/.well-known/mcp-server', '/well-known/mcp-server']) {
    try {
      const response = await fetch(`${endpoint}${path}`, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) {
        continue;
      }
      const version = normalizeMcpVersion(
        readWellKnownVersion((await response.json()) as unknown)
      );
      if (getMcpCompatStatus(version) !== 'incompatible') {
        logger.debug(`Using MCP server-card version ${version} from ${path}.`);
        return version;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
