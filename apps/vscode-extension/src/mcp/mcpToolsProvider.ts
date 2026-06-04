import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { COMMANDS, SETTINGS } from '../constants';
import type {
  McpCapabilityCard,
  McpConnectionState,
  McpInstallStatus,
  McpServerInfoContract
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
  collapsedByDefault?: boolean | undefined;
};

type DashboardStatus =
  | 'compatible'
  | 'degraded'
  | 'incompatible'
  | 'disconnected';

type CompatibilityDashboard = {
  status: DashboardStatus;
  stateLabel: string;
  serverName: string;
  serverVersion: string;
  endpoint: string;
  transportMode: string;
  profile: string;
  operatingMode: string;
  protocolVersion: string;
  toolSchemaVersion: string;
  compatibility: string;
  kicadCli: string;
  liveGui: string;
  livePcb: string;
  liveSchematic: string;
  toolCount: number | undefined;
  resourceCount: number | undefined;
  promptCount: number | undefined;
  missingRequiredTools: string[];
  missingOptionalCapabilities: string[];
  lastHealthCheck: string;
  lastError: string;
  remediation: string;
  diagnostics: string[];
  fileBackedReadAvailable: boolean;
  liveContextUnavailable: boolean;
};

const REQUIRED_EXTENSION_TOOLS = [
  'kicad_get_version',
  'run_drc',
  'run_erc',
  'project_get_design_intent',
  'export_bom',
  'export_netlist'
] as const;

const CLI_EXPORT_LABELS: Record<
  keyof McpServerInfoContract['capabilities']['cliExports'],
  string
> = {
  ipc2581: 'IPC-2581 export',
  odb: 'ODB++ export',
  svg: 'SVG export',
  dxf: 'DXF export',
  step: 'STEP export',
  stepz: 'STEPZ export',
  xao: 'XAO export',
  render: 'render export',
  spiceNetlist: 'SPICE netlist export'
};

