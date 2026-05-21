import * as vscode from 'vscode';
import { COMMANDS, SETTINGS } from '../constants';
import type {
  McpCapabilityCard,
  McpConnectionState,
  McpInstallStatus
} from '../types';
import type { McpConnectionAdapter } from './mcpToolAdapter';
import { readConfiguredMcpProfile } from '../commands/mcpProfilePicker';

type McpToolsNode = {
  label: string;
  description?: string | undefined;
  tooltip?: string | undefined;
  icon: string;
  contextValue?: string | undefined;
  command?: vscode.Command | undefined;
  children?: McpToolsNode[] | undefined;
};

export class McpToolsProvider implements vscode.TreeDataProvider<McpToolsNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    McpToolsNode | undefined
  >();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(
    private readonly mcpAdapter: Pick<McpConnectionAdapter, 'getState'>
  ) {}

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  getTreeItem(element: McpToolsNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      element.label,
      element.children?.length
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None
    );
    if (element.description !== undefined) {
      item.description = element.description;
    }
    item.tooltip = element.tooltip ?? element.description ?? element.label;
    if (element.contextValue !== undefined) {
      item.contextValue = element.contextValue;
    }
    item.iconPath = new vscode.ThemeIcon(element.icon);
    if (element.command !== undefined) {
      item.command = element.command;
    }
    return item;
  }

  getChildren(element?: McpToolsNode): McpToolsNode[] {
    if (element?.children) {
      return element.children;
    }
    return buildMcpToolNodes(
      this.mcpAdapter.getState(),
      readConfiguredMcpProfile()
    );
  }
}

function buildMcpToolNodes(
  state: McpConnectionState,
  profile: string | undefined
): McpToolsNode[] {
  const nodes: McpToolsNode[] = [
    stateNode(state),
    transportNode(state),
    profileNode(profile),
    installNode(state.install),
    {
      label: 'Open MCP Log',
      description: 'request and response trace',
      icon: 'output',
      command: {
        command: COMMANDS.openMcpLog,
        title: 'Open MCP Log'
      }
    }
  ];

  if (state.server) {
    nodes.splice(
      3,
      0,
      serverNode(state),
      capabilityNode(state.server.capabilities)
    );
  }
  if (state.message) {
    nodes.splice(1, 0, {
      label: 'Last diagnostic',
      description: state.message,
      tooltip: state.message,
      icon: 'info'
    });
  }
  return nodes;
}

function stateNode(state: McpConnectionState): McpToolsNode {
  if (state.kind === 'Degraded') {
    return {
      label: 'MCP degraded',
      description: state.server?.version ?? 'protocol contract failed',
      tooltip:
        state.message ??
        'The MCP endpoint initialized but failed the Streamable HTTP contract check.',
      icon: 'warning',
      command: {
        command: COMMANDS.retryMcp,
        title: 'Retry MCP Connection'
      }
    };
  }
  if (state.kind === 'Incompatible') {
    return {
      label: 'MCP incompatible',
      description: state.server?.version ?? 'unknown server',
      tooltip:
        'The detected kicad-mcp-pro version is outside the extension compatibility range.',
      icon: 'warning',
      command: {
        command: COMMANDS.openMcpUpgradeGuide,
        title: 'Open MCP Upgrade Guide'
      }
    };
  }
  if (state.connected || state.kind === 'VsCodeStdio') {
    return {
      label: 'MCP connected',
      description: state.kind === 'VsCodeStdio' ? 'VS Code stdio' : 'HTTP',
      tooltip:
        state.kind === 'VsCodeStdio'
          ? 'Connected through .vscode/mcp.json. HTTP-only Quality Gates and Fix Queue are unavailable in this transport.'
          : 'Connected to the configured HTTP endpoint.',
      icon: 'plug'
    };
  }
  if (state.kind === 'NotInstalled') {
    return {
      label: 'MCP not installed',
      description: 'install required',
      icon: 'cloud-download',
      command: {
        command: COMMANDS.installMcp,
        title: 'Install kicad-mcp-pro'
      }
    };
  }
  return {
    label: 'MCP disconnected',
    description: state.available ? 'detected, not connected' : 'not detected',
    icon: state.available ? 'warning' : 'circle-slash',
    command: {
      command: state.available
        ? COMMANDS.retryMcp
        : COMMANDS.setupMcpIntegration,
      title: state.available ? 'Retry MCP Connection' : 'Setup MCP Integration'
    }
  };
}

function transportNode(state: McpConnectionState): McpToolsNode {
  const endpoint = vscode.workspace
    .getConfiguration()
    .get<string>(SETTINGS.mcpEndpoint, 'http://127.0.0.1:27185');
  const isStdio = state.kind === 'VsCodeStdio';
  return {
    label: 'Transport',
    description: isStdio ? 'VS Code stdio' : endpoint,
    tooltip: isStdio
      ? 'Configured by .vscode/mcp.json and managed by VS Code.'
      : `HTTP endpoint: ${endpoint}`,
    icon: isStdio ? 'terminal' : 'server',
    command: {
      command: isStdio ? COMMANDS.launchMcpHttp : COMMANDS.setupMcpIntegration,
      title: isStdio ? 'Switch to HTTP Mode' : 'Setup MCP Integration'
    }
  };
}

function profileNode(profile: string | undefined): McpToolsNode {
  return {
    label: 'Profile',
    description: profile ?? 'default',
    tooltip: 'Pick the kicad-mcp-pro tool profile for this workspace.',
    icon: 'settings',
    command: {
      command: COMMANDS.pickMcpProfile,
      title: 'Pick MCP Profile'
    }
  };
}

