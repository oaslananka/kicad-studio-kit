import type {
  FixItem,
  McpConnectionState,
  McpInstallStatus,
  McpServerCard,
  McpToolCall,
  ProjectContext,
  QualityGateResult,
  StudioContext
} from '../types';
import type { McpClient } from './mcpClient';
import { mapMcpError, type McpMappedError } from './mcpErrorMapper';
import { mcpProjectArguments } from '../workspace/projectContext';

export interface McpConnectionAdapter {
  detectInstall(): Promise<McpInstallStatus>;
  getState(): McpConnectionState;
  getLastServerCard(): McpServerCard | undefined;
  testConnection(): Promise<McpConnectionState>;
  retryNow(): Promise<McpConnectionState>;
}

export interface ContextMcpAdapter {
  pushStudioContext(context: StudioContext): Promise<void>;
}

export interface ToolExecutionMcpAdapter {
  previewToolCall(toolCall: McpToolCall): Promise<string>;
  executeToolCall(
    toolCall: McpToolCall
  ): Promise<Record<string, unknown> | undefined>;
}

export interface ChatMcpAdapter extends ToolExecutionMcpAdapter {
  testConnection(): Promise<McpConnectionState>;
}

export interface QualityGateMcpAdapter {
  runProjectQualityGate(): Promise<QualityGateResult[]>;
  runPlacementQualityGate(): Promise<QualityGateResult>;
  runTransferQualityGate(): Promise<QualityGateResult>;
  runManufacturingQualityGate(): Promise<QualityGateResult>;
}

export interface ManufacturingMcpAdapter {
  runProjectQualityGate(): Promise<QualityGateResult[]>;
  exportManufacturingPackage(
    variant: string | undefined
  ): Promise<Record<string, unknown> | undefined>;
}

export interface FixQueueMcpAdapter extends ToolExecutionMcpAdapter {
  fetchFixQueue(): Promise<FixItem[]>;
  applyFixTool(item: FixItem): Promise<void>;
  applyFixById(id: string): Promise<void>;
}

export interface VariantMcpAdapter {
  testConnection(): Promise<McpConnectionState>;
  setActiveVariant(name: string): Promise<void>;
}

export interface DrcRuleUpdate {
  name: string;
  constraintType: string;
  minValue: string;
  maxValue?: string;
  condition?: string;
  severity: 'error' | 'warning';
}

export interface DrcRulesMcpAdapter {
  testConnection(): Promise<McpConnectionState>;
  upsertDrcRule(rule: DrcRuleUpdate): Promise<void>;
  deleteDrcRule(name: string): Promise<void>;
}

export interface DrcErcMcpAdapter {
  runDrc(
    args?: Record<string, unknown>
  ): Promise<Record<string, unknown> | undefined>;
  runErc(
    args?: Record<string, unknown>
  ): Promise<Record<string, unknown> | undefined>;
}

export interface DesignIntentMcpAdapter {
  getDesignIntent(): Promise<Record<string, unknown> | undefined>;
  setDesignIntent(intent: Record<string, unknown>): Promise<void>;
}

export interface BomNetlistMcpAdapter {
  exportBom(
    args?: Record<string, unknown>
  ): Promise<Record<string, unknown> | undefined>;
  exportNetlist(
    args?: Record<string, unknown>
  ): Promise<Record<string, unknown> | undefined>;
  exportSpiceNetlist(
    args?: Record<string, unknown>
  ): Promise<Record<string, unknown> | undefined>;
}

export interface StudioMcpAdapter
  extends
    McpConnectionAdapter,
    ContextMcpAdapter,
    QualityGateMcpAdapter,
    ManufacturingMcpAdapter,
    FixQueueMcpAdapter,
    ChatMcpAdapter,
    VariantMcpAdapter,
    DrcRulesMcpAdapter,
    DrcErcMcpAdapter,
    DesignIntentMcpAdapter,
    BomNetlistMcpAdapter {}

export type McpAdapterClient = Pick<
  McpClient,
  | 'callTool'
  | 'detectInstall'
  | 'exportManufacturingPackage'
  | 'fetchFixQueue'
  | 'getLastServerCard'
  | 'getState'
  | 'previewToolCall'
  | 'pushContext'
  | 'retryNow'
  | 'runManufacturingQualityGate'
  | 'runPlacementQualityGate'
  | 'runProjectQualityGate'
  | 'runTransferQualityGate'
  | 'testConnection'
>;

export class McpToolAdapter implements StudioMcpAdapter {
  constructor(
    private readonly client: McpAdapterClient,
    private readonly getActiveProject?: () => ProjectContext | undefined
  ) {}

  detectInstall(): Promise<McpInstallStatus> {
    return this.client.detectInstall();
  }