export class McpToolsProvider implements vscode.TreeDataProvider<McpToolsNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    McpToolsNode | undefined
  >();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  broStatus: {
    installed: boolean;
    version?: string;
    healthy: boolean;
    message?: string;
    tools: string[];
  } = {
    installed: false,
    healthy: false,
    tools: []
  };
  private isCheckingBro = false;

  constructor(
    private readonly mcpAdapter: Pick<McpConnectionAdapter, 'getState'>,
    broStatusOverride?: Partial<McpToolsProvider['broStatus']>
  ) {
    if (broStatusOverride) {
      this.broStatus = { ...this.broStatus, ...broStatusOverride };
    } else {
      void this.checkBoardReadyOps();
    }
  }

  private async checkBoardReadyOps(): Promise<void> {
    if (this.isCheckingBro) {
      return;
    }
    if (!vscode.workspace.isTrusted) {
      this.broStatus = {
        installed: false,
        healthy: false,
        message: 'Workspace is not trusted.',
        tools: []
      };
      return;
    }

    this.isCheckingBro = true;
    const projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!projectPath) {
      this.broStatus = {
        installed: false,
        healthy: false,
        message: 'No workspace folder open.',
        tools: []
      };
      this.isCheckingBro = false;
      return;
    }

    const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

    // First, run npx boardreadyops doctor --format json to get installation, version, and health status
    const runDoctor = (): Promise<{ stdout: string; stderr: string }> => {
      return new Promise((resolve, reject) => {
        execFile(
          cmd,
          ['boardreadyops', 'doctor', '--format', 'json'],
          { cwd: projectPath, encoding: 'utf8', timeout: 5000 },
          (error, stdout, stderr) => {
            if (error) {
              reject(error);
            } else {
              resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
            }
          }
        );
      });
    };

    // Second, run npx boardreadyops schema findings to get list of rules
    const runSchema = (): Promise<{ stdout: string; stderr: string }> => {
      return new Promise((resolve, reject) => {
        execFile(
          cmd,
          ['boardreadyops', 'schema', 'findings'],
          { cwd: projectPath, encoding: 'utf8', timeout: 5000 },
          (error, stdout, stderr) => {
            if (error) {
              reject(error);
            } else {
              resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
            }
          }
        );
      });
    };

    try {
      const { stdout: docStdout } = await runDoctor();
      const doc = JSON.parse(docStdout.trim());
      const version = doc.tool?.version ?? 'unknown';

      let healthy = true;
      let message = 'BoardReadyOps is healthy.';
      if (Array.isArray(doc.checks)) {
        for (const check of doc.checks) {
          if (Array.isArray(check.items)) {
            for (const item of check.items) {
              if (item.severity === 'fail') {
                healthy = false;
                message =
                  item.message || 'BoardReadyOps environment check failed.';
                break;
              }
            }
          }
          if (!healthy) {
            break;
          }
        }
      }

      let tools: string[] = [];
      try {
        const { stdout: schemaStdout } = await runSchema();
        const schema = JSON.parse(schemaStdout.trim());
        const enumList = schema?.$defs?.ruleId?.oneOf?.[0]?.enum;
        if (Array.isArray(enumList)) {
          tools = enumList;
        }
      } catch {
        // Fallback list of static tools in case schema findings fails or is old
        tools = [
          'bom.missing-mpn',
          'bom.single-source',
          'bom.eol-detection',
          'bom.lifecycle',
          'bom.footprint-mismatch',
          'bom.dnp-consistency',
          'bom.variant-consistency',
          'design.copper-balance',
          'design.board-outline',
          'pinmap.verify',
          'pinmap.unmapped-pin',
          'pinmap.collision',
          'pinmap.net-label',
          'manufacturing.outputs-present',
          'manufacturing.jobset-outputs',
          'manufacturing.panel-sanity',
          'manufacturing.fab-notes',
          'manufacturing.drill-coverage',
          'manufacturing.layer-stackup',
          'release.revision-set',
          'release.changelog-present',
          'release.tag-matches-revision',
          'release.version-format'
        ];
      }

      this.broStatus = {
        installed: true,
        version,
        healthy,
        message,
        tools
      };
    } catch (err) {
      // CLI not found or errored out
      this.broStatus = {
        installed: false,
        healthy: false,
        message: err instanceof Error ? err.message : String(err),
        tools: []
      };
    } finally {
      this.isCheckingBro = false;
      this.onDidChangeTreeDataEmitter.fire(undefined);
    }
  }

  refresh(): void {
    void this.checkBoardReadyOps();
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  getTreeItem(element: McpToolsNode): vscode.TreeItem {
    let collapsibleState: vscode.TreeItemCollapsibleState;
    if (!element.children?.length) {
      collapsibleState = vscode.TreeItemCollapsibleState.None;
    } else if (element.collapsedByDefault) {
      collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    } else {
      collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
    }
    const item = new vscode.TreeItem(element.label, collapsibleState);
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
    if (element) {
      return element.children ?? [];
    }
    const nodes = buildMcpToolNodes(
      this.mcpAdapter.getState(),
      readConfiguredMcpProfile()
    );
    nodes.push(boardReadyOpsNode(this.broStatus));
    return nodes;
  }
}

function buildMcpToolNodes(
  state: McpConnectionState,
  profile: string | undefined
): McpToolsNode[] {
  const dashboard = buildCompatibilityDashboard(state, profile);
  const nodes: McpToolsNode[] = [
    stateNode(state, dashboard),
    compatibilityDashboardNode(dashboard),
    actionGroupNode(),
    installNode(state.install)
  ];

  if (state.server) {
    nodes.push(capabilityNode(state.server.capabilities));
  }

  return nodes;
}

