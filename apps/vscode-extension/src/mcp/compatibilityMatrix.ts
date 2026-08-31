export const COMPATIBILITY_MATRIX = {
  schemaVersion: 1,
  kicad: {
    primary: '10.0.x',
    supported: ['10.0.x', '9.x', '8.x'],
    deprecated: ['9.x', '8.x']
  },
  supportAxes: {
    studioCli: {
      kicad: {
        stable: ['10.0.x'],
        deprecated: ['9.x', '8.x'],
        preview: ['11.0.x'],
        dropped: []
      }
    },
    mcpServer: {
      required: '>=3.5.2 <4.0.0',
      recommended: '>=3.5.2 <4.0.0',
      testedAgainst: '3.33.3'
    },
    mcpProtocol: {
      active: '2025-11-25',
      next: '2026-07-28',
      activationState: 'blocked'
    },
    boardReadyOps: {
      required: '>=1.2.0 <2.0.0',
      testedAgainst: '1.37.0',
      doctorSchema: 1,
      findingsSchema: 1,
      evidenceBundleSchema: 2
    }
  },
  mcp: {
    protocolVersion: '2025-11-25',
    toolSchema: '1.0'
  },
  products: {
    kicadStudio: {
      version: '1.11.1',
      compatibleMcpPro: {
        required: '>=3.5.2 <4.0.0',
        recommended: '>=3.5.2 <4.0.0',
        testedAgainst: '3.33.3'
      }
    },
    kicadMcpPro: {
      version: '3.33.3',
      compatibleExtension: {
        required: '>=1.0.0 <2.0.0',
        testedAgainst: '1.11.1'
      }
    }
  }
} as const;

export const MCP_PROTOCOL_VERSION = COMPATIBILITY_MATRIX.mcp.protocolVersion;
