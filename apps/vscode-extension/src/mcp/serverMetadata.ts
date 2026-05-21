import { getMcpCompatStatus, normalizeMcpVersion } from './compat';
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
  if (contract['server'] !== 'kicad-mcp-pro') {
    return undefined;
  }
  const transport = isRecord(contract['transport'])
    ? contract['transport']
    : {};
  const kicad = isRecord(contract['kicad']) ? contract['kicad'] : {};
  const capabilities = isRecord(contract['capabilities'])
    ? contract['capabilities']
    : {};
  const cliExports = isRecord(capabilities['cliExports'])
    ? capabilities['cliExports']
    : {};
  const compatibilityRange = isRecord(contract['compatibilityRange'])
    ? contract['compatibilityRange']
    : {};
  const kicadStudio = isRecord(compatibilityRange['kicadStudio'])
    ? compatibilityRange['kicadStudio']
    : {};
  const kicadMcpPro = isRecord(compatibilityRange['kicadMcpPro'])
    ? compatibilityRange['kicadMcpPro']
    : {};
  return {
    schemaVersion: stringValue(contract['schemaVersion']),
    server: 'kicad-mcp-pro',
    version: stringValue(contract['version']),
    mcpProtocolVersion: stringValue(contract['mcpProtocolVersion']),
    toolSchemaVersion: stringValue(contract['toolSchemaVersion']),
    compatibilityRange: {
      kicadStudio: {
        required: stringValue(kicadStudio['required']),
        recommended: stringValue(kicadStudio['recommended']),
        testedAgainst: stringValue(kicadStudio['testedAgainst'])
      },
      kicadMcpPro: {
        required: stringValue(kicadMcpPro['required']),
        testedAgainst: stringValue(kicadMcpPro['testedAgainst'])
      }
    },
    transport: {
      type: transport['type'] === 'stdio' ? 'stdio' : 'streamable-http',
      streamableHttp: Boolean(transport['streamableHttp']),
      statelessHttp: Boolean(transport['statelessHttp']),
      legacySse: Boolean(transport['legacySse']),
      authRequired: Boolean(transport['authRequired']),
      endpoint:
        typeof transport['endpoint'] === 'string' ? transport['endpoint'] : null
    },
    kicad: {
      cliFound: Boolean(kicad['cliFound']),
      cliPath: stringValue(kicad['cliPath']),
      cliVersion:
        typeof kicad['cliVersion'] === 'string' ? kicad['cliVersion'] : null,
      ipcAvailable: Boolean(kicad['ipcAvailable']),
      livePcbContext: Boolean(kicad['livePcbContext'])
    },
    capabilities: {
      fileBackedDrc: Boolean(capabilities['fileBackedDrc']),
      fileBackedErc: Boolean(capabilities['fileBackedErc']),
      fileBackedExports: Boolean(capabilities['fileBackedExports']),
      livePcbRead: Boolean(capabilities['livePcbRead']),
      livePcbWrite: Boolean(capabilities['livePcbWrite']),
      chatgptConnectorCompatible: Boolean(
        capabilities['chatgptConnectorCompatible']
      ),
      cliExports: {
        ipc2581: Boolean(cliExports['ipc2581']),
        odb: Boolean(cliExports['odb']),
        svg: Boolean(cliExports['svg']),
        dxf: Boolean(cliExports['dxf']),
        step: Boolean(cliExports['step']),
        render: Boolean(cliExports['render']),
        spiceNetlist: Boolean(cliExports['spiceNetlist'])
      }
    },
    diagnostics: Array.isArray(contract['diagnostics'])
      ? contract['diagnostics'].map((item) => String(item))
      : []
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