function buildCompatibilityDashboard(
  state: McpConnectionState,
  profile: string | undefined
): CompatibilityDashboard {
  const server = state.server;
  const capabilities = server?.capabilities;
  const serverInfo = capabilities?.serverInfo;
  const diagnostics = [
    ...(capabilities?.diagnostics ?? []),
    ...(serverInfo?.diagnostics ?? [])
  ].filter((value, index, values) => values.indexOf(value) === index);
  const endpoint =
    serverInfo?.transport.endpoint ??
    vscode.workspace
      .getConfiguration()
      .get<string>(SETTINGS.mcpEndpoint, 'http://127.0.0.1:27185');
  const missingRequiredTools = server
    ? REQUIRED_EXTENSION_TOOLS.filter(
        (tool) => !server.capabilities.tools.includes(tool)
      )
    : [];
  const missingOptionalCapabilities = serverInfo
    ? missingOptionalCapabilitiesFor(state, serverInfo)
    : missingOptionalCapabilitiesWithoutServerInfo(state, Boolean(server));
  const status = dashboardStatus(
    state,
    missingRequiredTools,
    missingOptionalCapabilities,
    diagnostics
  );

  return {
    status,
    stateLabel: dashboardStateLabel(state, status, serverInfo),
    serverName: serverInfo?.server ?? 'kicad-mcp-pro',
    serverVersion: server?.version ?? serverInfo?.version ?? 'unknown',
    endpoint,
    transportMode: transportDescription(state, serverInfo),
    profile: profile ?? 'default',
    operatingMode: serverInfo?.operatingMode.active ?? 'unknown',
    protocolVersion: serverInfo?.mcpProtocolVersion ?? 'unknown',
    toolSchemaVersion: serverInfo?.toolSchemaVersion ?? 'unknown',
    compatibility: compatibilityDescription(state, status),
    kicadCli: kicadCliDescription(serverInfo),
    liveGui: availability(serverInfo?.kicad.ipcAvailable),
    livePcb: availability(serverInfo?.kicad.livePcbContext),
    liveSchematic: availability(serverInfo?.kicad.liveSchematicContext),
    toolCount: capabilities?.tools.length,
    resourceCount: capabilities?.resources.length,
    promptCount: capabilities?.prompts.length,
    missingRequiredTools,
    missingOptionalCapabilities,
    lastHealthCheck: server?.capturedAt ?? 'never',
    lastError: state.message ?? 'none',
    remediation: remediationHint(state, status),
    diagnostics,
    fileBackedReadAvailable: hasFileBackedRead(serverInfo),
    liveContextUnavailable: hasUnavailableLiveContext(serverInfo)
  };
}

function dashboardStatus(
  state: McpConnectionState,
  missingRequiredTools: string[],
  missingOptionalCapabilities: string[],
  diagnostics: string[]
): DashboardStatus {
  if (state.kind === 'Incompatible') {
    return 'incompatible';
  }
  if (
    !state.connected &&
    state.kind !== 'VsCodeStdio' &&
    state.kind !== 'Degraded'
  ) {
    return 'disconnected';
  }
  if (
    state.kind === 'Degraded' ||
    state.server?.compat === 'warn' ||
    missingRequiredTools.length > 0 ||
    missingOptionalCapabilities.length > 0 ||
    diagnostics.length > 0
  ) {
    return 'degraded';
  }
  return 'compatible';
}

function dashboardStateLabel(
  state: McpConnectionState,
  status: DashboardStatus,
  serverInfo: McpServerInfoContract | undefined
): string {
  if (state.kind === 'NotInstalled') {
    return 'No MCP installed';
  }
  if (state.kind === 'Connecting') {
    return 'Connecting';
  }
  if (state.kind === 'Incompatible') {
    return 'Connected but incompatible';
  }
  if (
    status === 'degraded' &&
    hasFileBackedRead(serverInfo) &&
    serverInfo?.kicad.ipcAvailable === false
  ) {
    return 'MCP connected; live KiCad IPC unavailable, file-backed read-only features active';
  }
  if (
    status === 'degraded' &&
    hasFileBackedRead(serverInfo) &&
    hasUnavailableLiveContext(serverInfo)
  ) {
    return 'MCP connected; live KiCad context unavailable, file-backed read-only features active';
  }
  if (state.kind === 'Degraded' || status === 'degraded') {
    return state.connected || state.kind === 'VsCodeStdio'
      ? 'Connected but degraded'
      : 'Installed but degraded';
  }
  if (state.connected || state.kind === 'VsCodeStdio') {
    return 'Connected and compatible';
  }
  if (isRemoteEndpointBlocked(state.message)) {
    return 'Remote endpoint blocked by settings';
  }
  if (isTimeout(state.message)) {
    return 'Timeout';
  }
  if (isAuthOrProtocolFailure(state.message)) {
    return 'Auth/protocol failure';
  }
  return state.available ? 'Installed but not running' : 'Disconnected';
}

function compatibilityDescription(
  state: McpConnectionState,
  status: DashboardStatus
): string {
  if (status === 'compatible') {
    return state.server?.compat ?? 'ok';
  }
  if (status === 'degraded') {
    return state.server?.compat === 'warn' ? 'warn' : 'degraded';
  }
  if (status === 'incompatible') {
    return 'incompatible';
  }
  return 'disconnected';
}

