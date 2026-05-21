import type {
  FixItem,
  McpConnectionState,
  McpInstallStatus,
  McpServerCard,
  McpToolCall,
  QualityGateResult,
  StudioContext
} from '../types';
import type { McpClient } from './mcpClient';
import { mapMcpError, type McpMappedError } from './mcpErrorMapper';

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
  condition: string;
  constraint: string;
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
  constructor(private readonly client: McpAdapterClient) {}

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
    return this.client.fetchFixQueue();
  }

  previewToolCall(toolCall: McpToolCall): Promise<string> {
    return this.client.previewToolCall(toolCall);
  }

  executeToolCall(
    toolCall: McpToolCall
  ): Promise<Record<string, unknown> | undefined> {
    return this.client.callTool(toolCall.name, toolCall.arguments);
  }

  async applyFixTool(item: FixItem): Promise<void> {
    await this.client.callTool(
      item.tool || 'apply_fix',
      item.tool ? item.args : { id: item.id }
    );
  }

  async applyFixById(id: string): Promise<void> {
    await this.client.callTool('apply_fix', { id });
  }

  runProjectQualityGate(): Promise<QualityGateResult[]> {
    return this.client.runProjectQualityGate();
  }

  runPlacementQualityGate(): Promise<QualityGateResult> {
    return this.client.runPlacementQualityGate();
  }

  runTransferQualityGate(): Promise<QualityGateResult> {
    return this.client.runTransferQualityGate();
  }

  runManufacturingQualityGate(): Promise<QualityGateResult> {
    return this.client.runManufacturingQualityGate();
  }

  exportManufacturingPackage(
    variant: string | undefined
  ): Promise<Record<string, unknown> | undefined> {
    return this.client.exportManufacturingPackage(variant);
  }

  async setActiveVariant(name: string): Promise<void> {
    await this.client.callTool('variant_set_active', { name });
  }

  async upsertDrcRule(rule: DrcRuleUpdate): Promise<void> {
    await this.client.callTool('drc_rule_upsert', { ...rule });
  }

  async deleteDrcRule(name: string): Promise<void> {
    await this.client.callTool('drc_rule_delete', { name });
  }

  runDrc(
    args: Record<string, unknown> = {}
  ): Promise<Record<string, unknown> | undefined> {
    return this.client.callTool('run_drc', args);
  }

  runErc(
    args: Record<string, unknown> = {}
  ): Promise<Record<string, unknown> | undefined> {
    return this.client.callTool('run_erc', args);
  }

  getDesignIntent(): Promise<Record<string, unknown> | undefined> {
    return this.client.callTool('project_get_design_intent', {});
  }

  async setDesignIntent(intent: Record<string, unknown>): Promise<void> {
    await this.client.callTool('project_set_design_intent', intent);
  }

  exportBom(
    args: Record<string, unknown> = {}
  ): Promise<Record<string, unknown> | undefined> {
    return this.client.callTool('export_bom', args);
  }

  exportNetlist(
    args: Record<string, unknown> = {}
  ): Promise<Record<string, unknown> | undefined> {
    return this.client.callTool('export_netlist', args);
  }

  exportSpiceNetlist(
    args: Record<string, unknown> = {}
  ): Promise<Record<string, unknown> | undefined> {
    return this.client.callTool('export_spice_netlist', args);
  }

  mapError(error: unknown): McpMappedError {
    return mapMcpError(error);
  }
}
