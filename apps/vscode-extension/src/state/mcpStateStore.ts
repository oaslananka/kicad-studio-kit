import * as vscode from 'vscode';
import type {
  McpCapabilityCard,
  McpConnectionState,
  McpInstallStatus,
  McpServerCard
} from '../types';
import { redactSensitiveText } from '../utils/secrets';

export class McpStateStore implements vscode.Disposable {
  private readonly onDidChangeEmitter =
    new vscode.EventEmitter<McpConnectionState>();
  readonly onDidChange = this.onDidChangeEmitter.event;
  private state: McpConnectionState = {
    kind: 'Disconnected',
    available: false,
    connected: false
  };

  update(state: McpConnectionState): McpConnectionState {
    this.state = cloneMcpConnectionState(state);
    const snapshot = this.getState();
    this.onDidChangeEmitter.fire(snapshot);
    return snapshot;
  }

  getState(): McpConnectionState {
    return cloneMcpConnectionState(this.state);
  }

  getDiagnosticBundleSnapshot(): McpConnectionState {
    const snapshot = this.getState();
    return {
      ...snapshot,
      message: snapshot.message
        ? redactSensitiveText(snapshot.message)
        : undefined,
      server: snapshot.server
        ? {
            ...snapshot.server,
            capabilities: {
              ...snapshot.server.capabilities,
              diagnostics: snapshot.server.capabilities.diagnostics?.map(
                (value) => redactSensitiveText(value)
              ),
              serverInfo: snapshot.server.capabilities.serverInfo
                ? {
                    ...snapshot.server.capabilities.serverInfo,
                    diagnostics:
                      snapshot.server.capabilities.serverInfo.diagnostics?.map(
                        (value) => redactSensitiveText(value)
                      ) ?? []
                  }
                : undefined
            }
          }
        : undefined
    };
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }
}

function cloneMcpConnectionState(
  state: McpConnectionState
): McpConnectionState {
  return {
    ...state,
    install: cloneInstall(state.install),
    server: cloneServerCard(state.server)
  };
}

function cloneInstall(
  install: McpInstallStatus | undefined
): McpInstallStatus | undefined {
  return install ? { ...install } : undefined;
}

function cloneServerCard(
  server: McpServerCard | undefined
): McpServerCard | undefined {
  return server
    ? {
        ...server,
        capabilities: cloneCapabilities(server.capabilities)
      }
    : undefined;
}

function cloneCapabilities(capabilities: McpCapabilityCard): McpCapabilityCard {
  const serverInfo = capabilities.serverInfo;
  return {
    ...capabilities,
    tools: [...(capabilities.tools ?? [])],
    resources: [...(capabilities.resources ?? [])],
    prompts: [...(capabilities.prompts ?? [])],
    diagnostics: capabilities.diagnostics
      ? [...capabilities.diagnostics]
      : undefined,
    serverInfo: serverInfo
      ? {
          ...serverInfo,
          ...(serverInfo.localizedDescriptions
            ? {
                localizedDescriptions: {
                  ...serverInfo.localizedDescriptions
                }
              }
            : {}),
          compatibilityRange: {
            kicadStudio: {
              ...serverInfo.compatibilityRange?.kicadStudio
            },
            kicadMcpPro: {
              ...serverInfo.compatibilityRange?.kicadMcpPro
            }
          },
          transport: { ...serverInfo.transport },
          kicad: { ...serverInfo.kicad },
          operatingMode: cloneOperatingMode(serverInfo),
          capabilities: {
            ...serverInfo.capabilities,
            liveEditingTools: Object.fromEntries(
              Object.entries(
                serverInfo.capabilities?.liveEditingTools ?? {}
              ).map(([name, availability]) => [name, { ...availability }])
            ),
            cliExports: {
              ...serverInfo.capabilities?.cliExports
            }
          },
          diagnostics: [...(serverInfo.diagnostics ?? [])]
        }
      : undefined
  };
}

function cloneOperatingMode(
  serverInfo: NonNullable<McpCapabilityCard['serverInfo']>
): NonNullable<McpCapabilityCard['serverInfo']>['operatingMode'] {
  const mode = serverInfo.operatingMode;
  if (!mode) {
    return {
      active: 'readonly',
      default: 'readonly',
      available: ['readonly', 'write', 'manufacturing', 'experimental'],
      experimentalEnabled: false,
      toolAvailability: {}
    };
  }
  return {
    ...mode,
    available: [...(mode.available ?? [])],
    toolAvailability: Object.fromEntries(
      Object.entries(mode.toolAvailability ?? {}).map(
        ([name, availability]) => [name, { ...availability }]
      )
    )
  };
}