function compatibilityDashboardNode(
  dashboard: CompatibilityDashboard
): McpToolsNode {
  return {
    label: 'Compatibility dashboard',
    description: dashboard.status,
    tooltip: [
      `State: ${dashboard.stateLabel}`,
      `Server: ${dashboard.serverName} ${dashboard.serverVersion}`,
      `Transport: ${dashboard.transportMode}`,
      `Unavailable tools: ${dashboard.missingRequiredTools.length}`,
      `Unavailable capabilities: ${dashboard.missingOptionalCapabilities.length}`,
      `Last health check: ${dashboard.lastHealthCheck}`,
      `Remediation: ${dashboard.remediation}`
    ].join('\n'),
    icon: dashboardIcon(dashboard.status),
    collapsedByDefault: dashboard.status !== 'incompatible',
    children: [
      dashboardField(
        'Compatibility state',
        dashboard.stateLabel,
        dashboard.status,
        dashboardIcon(dashboard.status)
      ),
      dashboardGroup('Server contract', [
        dashboardField('Server', dashboard.serverName, dashboard.serverVersion),
        dashboardField('Endpoint', dashboard.endpoint),
        dashboardField('Transport mode', dashboard.transportMode),
        dashboardField('Profile', dashboard.profile),
        dashboardField('Operating mode', dashboard.operatingMode),
        dashboardField('Protocol version', dashboard.protocolVersion),
        dashboardField('Tool schema version', dashboard.toolSchemaVersion),
        dashboardField('Compatibility', dashboard.compatibility)
      ]),
      dashboardGroup('KiCad runtime', [
        dashboardField('KiCad CLI', dashboard.kicadCli),
        dashboardField('Live GUI availability', dashboard.liveGui),
        dashboardField('Live PCB context', dashboard.livePcb),
        dashboardField('Live schematic context', dashboard.liveSchematic)
      ]),
      dashboardGroup('Advertised surface', [
        dashboardField('Advertised tools', countText(dashboard.toolCount)),
        dashboardField(
          'Advertised resources',
          countText(dashboard.resourceCount)
        ),
        dashboardField('Advertised prompts', countText(dashboard.promptCount)),
        unavailableGroup(
          'Unavailable tools',
          dashboard.missingRequiredTools,
          'All required extension tools are advertised.',
          'Connect to a kicad-mcp-pro server that advertises this tool.'
        ),
        unavailableGroup(
          'Unavailable capabilities',
          dashboard.missingOptionalCapabilities,
          'All optional capabilities are available.',
          'Launch KiCad with the target project or upgrade kicad-mcp-pro.'
        )
      ]),
      dashboardGroup('Health and remediation', [
        dashboardField('Last health check', dashboard.lastHealthCheck),
        dashboardField('Last error', dashboard.lastError),
        dashboardField('Remediation hint', dashboard.remediation),
        diagnosticsGroup(dashboard.diagnostics)
      ])
    ]
  };
}

function stateNode(
  state: McpConnectionState,
  dashboard: CompatibilityDashboard
): McpToolsNode {
  if (dashboard.status === 'degraded') {
    const fileBackedDegraded =
      dashboard.fileBackedReadAvailable && dashboard.liveContextUnavailable;
    const degradedReason = dashboard.stateLabel.includes('context unavailable')
      ? 'live context unavailable'
      : 'live IPC unavailable';
    return {
      label: 'MCP Degraded',
      description: fileBackedDegraded
        ? '📄 file-backed'
        : dashboard.serverVersion,
      tooltip: [
        dashboard.stateLabel,
        fileBackedDegraded
          ? `${sentenceCase(degradedReason)}; file-backed read-only features active.`
          : dashboard.remediation
      ].join('\n'),
      icon: 'warning',
      command: {
        command: COMMANDS.retryMcp,
        title: 'Refresh MCP Capabilities'
      }
    };
  }
  if (state.kind === 'Incompatible') {
    return {
      label: 'MCP Incompatible',
      description: dashboard.serverVersion,
      tooltip:
        'The detected kicad-mcp-pro version is outside the extension compatibility range. Update kicad-mcp-pro to a compatible version.',
      icon: 'warning',
      command: {
        command: COMMANDS.openMcpUpgradeGuide,
        title: 'Open MCP Upgrade Guide'
      }
    };
  }
  if (state.connected || state.kind === 'VsCodeStdio') {
    return {
      label: 'MCP Connected',
      description: state.kind === 'VsCodeStdio' ? 'stdio' : 'HTTP',
      tooltip:
        state.kind === 'VsCodeStdio'
          ? 'Connected through .vscode/mcp.json. HTTP-only Quality Gates and Fix Queue are unavailable in this transport.'
          : 'Connected to the configured HTTP endpoint.',
      icon: 'plug'
    };
  }
  if (state.kind === 'NotInstalled') {
    return {
      label: 'MCP Not Installed',
      description: 'install required',
      icon: 'cloud-download',
      command: {
        command: COMMANDS.installMcp,
        title: 'Install kicad-mcp-pro'
      }
    };
  }
  return {
    label: 'MCP Disconnected',
    description: state.available ? 'detected' : 'not detected',
    tooltip: [
      dashboard.stateLabel,
      dashboard.lastError === 'none'
        ? dashboard.remediation
        : dashboard.lastError
    ].join('\n'),
    icon: state.available ? 'warning' : 'circle-slash',
    command: {
      command: state.available
        ? COMMANDS.retryMcp
        : COMMANDS.setupMcpIntegration,
      title: state.available ? 'Retry MCP Connection' : 'Setup MCP Integration'
    }
  };
}

