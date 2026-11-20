import * as fs from 'node:fs';
import * as path from 'node:path';
import { mapMcpError } from '../../src/mcp/mcpErrorMapper';
import { McpToolAdapter } from '../../src/mcp/mcpToolAdapter';
import type { FixItem, StudioContext } from '../../src/types';

describe('McpToolAdapter', () => {
  it('executes fix queue tools through a single adapter method', async () => {
    const client = {
      callTool: jest.fn().mockResolvedValue({})
    };
    const adapter = new McpToolAdapter(client as never);
    const item: FixItem = {
      id: 'fix-1',
      description: 'move track',
      severity: 'warning',
      tool: 'pcb_apply_fix',
      args: { id: 'fix-1' },
      status: 'pending'
    };

    await adapter.applyFixTool(item);
    await adapter.applyFixById('fallback-fix');

    expect(client.callTool).toHaveBeenNthCalledWith(1, 'pcb_apply_fix', {
      id: 'fix-1'
    });
    expect(client.callTool).toHaveBeenNthCalledWith(2, 'apply_fix', {
      id: 'fallback-fix'
    });
  });

  it('wraps connection state and context push workflows', async () => {
    const state = { kind: 'Connected', available: true, connected: true };
    const server = {
      version: '1.0.0',
      compat: 'ok',
      capturedAt: '2026-05-21T00:00:00.000Z',
      capabilities: { tools: [], resources: [], prompts: [] }
    };
    const client = {
      detectInstall: jest.fn().mockResolvedValue({ found: true }),
      getState: jest.fn().mockReturnValue(state),
      getLastServerCard: jest.fn().mockReturnValue(server),
      testConnection: jest.fn().mockResolvedValue(state),
      retryNow: jest.fn().mockResolvedValue(state),
      pushContext: jest.fn().mockResolvedValue(undefined)
    };
    const adapter = new McpToolAdapter(client as never);
    const context = {
      activeFile: undefined,
      fileType: 'pcb',
      drcErrors: []
    } satisfies StudioContext;

    await adapter.detectInstall();
    adapter.getState();
    adapter.getLastServerCard();
    await adapter.testConnection();
    await adapter.retryNow();
    await adapter.pushStudioContext(context);

    expect(client.detectInstall).toHaveBeenCalled();
    expect(client.getState).toHaveBeenCalled();
    expect(client.getLastServerCard).toHaveBeenCalled();
    expect(client.testConnection).toHaveBeenCalled();
    expect(client.retryNow).toHaveBeenCalled();
    expect(client.pushContext).toHaveBeenCalledWith(context);
  });

  it('delegates typed quality gate workflows without exposing raw tool names', async () => {
    const client = {
      runProjectQualityGate: jest.fn().mockResolvedValue([]),
      runPlacementQualityGate: jest.fn().mockResolvedValue({
        id: 'placement'
      }),
      runTransferQualityGate: jest.fn().mockResolvedValue({
        id: 'transfer'
      }),
      runManufacturingQualityGate: jest.fn().mockResolvedValue({
        id: 'manufacturing'
      })
    };
    const adapter = new McpToolAdapter(client as never);

    await adapter.runProjectQualityGate();
    await adapter.runPlacementQualityGate();
    await adapter.runTransferQualityGate();
    await adapter.runManufacturingQualityGate();

    expect(client.runProjectQualityGate).toHaveBeenCalled();
    expect(client.runPlacementQualityGate).toHaveBeenCalled();
    expect(client.runTransferQualityGate).toHaveBeenCalled();
    expect(client.runManufacturingQualityGate).toHaveBeenCalled();
  });

  it('sends the exact optional DRC bounds schema without Studio context metadata', async () => {
    const client = {
      callTool: jest.fn().mockResolvedValue({ text: 'created' })
    };
    const adapter = new McpToolAdapter(
      client as never,
      () =>
        ({
          id: 'test',
          name: 'Disposable project',
          rootPath: '/tmp/disposable',
          projectFile: '/tmp/disposable/test.kicad_pro'
        }) as never
    );

    await adapter.upsertDrcRule({
      name: 'QA_WIDTH',
      constraintType: 'track_width',
      minValue: '0.25mm',
      maxValue: '0.50mm',
      severity: 'warning'
    });

    expect(client.callTool).toHaveBeenCalledWith('drc_rule_create', {
      name: 'QA_WIDTH',
      constraint_type: 'track_width',
      min_value: '0.25mm',
      max_value: '0.50mm',
      severity: 'warning'
    });
  });

  it('exposes typed tool workflows for UI and commands', async () => {
    const client = {
      callTool: jest.fn().mockResolvedValue({ ok: true }),
      exportManufacturingPackage: jest.fn().mockResolvedValue({ ok: true }),
      previewToolCall: jest.fn().mockResolvedValue('preview')
    };
    const adapter = new McpToolAdapter(client as never);

    await adapter.previewToolCall({
      name: 'project_set_design_intent',
      arguments: { fabricationProfile: 'jlcpcb' }
    });
    await adapter.executeToolCall({
      name: 'project_set_design_intent',
      arguments: { fabricationProfile: 'jlcpcb' }
    });
    await adapter.setActiveVariant('Assembly-A');
    await adapter.upsertDrcRule({
      name: 'power_clearance',
      constraintType: 'clearance',
      minValue: '0.35mm',
      condition: "A.NetClass == 'POWER'",
      severity: 'error'
    });
    await adapter.deleteDrcRule('power_clearance');
    await adapter.runDrc({ save_report: true });
    await adapter.runErc({ save_report: true });
    await adapter.getDesignIntent();
    await adapter.setDesignIntent({ notes: 'Keep sensors clustered' });
    await adapter.exportBom({ variant: 'Assembly-A' });
    await adapter.exportNetlist({ format: 'kicad' });
    await adapter.exportSpiceNetlist({ output: 'sim.cir' });
    await adapter.exportManufacturingPackage('Assembly-A');

    expect(client.previewToolCall).toHaveBeenCalledWith({
      name: 'project_set_design_intent',
      arguments: { fabricationProfile: 'jlcpcb' }
    });
    expect(client.callTool).toHaveBeenCalledWith('variant_set_active', {
      name: 'Assembly-A'
    });
    expect(client.callTool).toHaveBeenCalledWith('drc_rule_create', {
      name: 'power_clearance',
      constraint_type: 'clearance',
      min_value: '0.35mm',
      condition: "A.NetClass == 'POWER'",
      severity: 'error'
    });
    expect(client.callTool).toHaveBeenCalledWith('drc_rule_delete', {
      rule_name: 'power_clearance'
    });
    expect(client.callTool).toHaveBeenCalledWith('run_drc', {
      save_report: true
    });
    expect(client.callTool).toHaveBeenCalledWith('run_erc', {
      save_report: true
    });
    expect(client.callTool).toHaveBeenCalledWith(
      'project_get_design_intent',
      {}
    );
    expect(client.callTool).toHaveBeenCalledWith('project_set_design_intent', {
      notes: 'Keep sensors clustered'
    });
    expect(client.callTool).toHaveBeenCalledWith('export_bom', {
      variant: 'Assembly-A'
    });
    expect(client.callTool).toHaveBeenCalledWith('export_netlist', {
      format: 'kicad'
    });
    expect(client.callTool).toHaveBeenCalledWith('export_spice_netlist', {
      output: 'sim.cir'
    });
    expect(client.exportManufacturingPackage).toHaveBeenCalledWith(
      'Assembly-A',
      {}
    );
  });

  it('adds active project context to every MCP tool call boundary', async () => {
    const project = {
      id: 'file:///workspace/alpha/alpha.kicad_pro',
      name: 'alpha',
      rootPath: '/workspace/alpha',
      projectFile: '/workspace/alpha/alpha.kicad_pro',
      workspaceFolder: '/workspace'
    };
    const client = {
      callTool: jest.fn().mockResolvedValue({ ok: true }),
      previewToolCall: jest.fn().mockResolvedValue('preview'),
      runProjectQualityGate: jest.fn().mockResolvedValue([]),
      exportManufacturingPackage: jest.fn().mockResolvedValue({ ok: true })
    };
    const adapter = new McpToolAdapter(client as never, () => project);

    await adapter.previewToolCall({
      name: 'inspect',
      arguments: { mode: 'readonly' }
    });
    await adapter.executeToolCall({
      name: 'route',
      arguments: { net: 'GND' }
    });
    await adapter.runDrc({ save_report: true });
    await adapter.runProjectQualityGate();
    await adapter.exportManufacturingPackage('Assembly-A');

    expect(client.previewToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        arguments: expect.objectContaining({
          mode: 'readonly',
          projectId: project.id,
          projectRoot: project.rootPath,
          projectFile: project.projectFile,
          project: expect.objectContaining({ name: 'alpha' })
        })
      })
    );
    expect(client.callTool).toHaveBeenCalledWith(
      'route',
      expect.objectContaining({
        net: 'GND',
        projectId: project.id,
        projectRoot: project.rootPath
      })
    );
    expect(client.callTool).toHaveBeenCalledWith(
      'run_drc',
      expect.objectContaining({
        save_report: true,
        projectId: project.id,
        projectRoot: project.rootPath
      })
    );
    expect(client.runProjectQualityGate).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: project.id })
    );
    expect(client.exportManufacturingPackage).toHaveBeenCalledWith(
      'Assembly-A',
      expect.objectContaining({ projectId: project.id })
    );
  });

  it('maps common transport and protocol errors into stable categories', () => {
    expect(
      mapMcpError(new Error('MCP request timed out after 5000ms.'))
    ).toEqual(expect.objectContaining({ kind: 'timeout', retryable: true }));
    expect(mapMcpError(new Error('stdio transport closed'))).toEqual(
      expect.objectContaining({ kind: 'stdio', retryable: true })
    );
    expect(mapMcpError(new Error('HTTP 400'))).toEqual(
      expect.objectContaining({ kind: 'bad-request', status: 400 })
    );
    expect(mapMcpError(new Error('HTTP 421'))).toEqual(
      expect.objectContaining({ kind: 'session', status: 421, retryable: true })
    );
    expect(mapMcpError(new Error('HTTP 500'))).toEqual(
      expect.objectContaining({ kind: 'server', status: 500, retryable: true })
    );
    expect(
      mapMcpError(
        Object.assign(new Error('Tool missing'), {
          code: 'tool_not_found',
          hint: 'Upgrade kicad-mcp-pro'
        })
      )
    ).toEqual(
      expect.objectContaining({
        kind: 'missing-tool',
        code: 'tool_not_found',
        hint: 'Upgrade kicad-mcp-pro'
      })
    );
    expect(mapMcpError(new Error('MCP server is incompatible.'))).toEqual(
      expect.objectContaining({ kind: 'incompatible', retryable: false })
    );
  });

  it('keeps raw tool execution inside the client and adapter boundary', () => {
    const allowed = new Set([
      path.normalize('mcp/mcpClient.ts'),
      path.normalize('mcp/mcpToolAdapter.ts')
    ]);
    const srcRoot = path.resolve(__dirname, '../../src');
    const offenders = collectTypescriptFiles(srcRoot)
      .flatMap((file) => {
        const relative = path.normalize(path.relative(srcRoot, file));
        if (allowed.has(relative)) {
          return [];
        }
        const text = fs.readFileSync(file, 'utf8');
        return text.includes('.callTool(') ? [relative] : [];
      })
      .sort();

    expect(offenders).toEqual([]);
  });
});

function collectTypescriptFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectTypescriptFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith('.ts') ? [fullPath] : [];
  });
}
