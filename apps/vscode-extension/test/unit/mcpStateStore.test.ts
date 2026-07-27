import * as vscode from 'vscode';
import { McpStateStore } from '../../src/state/mcpStateStore';
import type {
  McpCapabilityCard,
  McpConnectionState,
  McpServerInfoContract
} from '../../src/types';

jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});

function serverInfoFixture(): McpServerInfoContract {
  return {
    schemaVersion: '1.0.0',
    server: 'kicad-mcp-pro',
    description: 'KiCad MCP server',
    localizedDescriptions: { tr: 'KiCad MCP sunucusu' },
    version: '3.5.2',
    mcpProtocolVersion: '2025-03-26',
    toolSchemaVersion: '1.0.0',
    compatibilityRange: {
      kicadStudio: {
        required: '>=1.9.0',
        recommended: '>=1.9.6',
        testedAgainst: '1.9.6'
      },
      kicadMcpPro: {
        required: '>=3.5.0',
        testedAgainst: '3.5.2'
      }
    },
    transport: {
      type: 'streamable-http',
      streamableHttp: true,
      statelessHttp: false,
      legacySse: false,
      authRequired: false,
      endpoint: 'http://127.0.0.1:27185'
    },
    kicad: {
      cliFound: true,
      cliPath: '/usr/bin/kicad-cli',
      cliVersion: '10.0.5',
      ipcAvailable: true,
      ipcVersion: '1.0.0',
      ipcApiVersion: '1',
      ipcMajorVersion: 1,
      ipcEndpointSource: 'default',
      livePcbContext: true,
      liveSchematicContext: true,
      ipcDocumentLoaded: true
    },
    operatingMode: {
      active: 'write',
      default: 'readonly',
      available: ['readonly', 'write'],
      experimentalEnabled: false,
      toolAvailability: {
        apply_fix: {
          available: true,
          requiredMode: 'write',
          reason: null
        }
      }
    },
    capabilities: {
      fileBackedDrc: true,
      fileBackedErc: true,
      fileBackedExports: true,
      livePcbRead: true,
      livePcbWrite: true,
      liveSchematicRead: true,
      liveSchematicWrite: false,
      liveEditingTools: {
        apply_fix: {
          available: true,
          backend: 'kicad-ipc',
          reason: null,
          minimumKiCadMajor: 10
        }
      },
      chatgptConnectorCompatible: true,
      cliExports: {
        ipc2581: true,
        odb: true,
        svg: true,
        dxf: true,
        step: true,
        stepz: true,
        xao: true,
        render: true,
        spiceNetlist: true
      }
    },
    diagnostics: ['token=raw-server-secret']
  };
}

function connectedStateFixture(): McpConnectionState {
  return {
    kind: 'Connected',
    available: true,
    connected: true,
    install: {
      found: true,
      command: 'uvx',
      version: '3.5.2',
      source: 'uvx'
    },
    message: 'Authorization: Bearer raw-mcp-token',
    server: {
      version: '3.5.2',
      compat: 'ok',
      capturedAt: '2026-07-27T00:00:00.000Z',
      capabilities: {
        tools: ['apply_fix'],
        resources: ['kicad://project'],
        prompts: ['review_board'],
        diagnostics: ['password=raw-capability-secret'],
        serverInfo: serverInfoFixture()
      }
    }
  };
}