function actionGroupNode(): McpToolsNode {
  return {
    label: 'Actions',
    description: 'MCP operations',
    tooltip:
      'Run common MCP setup, recovery, diagnostics, and profile actions.',
    icon: 'tools',
    children: [
      actionNode(
        'Reconnect',
        COMMANDS.retryMcp,
        'Reconnect MCP endpoint',
        'sync'
      ),
      actionNode(
        'Launch local MCP server',
        COMMANDS.launchMcpHttp,
        'Launch local kicad-mcp-pro HTTP server',
        'server-process'
      ),
      actionNode('Open MCP log', COMMANDS.openMcpLog, 'Open MCP log', 'output'),
      {
        label: 'More actions',
        description: '',
        tooltip: 'Additional MCP setup and diagnostic actions.',
        icon: 'ellipsis',
        collapsedByDefault: true,
        children: [
          actionNode(
            'Refresh capabilities',
            COMMANDS.retryMcp,
            'Refresh server-info and advertised tools',
            'refresh'
          ),
          actionNode(
            'Save diagnostic bundle',
            COMMANDS.saveMcpLog,
            'Save MCP diagnostic bundle',
            'save'
          ),
          actionNode(
            'Pick profile',
            COMMANDS.pickMcpProfile,
            'Pick MCP profile',
            'settings'
          ),
          actionNode(
            'Switch endpoint',
            COMMANDS.setupMcpIntegration,
            'Switch MCP endpoint or transport',
            'plug'
          ),
          actionNode(
            'Open compatibility docs',
            COMMANDS.openMcpUpgradeGuide,
            'Open MCP compatibility documentation',
            'book'
          )
        ]
      }
    ]
  };
}

function actionNode(
  label: string,
  command: string,
  title: string,
  icon: string
): McpToolsNode {
  return {
    label,
    tooltip: title,
    icon,
    command: {
      command,
      title
    }
  };
}

function dashboardGroup(label: string, children: McpToolsNode[]): McpToolsNode {
  return {
    label,
    description: `${children.length}`,
    tooltip: label,
    icon: 'list-tree',
    children
  };
}

function dashboardField(
  label: string,
  description: string,
  tooltip = description,
  icon = 'info'
): McpToolsNode {
  return {
    label,
    description,
    tooltip,
    icon
  };
}

function unavailableGroup(
  label: string,
  values: string[],
  emptyTooltip: string,
  perItemHint: string
): McpToolsNode {
  return {
    label,
    description: values.length ? `${values.length}` : '✓ none',
    tooltip: values.length ? values.join('\n') : emptyTooltip,
    icon: values.length ? 'info' : 'pass',
    collapsedByDefault: values.length === 0,
    children: values.map((value) => ({
      label: value,
      description: 'not connected',
      tooltip: `${value} — ${perItemHint}`,
      icon: 'info'
    }))
  };
}

