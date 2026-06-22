export const COMPATIBILITY_MATRIX = {
  schemaVersion: 1,
  kicad: {
    primary: '10.0.x',
    supported: ['10.0.x', '9.x', '8.x'],
    deprecated: ['9.x', '8.x']
  },
  mcp: {
    protocolVersion: '2025-11-25',
    toolSchema: '1.0'
  },
  products: {
    kicadStudio: {
      version: '1.9.0',
      compatibleMcpPro: {
        required: '>=3.5.2 <4.0.0',
        recommended: '>=3.5.2 <4.0.0',
        testedAgainst: '3.9.2'
      }
    },
    kicadMcpPro: {
      version: '3.9.2',
      compatibleExtension: {
        required: '>=1.0.0 <2.0.0',
        testedAgainst: '1.9.0'
      }
    }
  }
} as const;

export const MCP_PROTOCOL_VERSION = COMPATIBILITY_MATRIX.mcp.protocolVersion;