describe('MCP state store boundary', () => {
  it('deep-clones retained and returned MCP metadata', () => {
    const store = new McpStateStore();
    const state = connectedStateFixture();

    store.update(state);

    state.install!.version = 'mutated';
    state.server!.capabilities.tools.push('mutated_tool');
    state.server!.capabilities.serverInfo!.localizedDescriptions!['tr'] =
      'mutated';
    state.server!.capabilities.serverInfo!.capabilities.liveEditingTools[
      'apply_fix'
    ]!.minimumKiCadMajor = 99;
    state.server!.capabilities.serverInfo!.operatingMode.toolAvailability[
      'apply_fix'
    ]!.available = false;

    const snapshot = store.getState();
    expect(snapshot.install?.version).toBe('3.5.2');
    expect(snapshot.server?.capabilities.tools).toEqual(['apply_fix']);
    expect(
      snapshot.server?.capabilities.serverInfo?.localizedDescriptions?.['tr']
    ).toBe('KiCad MCP sunucusu');
    expect(
      snapshot.server?.capabilities.serverInfo?.capabilities.liveEditingTools[
        'apply_fix'
      ]?.minimumKiCadMajor
    ).toBe(10);
    expect(
      snapshot.server?.capabilities.serverInfo?.operatingMode.toolAvailability[
        'apply_fix'
      ]?.available
    ).toBe(true);

    snapshot.server!.capabilities.resources.push('snapshot-mutation');
    snapshot.server!.capabilities.serverInfo!.transport.endpoint = 'mutated';
    expect(store.getState().server?.capabilities.resources).toEqual([
      'kicad://project'
    ]);
    expect(
      store.getState().server?.capabilities.serverInfo?.transport.endpoint
    ).toBe('http://127.0.0.1:27185');
  });

  it('supplies the legacy default operating mode without mutating input', () => {
    const store = new McpStateStore();
    const state = connectedStateFixture();
    const serverInfo = state.server!.capabilities.serverInfo!;
    delete (serverInfo as Partial<McpServerInfoContract>).operatingMode;

    store.update(state);

    expect(
      store.getState().server?.capabilities.serverInfo?.operatingMode
    ).toEqual({
      active: 'readonly',
      default: 'readonly',
      available: ['readonly', 'write', 'manufacturing', 'experimental'],
      experimentalEnabled: false,
      toolAvailability: {}
    });
    expect(serverInfo.operatingMode).toBeUndefined();
  });

  it('preserves disconnected and sparse capability states', () => {
    const store = new McpStateStore();

    expect(store.getState()).toEqual({
      kind: 'Disconnected',
      available: false,
      connected: false,
      install: undefined,
      server: undefined
    });
    expect(store.getDiagnosticBundleSnapshot()).toEqual({
      kind: 'Disconnected',
      available: false,
      connected: false,
      install: undefined,
      message: undefined,
      server: undefined
    });

    const sparseState = connectedStateFixture();
    delete sparseState.install;
    delete sparseState.message;
    sparseState.server!.capabilities = {
      tools: undefined,
      resources: undefined,
      prompts: undefined
    } as unknown as McpCapabilityCard;

    store.update(sparseState);
    expect(store.getState().server?.capabilities).toEqual({
      tools: [],
      resources: [],
      prompts: [],
      diagnostics: undefined,
      serverInfo: undefined
    });
    expect(store.getDiagnosticBundleSnapshot().server?.capabilities).toEqual({
      tools: [],
      resources: [],
      prompts: [],
      diagnostics: undefined,
      serverInfo: undefined
    });
  });

  it('normalizes partial legacy nested metadata without retaining references', () => {
    const store = new McpStateStore();
    const state = connectedStateFixture();
    const serverInfo = state.server!.capabilities.serverInfo!;
    delete serverInfo.localizedDescriptions;
    delete (
      serverInfo.capabilities as Partial<McpServerInfoContract['capabilities']>
    ).liveEditingTools;
    delete (serverInfo as Partial<McpServerInfoContract>).diagnostics;
    delete (
      serverInfo.operatingMode as Partial<
        McpServerInfoContract['operatingMode']
      >
    ).available;
    delete (
      serverInfo.operatingMode as Partial<
        McpServerInfoContract['operatingMode']
      >
    ).toolAvailability;

    store.update(state);

    const snapshot = store.getState().server?.capabilities.serverInfo;
    expect(snapshot?.localizedDescriptions).toBeUndefined();
    expect(snapshot?.capabilities.liveEditingTools).toEqual({});
    expect(snapshot?.diagnostics).toEqual([]);
    expect(snapshot?.operatingMode.available).toEqual([]);
    expect(snapshot?.operatingMode.toolAvailability).toEqual({});
    expect(
      store.getDiagnosticBundleSnapshot().server?.capabilities.serverInfo
        ?.diagnostics
    ).toEqual([]);
  });

  it('redacts connection and nested diagnostic secrets', () => {
    const store = new McpStateStore();
    store.update(connectedStateFixture());

    const serialized = JSON.stringify(store.getDiagnosticBundleSnapshot());
    expect(serialized).toContain('Bearer ***');
    expect(serialized).toContain('password=***');
    expect(serialized).toContain('token=***');
    expect(serialized).not.toContain('raw-mcp-token');
    expect(serialized).not.toContain('raw-capability-secret');
    expect(serialized).not.toContain('raw-server-secret');
  });

  it('publishes snapshots and disposes its event emitter', () => {
    const fire = jest.spyOn(vscode.EventEmitter.prototype, 'fire');
    const dispose = jest.spyOn(vscode.EventEmitter.prototype, 'dispose');
    const store = new McpStateStore();

    const snapshot = store.update(connectedStateFixture());
    expect(fire).toHaveBeenCalledWith(snapshot);

    store.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);

    fire.mockRestore();
    dispose.mockRestore();
  });
});