function diagnosticsGroup(values: string[]): McpToolsNode {
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

function capabilityNode(capabilities: McpCapabilityCard): McpToolsNode {
  const diagnostics = capabilities.diagnostics ?? [];
  const description = `${capabilities.tools.length} tools, ${capabilities.resources.length} resources, ${capabilities.prompts.length} prompts${
    diagnostics.length
      ? `, ${diagnostics.length} diagnostic${diagnostics.length === 1 ? '' : 's'}`
      : ''
  }`;
  // Operation modes kept here since it shows granular per-mode flags not in dashboard.
  // KiCad runtime and diagnostics are already in the Compatibility Dashboard — avoid duplication.
  const details = capabilities.serverInfo
    ? [
        diagnosticsGroup(diagnostics),
        operationModesNode(capabilities.serverInfo)
      ]
    : diagnostics.length
      ? [diagnosticsGroup(diagnostics)]
      : [];
  return {
    label: 'Raw advertised capabilities',
    description,
    tooltip: diagnostics.length
      ? diagnostics.join('\n')
      : 'Server-advertised MCP capability counts.',
    icon: 'symbol-namespace',
    collapsedByDefault: true,
    children: [
      ...details,
      capabilityGroup('Tools', capabilities.tools),
      capabilityGroup('Resources', capabilities.resources),
      capabilityGroup('Prompts', capabilities.prompts)
    ]
  };
}

function operationModesNode(
  serverInfo: NonNullable<McpCapabilityCard['serverInfo']>
): McpToolsNode {
  const fileBackedRead = hasFileBackedRead(serverInfo);
  const modes = [
    capabilityFlag('File-backed DRC', serverInfo.capabilities.fileBackedDrc),
    capabilityFlag('File-backed ERC', serverInfo.capabilities.fileBackedErc),
    capabilityFlag(
      'File-backed exports',
      serverInfo.capabilities.fileBackedExports
    ),
    capabilityFlag(
      'Live PCB read',
      serverInfo.capabilities.livePcbRead,
      !serverInfo.capabilities.livePcbRead && fileBackedRead
        ? '✗ unavailable; 📄 file-backed read available'
        : undefined
    ),
    capabilityFlag('Live PCB write', serverInfo.capabilities.livePcbWrite),
    capabilityFlag(
      'Live schematic read',
      serverInfo.capabilities.liveSchematicRead
    ),
    capabilityFlag(
      'Live schematic write',
      serverInfo.capabilities.liveSchematicWrite
    ),
    capabilityFlag(
      'ChatGPT connector',
      serverInfo.capabilities.chatgptConnectorCompatible
    )
  ];
  return {
    label: 'Operation modes',
    description: serverInfo.operatingMode.active,
    tooltip: modes
      .map(
        (mode) =>
          `${mode.label}: ${mode.description ?? (mode.enabled ? '✓ available' : '✗ unavailable')}`
      )
      .join('\n'),
    icon: 'checklist',
    collapsedByDefault: true,
    children: [
      {
        label: 'Active operating mode',
        description: serverInfo.operatingMode.active,
        tooltip: `Default: ${serverInfo.operatingMode.default}`,
        icon: modeIcon(serverInfo.operatingMode.active)
      },
      ...modes.map((mode) => ({
        label: mode.label,
        description:
          mode.description ?? (mode.enabled ? '✓ available' : '✗ unavailable'),
        icon: mode.enabled ? 'pass' : 'circle-slash'
      }))
    ]
  };
}

function modeIcon(mode: string): string {
  if (mode === 'experimental') {
    return 'beaker';
  }
  if (mode === 'manufacturing') {
    return 'package';
  }
  if (mode === 'write') {
    return 'edit';
  }
  return 'shield';
}

function capabilityFlag(
  label: string,
  enabled: boolean,
  description?: string | undefined
): { label: string; enabled: boolean; description?: string | undefined } {
  return { label, enabled, description };
}

function hasFileBackedRead(
  serverInfo: McpServerInfoContract | undefined
): boolean {
  return Boolean(
    serverInfo?.capabilities.fileBackedDrc ||
    serverInfo?.capabilities.fileBackedErc ||
    serverInfo?.capabilities.fileBackedExports
  );
}

function hasUnavailableLiveContext(
  serverInfo: McpServerInfoContract | undefined
): boolean {
  if (!serverInfo) {
    return false;
  }
  return (
    !serverInfo.kicad?.ipcAvailable ||
    !serverInfo.kicad?.livePcbContext ||
    !serverInfo.kicad?.liveSchematicContext ||
    !serverInfo.capabilities?.livePcbRead ||
    !serverInfo.capabilities?.liveSchematicRead
  );
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

function missingOptionalCapabilitiesFor(
  state: McpConnectionState,
  serverInfo: McpServerInfoContract
): string[] {
  const missing: string[] = [];
  if (state.kind === 'VsCodeStdio') {
    missing.push('HTTP-only Quality Gates and Fix Queue');
  }
  if (!serverInfo.transport.streamableHttp) {
    missing.push('Streamable HTTP transport');
  }
  if (!serverInfo.transport.statelessHttp) {
    missing.push('stateless Streamable HTTP transport');
  }
  if (serverInfo.transport.legacySse) {
    missing.push('legacy SSE disabled by default');
  }
  if (!serverInfo.kicad.ipcAvailable) {
    missing.push('live GUI IPC');
  }
  if (!serverInfo.kicad.livePcbContext) {
    missing.push('live PCB context');
  }
  if (!serverInfo.kicad.liveSchematicContext) {
    missing.push('live schematic context');
  }
  if (!serverInfo.capabilities.chatgptConnectorCompatible) {
    missing.push('ChatGPT connector compatibility');
  }
  const unavailableEditingTools = Object.entries(
    serverInfo.capabilities.liveEditingTools
  )
    .filter(([, value]) => !value.available)
    .map(([name]) => name);
  if (unavailableEditingTools.length > 0) {
    missing.push(`${unavailableEditingTools.length} live editing tools`);
  }
  for (const [key, label] of Object.entries(CLI_EXPORT_LABELS) as Array<
    [keyof McpServerInfoContract['capabilities']['cliExports'], string]
  >) {
    if (!serverInfo.capabilities.cliExports[key]) {
      missing.push(label);
    }
  }
  return missing;
}

function missingOptionalCapabilitiesWithoutServerInfo(
  state: McpConnectionState,
  hasServerCard: boolean
): string[] {
  const missing: string[] = [];
  if (hasServerCard) {
    missing.push('server-info capability contract');
  }
  if (state.kind === 'VsCodeStdio') {
    missing.push(
      'HTTP-only Quality Gates and Fix Queue',
      'stateless Streamable HTTP transport',
      'ChatGPT connector compatibility'
    );
  }
  return missing;
}

function remediationHint(
  state: McpConnectionState,
  status: DashboardStatus
): string {
  if (state.kind === 'NotInstalled') {
    return 'Install kicad-mcp-pro, then rerun setup.';
  }
  if (isRemoteEndpointBlocked(state.message)) {
    return `Use a loopback endpoint or enable ${SETTINGS.mcpAllowRemoteEndpoint} intentionally.`;
  }
  if (isTimeout(state.message)) {
    return 'Retry the health check or increase the MCP timeout setting.';
  }
  if (isAuthOrProtocolFailure(state.message)) {
    return 'Check endpoint authentication, protocol version, and Streamable HTTP headers.';
  }
  if (status === 'incompatible') {
    return 'Install a kicad-mcp-pro version inside the supported compatibility range.';
  }
  if (status === 'degraded') {
    return 'Refresh capabilities, launch the local HTTP server, or open KiCad with the target project.';
  }
  if (status === 'disconnected') {
    return state.available
      ? 'Reconnect to the detected MCP server.'
      : 'Set up or launch kicad-mcp-pro.';
  }
  return 'No action required.';
}

function transportDescription(
  state: McpConnectionState,
  serverInfo: McpServerInfoContract | undefined
): string {
  if (state.kind === 'VsCodeStdio') {
    return 'VS Code stdio';
  }
  if (!serverInfo) {
    return 'HTTP endpoint not verified';
  }
  const statefulness = serverInfo.transport.statelessHttp
    ? 'stateless'
    : 'stateful';
  const legacy = serverInfo.transport.legacySse ? ', legacy SSE enabled' : '';
  return `${serverInfo.transport.type}, ${statefulness}${legacy}`;
}

function kicadCliDescription(
  serverInfo: McpServerInfoContract | undefined
): string {
  if (!serverInfo) {
    return 'unknown';
  }
  if (!serverInfo.kicad.cliFound) {
    return 'not found';
  }
  return serverInfo.kicad.cliVersion
    ? `${serverInfo.kicad.cliVersion} (${serverInfo.kicad.cliPath})`
    : serverInfo.kicad.cliPath;
}

function availability(value: boolean | undefined): string {
  if (value === undefined) {
    return 'unknown';
  }
  return value ? 'available' : 'unavailable';
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function countText(value: number | undefined): string {
  return value === undefined ? 'not checked' : `${value}`;
}

function dashboardIcon(status: DashboardStatus): string {
  if (status === 'compatible') {
    return 'pass';
  }
  if (status === 'degraded') {
    return 'warning';
  }
  if (status === 'incompatible') {
    return 'error';
  }
  return 'circle-slash';
}

function isRemoteEndpointBlocked(message: string | undefined): boolean {
  return /Refusing remote MCP endpoint/iu.test(message ?? '');
}

function isTimeout(message: string | undefined): boolean {
  return /timed out|timeout|AbortError/iu.test(message ?? '');
}

function isAuthOrProtocolFailure(message: string | undefined): boolean {
  return /auth|401|403|protocol|header|version/iu.test(message ?? '');
}

function isVersionDegraded(version: string): boolean {
  if (version === 'unknown') {
    return false;
  }
  const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return false;
  }
  const major = parseInt(match[1] ?? '0', 10);
  const minor = parseInt(match[2] ?? '0', 10);
  if (major < 1 || (major === 1 && minor < 2)) {
    return true;
  }
  return false;
}

function boardReadyOpsNode(status: {
  installed: boolean;
  version?: string;
  healthy: boolean;
  message?: string;
  tools: string[];
}): McpToolsNode {
  const enabled = vscode.workspace
    .getConfiguration()
    .get<boolean>(SETTINGS.boardReadyOpsEnabled, false);

  if (!status.installed) {
    return {
      label: 'BoardReadyOps',
      description: 'unavailable',
      tooltip:
        status.message ||
        'BoardReadyOps CLI was not found. Install it to enable PCB preflight checks.',
      icon: 'circle-slash',
      collapsedByDefault: true,
      children: [
        dashboardField('CLI', 'not found', undefined, 'warning'),
        actionNode(
          'Configure Checks',
          COMMANDS.boardReadyOpsConfigure,
          'Open BoardReadyOps extension settings',
          'gear'
        ),
        actionNode(
          'Open Documentation',
          COMMANDS.boardReadyOpsOpenDocs,
          'Open BoardReadyOps documentation',
          'book'
        )
      ]
    };
  }

  const isOld = isVersionDegraded(status.version ?? 'unknown');
  const healthy = status.healthy && !isOld;
  const statusLabel = healthy
    ? 'healthy'
    : isOld
      ? 'degraded (old version)'
      : 'degraded';
  const statusIcon = healthy ? 'pass' : 'warning';

  const toolNodes = status.tools.map((tool) => ({
    label: tool,
    description: healthy ? '✓ available' : 'degraded',
    tooltip: `${tool} — BoardReadyOps rule check`,
    icon: healthy ? 'symbol-method' : 'warning'
  }));

  const children: McpToolsNode[] = [
    dashboardField(
      'CLI',
      `boardreadyops v${status.version}`,
      undefined,
      'info'
    ),
    dashboardField(
      'Health',
      statusLabel,
      status.message ||
        (isOld
          ? 'Please upgrade BoardReadyOps to v1.2.0 or newer.'
          : undefined),
      statusIcon
    ),
    {
      label: 'Advertised tools',
      description: `${status.tools.length}`,
      tooltip: 'BoardReadyOps preflight rules.',
      icon: 'list-tree',
      collapsedByDefault: true,
      children: toolNodes
    },
    actionNode(
      'Check Board Readiness',
      COMMANDS.boardReadyOpsCheck,
      'Run BoardReadyOps preflight checks on the active board',
      'play'
    ),
    actionNode(
      'Show Readiness Report',
      COMMANDS.boardReadyOpsShowReport,
      'Show last BoardReadyOps run report',
      'report'
    ),
    actionNode(
      'Configure Checks',
      COMMANDS.boardReadyOpsConfigure,
      'Open BoardReadyOps extension settings',
      'gear'
    ),
    actionNode(
      'Open Documentation',
      COMMANDS.boardReadyOpsOpenDocs,
      'Open BoardReadyOps documentation',
      'book'
    )
  ];

  return {
    label: 'BoardReadyOps',
    description: enabled
      ? healthy
        ? `v${status.version}`
        : 'degraded'
      : 'disabled',
    tooltip: `BoardReadyOps preflight checks: ${healthy ? 'active' : 'degraded'}`,
    icon: healthy ? 'verified' : 'warning',
    collapsedByDefault: healthy,
    children
  };
}