function serverNode(state: McpConnectionState): McpToolsNode {
  return {
    label: 'Server version',
    description: `${state.server?.version ?? 'unknown'} (${state.server?.compat ?? 'unknown'})`,
    tooltip: state.server?.capturedAt
      ? `Captured at ${state.server.capturedAt}`
      : 'Server metadata has not been captured yet.',
    icon: state.server?.compat === 'incompatible' ? 'warning' : 'verified'
  };
}

function capabilityNode(capabilities: McpCapabilityCard): McpToolsNode {
  const diagnostics = capabilities.diagnostics ?? [];
  const description = `${capabilities.tools.length} tools, ${capabilities.resources.length} resources, ${capabilities.prompts.length} prompts${
    diagnostics.length
      ? `, ${diagnostics.length} diagnostic${diagnostics.length === 1 ? '' : 's'}`
      : ''
  }`;
  const details = capabilities.serverInfo
    ? [
        capabilityDiagnosticsGroup(diagnostics),
        kicadRuntimeNode(capabilities.serverInfo),
        operationModesNode(capabilities.serverInfo)
      ]
    : diagnostics.length
      ? [capabilityDiagnosticsGroup(diagnostics)]
      : [];
  return {
    label: 'Capabilities',
    description,
    tooltip: diagnostics.length
      ? diagnostics.join('\n')
      : 'Server-advertised MCP capability counts.',
    icon: 'symbol-namespace',
    children: [
      ...details,
      capabilityGroup('Tools', capabilities.tools),
      capabilityGroup('Resources', capabilities.resources),
      capabilityGroup('Prompts', capabilities.prompts)
    ]
  };
}

function capabilityDiagnosticsGroup(values: string[]): McpToolsNode {
  return {
    label: 'Capability diagnostics',
    description: values.length ? `${values.length}` : 'none',
    tooltip: values.length ? values.join('\n') : 'No capability diagnostics.',
    icon: values.length ? 'warning' : 'pass',
    children: values.map((value) => ({
      label: value,
      icon: 'warning'
    }))
  };
}

function kicadRuntimeNode(
  serverInfo: NonNullable<McpCapabilityCard['serverInfo']>
): McpToolsNode {
  const cliStatus = serverInfo.kicad.cliFound
    ? (serverInfo.kicad.cliVersion ?? 'version unknown')
    : 'CLI unavailable';
  return {
    label: 'KiCad runtime',
    description: serverInfo.kicad.livePcbContext ? 'live PCB' : 'degraded',
    tooltip: [
      `CLI: ${cliStatus}`,
      `Path: ${serverInfo.kicad.cliPath}`,
      `IPC: ${serverInfo.kicad.ipcAvailable ? 'available' : 'unavailable'}`,
      `Live PCB: ${serverInfo.kicad.livePcbContext ? 'available' : 'unavailable'}`
    ].join('\n'),
    icon: serverInfo.kicad.livePcbContext ? 'circuit-board' : 'warning'
  };
}

function operationModesNode(
  serverInfo: NonNullable<McpCapabilityCard['serverInfo']>
): McpToolsNode {
  const modes = [
    capabilityFlag('File-backed DRC', serverInfo.capabilities.fileBackedDrc),
    capabilityFlag('File-backed ERC', serverInfo.capabilities.fileBackedErc),
    capabilityFlag(
      'File-backed exports',
      serverInfo.capabilities.fileBackedExports
    ),
    capabilityFlag('Live PCB read', serverInfo.capabilities.livePcbRead),
    capabilityFlag('Live PCB write', serverInfo.capabilities.livePcbWrite),
    capabilityFlag(
      'ChatGPT connector',
      serverInfo.capabilities.chatgptConnectorCompatible
    )
  ];
  return {
    label: 'Operation modes',
    description: `${modes.filter((mode) => mode.enabled).length}/${modes.length} available`,
    tooltip: modes
      .map(
        (mode) => `${mode.label}: ${mode.enabled ? 'available' : 'unavailable'}`
      )
      .join('\n'),
    icon: 'checklist',
    children: modes.map((mode) => ({
      label: mode.label,
      description: mode.enabled ? 'available' : 'unavailable',
      icon: mode.enabled ? 'pass' : 'circle-slash'
    }))
  };
}

function capabilityFlag(
  label: string,
  enabled: boolean
): { label: string; enabled: boolean } {
  return { label, enabled };
}

function capabilityGroup(label: string, values: string[]): McpToolsNode {
  return {
    label,
    description: values.length ? `${values.length}` : 'none',
    tooltip: values.length
      ? values.join('\n')
      : `No ${label.toLowerCase()} advertised.`,
    icon: values.length ? 'list-tree' : 'circle-slash',
    children: values.slice(0, 25).map((value) => ({
      label: value,
      icon: 'symbol-method'
    }))
  };
}

function installNode(install: McpInstallStatus | undefined): McpToolsNode {
  if (!install?.found) {
    return {
      label: 'Install',
      description: 'not found',
      icon: 'cloud-download',
      command: {
        command: COMMANDS.installMcp,
        title: 'Install kicad-mcp-pro'
      }
    };
  }
  return {
    label: 'Install',
    description: `${install.command ?? 'kicad-mcp-pro'}${install.version ? ` ${install.version}` : ''}`,
    tooltip: `Detected from ${install.source ?? 'unknown source'}.`,
    icon: 'check'
  };
}