  getState(): McpConnectionState {
    return this.client.getState();
  }

  getLastServerCard(): McpServerCard | undefined {
    return this.client.getLastServerCard();
  }

  testConnection(): Promise<McpConnectionState> {
    return this.client.testConnection();
  }

  retryNow(): Promise<McpConnectionState> {
    return this.client.retryNow();
  }

  pushStudioContext(context: StudioContext): Promise<void> {
    return this.client.pushContext(context);
  }

  fetchFixQueue(): Promise<FixItem[]> {
    return this.client.fetchFixQueue(this.withProjectContext({}));
  }

  previewToolCall(toolCall: McpToolCall): Promise<string> {
    return this.client.previewToolCall(this.withToolCallProject(toolCall));
  }

  executeToolCall(
    toolCall: McpToolCall
  ): Promise<Record<string, unknown> | undefined> {
    const next = this.withToolCallProject(toolCall);
    return this.client.callTool(next.name, next.arguments);
  }

  async applyFixTool(item: FixItem): Promise<void> {
    await this.client.callTool(
      item.tool || 'apply_fix',
      this.withProjectContext(item.tool ? item.args : { id: item.id })
    );
  }

  async applyFixById(id: string): Promise<void> {
    await this.client.callTool('apply_fix', this.withProjectContext({ id }));
  }

  runProjectQualityGate(): Promise<QualityGateResult[]> {
    return this.client.runProjectQualityGate(this.withProjectContext({}));
  }

  runPlacementQualityGate(): Promise<QualityGateResult> {
    return this.client.runPlacementQualityGate(this.withProjectContext({}));
  }

  runTransferQualityGate(): Promise<QualityGateResult> {
    return this.client.runTransferQualityGate(this.withProjectContext({}));
  }

  runManufacturingQualityGate(): Promise<QualityGateResult> {
    return this.client.runManufacturingQualityGate(this.withProjectContext({}));
  }

  exportManufacturingPackage(
    variant: string | undefined
  ): Promise<Record<string, unknown> | undefined> {
    return this.client.exportManufacturingPackage(
      variant,
      this.withProjectContext({})
    );
  }

  async setActiveVariant(name: string): Promise<void> {
    await this.client.callTool(
      'variant_set_active',
      this.withProjectContext({ name })
    );
  }

  async upsertDrcRule(rule: DrcRuleUpdate): Promise<void> {
    // These file-backed MCP tools use the server's configured project and
    // exact upstream input schema, not the Studio workspace context object.
    await this.client.callTool('drc_rule_create', {
      name: rule.name,
      constraint_type: rule.constraintType,
      min_value: rule.minValue,
      ...(rule.maxValue ? { max_value: rule.maxValue } : {}),
      ...(rule.condition ? { condition: rule.condition } : {}),
      severity: rule.severity
    });
  }

  async deleteDrcRule(name: string): Promise<void> {
    await this.client.callTool('drc_rule_delete', { rule_name: name });
  }

  runDrc(
    args: Record<string, unknown> = {}
  ): Promise<Record<string, unknown> | undefined> {
    return this.client.callTool('run_drc', this.withProjectContext(args));
  }

  runErc(
    args: Record<string, unknown> = {}
  ): Promise<Record<string, unknown> | undefined> {
    return this.client.callTool('run_erc', this.withProjectContext(args));
  }

  getDesignIntent(): Promise<Record<string, unknown> | undefined> {
    return this.client.callTool(
      'project_get_design_intent',
      this.withProjectContext({})
    );
  }

  async setDesignIntent(intent: Record<string, unknown>): Promise<void> {
    await this.client.callTool(
      'project_set_design_intent',
      this.withProjectContext(intent)
    );
  }

  exportBom(
    args: Record<string, unknown> = {}
  ): Promise<Record<string, unknown> | undefined> {
    return this.client.callTool('export_bom', this.withProjectContext(args));
  }

  exportNetlist(
    args: Record<string, unknown> = {}
  ): Promise<Record<string, unknown> | undefined> {
    return this.client.callTool(
      'export_netlist',
      this.withProjectContext(args)
    );
  }

  exportSpiceNetlist(
    args: Record<string, unknown> = {}
  ): Promise<Record<string, unknown> | undefined> {
    return this.client.callTool(
      'export_spice_netlist',
      this.withProjectContext(args)
    );
  }

  mapError(error: unknown): McpMappedError {
    return mapMcpError(error);
  }

  private withToolCallProject(toolCall: McpToolCall): McpToolCall {
    return {
      ...toolCall,
      arguments: this.withProjectContext(toolCall.arguments)
    };
  }

  private withProjectContext(
    args: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      ...mcpProjectArguments(this.getActiveProject?.()),
      ...args
    };
  }
}
