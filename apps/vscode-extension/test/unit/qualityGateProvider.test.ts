import { QualityGateProvider } from '../../src/providers/qualityGateProvider';
import { createExtensionContextMock, env, workspace } from './vscodeMock';

describe('QualityGateProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders pending gates by default', () => {
    const provider = new QualityGateProvider(
      createExtensionContextMock() as never,
      {} as never
    );

    const children = provider.getChildren();

    expect(children).toHaveLength(5);
    expect(provider.getTreeItem(children[0] as never).description).toContain(
      'PENDING'
    );
  });

  it('runs all gates, persists them, and exposes violation children', async () => {
    const context = createExtensionContextMock();
    const provider = new QualityGateProvider(
      context as never,
      {
        runProjectQualityGate: jest.fn().mockResolvedValue([
          {
            id: 'schematic',
            label: 'Schematic',
            status: 'PASS',
            summary: 'ERC clean',
            details: [],
            violations: []
          }
        ]),
        runPlacementQualityGate: jest.fn().mockResolvedValue({
          id: 'placement',
          label: 'Placement',
          status: 'WARN',
          summary: 'Review placement',
          details: ['WARN: advisory'],
          violations: [{ message: 'advisory' }]
        }),
        runTransferQualityGate: jest.fn().mockResolvedValue({
          id: 'transfer',
          label: 'PCB Transfer',
          status: 'FAIL',
          summary: '2 nets unmapped',
          details: ['FAIL: missing net'],
          violations: [{ message: 'missing net' }]
        }),
        runManufacturingQualityGate: jest.fn().mockResolvedValue({
          id: 'manufacturing',
          label: 'Manufacturing',
          status: 'BLOCKED',
          summary: 'Load profile',
          details: ['BLOCKED: profile'],
          violations: [{ message: 'profile' }]
        })
      } as never
    );

    await provider.runAll();
    const gates = provider.getChildren();
    const transfer = gates.find(
      (item) => item.kind === 'gate' && item.gate.id === 'transfer'
    );

    expect(context.workspaceState.update).toHaveBeenCalledWith(
      expect.stringContaining('kicadstudio.qualityGate.'),
      expect.any(Array)
    );
    expect(provider.getTreeItem(transfer as never).iconPath).toEqual(
      expect.objectContaining({ id: 'error' })
    );
    expect(provider.getTreeItem(transfer as never).command).toEqual(
      expect.objectContaining({ command: 'kicadstudio.qualityGate.runThis' })
    );
    expect(provider.getChildren(transfer as never)).toHaveLength(1);
  });

  it('shows raw output through a virtual document command', async () => {
    const provider = new QualityGateProvider(
      createExtensionContextMock() as never,
      {} as never
    );

    await provider.showRaw({
      id: 'schematic',
      label: 'Schematic',
      status: 'PASS',
      summary: 'ok',
      details: [],
      violations: [],
      raw: 'raw output'
    });

    expect(workspace.openTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'raw output' })
    );
  });

  it('renders violation children with navigation commands', async () => {
    const provider = new QualityGateProvider(
      createExtensionContextMock() as never,
      {
        runProjectQualityGate: jest.fn().mockResolvedValue([]),
        runPlacementQualityGate: jest.fn().mockResolvedValue({
          id: 'placement',
          label: 'Placement',
          status: 'FAIL',
          summary: 'bad',
          details: [],
          violations: [
            {
              message: 'at line',
              path: '/project/board.kicad_pcb',
              line: 12,
              hint: 'move it'
            }
          ]
        }),
        runTransferQualityGate: jest.fn().mockResolvedValue({
          id: 'transfer',
          label: 'PCB Transfer',
          status: 'PASS',
          summary: 'ok',
          details: [],
          violations: []
        }),
        runManufacturingQualityGate: jest.fn().mockResolvedValue({
          id: 'manufacturing',
          label: 'Manufacturing',
          status: 'PASS',
          summary: 'ok',
          details: [],
          violations: []
        })
      } as never
    );
    await provider.runAll();
    const placement = provider
      .getChildren()
      .find((item) => item.kind === 'gate' && item.gate.id === 'placement');
    const violation = provider.getChildren(placement as never)[0];

    const treeItem = provider.getTreeItem(violation as never);

    expect(treeItem.tooltip).toBe('move it');
    expect(treeItem.command).toEqual(
      expect.objectContaining({ command: 'vscode.open' })
    );
  });

  it('runs individual placement, transfer, manufacturing, and project gates', async () => {
    const client = {
      runProjectQualityGate: jest.fn().mockResolvedValue([
        {
          id: 'schematic',
          label: 'Schematic',
          status: 'PASS',
          summary: 'project',
          details: [],
          violations: []
        }
      ]),
      runPlacementQualityGate: jest.fn().mockResolvedValue({
        id: 'placement',
        label: 'Placement',
        status: 'PASS',
        summary: 'placement',
        details: [],
        violations: []
      }),
      runTransferQualityGate: jest.fn().mockResolvedValue({
        id: 'transfer',
        label: 'PCB Transfer',
        status: 'PASS',
        summary: 'transfer',
        details: [],
        violations: []
      }),
      runManufacturingQualityGate: jest.fn().mockResolvedValue({
        id: 'manufacturing',
        label: 'Manufacturing',
        status: 'PASS',
        summary: 'manufacturing',
        details: [],
        violations: []
      })
    };
    const provider = new QualityGateProvider(
      createExtensionContextMock() as never,
      client as never
    );

    await provider.runGate({
      id: 'placement',
      label: 'Placement',
      status: 'PENDING',
      summary: '',
      details: [],
      violations: []
    });
    await provider.runGate({
      id: 'transfer',
      label: 'PCB Transfer',
      status: 'PENDING',
      summary: '',
      details: [],
      violations: []
    });
    await provider.runGate({
      id: 'manufacturing',
      label: 'Manufacturing',
      status: 'PENDING',
      summary: '',
      details: [],
      violations: []
    });
    await provider.runGate({
      id: 'schematic',
      label: 'Schematic',
      status: 'PENDING',
      summary: '',
      details: [],
      violations: []
    });

    expect(client.runPlacementQualityGate).toHaveBeenCalled();
    expect(client.runTransferQualityGate).toHaveBeenCalled();
    expect(client.runManufacturingQualityGate).toHaveBeenCalled();
    expect(client.runProjectQualityGate).toHaveBeenCalled();
  });

  it('debounces DRC refreshes and opens documentation', async () => {
    jest.useFakeTimers();
    const client = {
      runPlacementQualityGate: jest.fn().mockResolvedValue({
        id: 'placement',
        label: 'Placement',
        status: 'PASS',
        summary: 'ok',
        details: [],
        violations: []
      }),
      runTransferQualityGate: jest.fn().mockResolvedValue({
        id: 'transfer',
        label: 'PCB Transfer',
        status: 'PASS',
        summary: 'ok',
        details: [],
        violations: []
      })
    };
    const provider = new QualityGateProvider(
      createExtensionContextMock() as never,
      client as never
    );

    provider.scheduleDrcRefresh();
    provider.scheduleDrcRefresh();
    jest.runOnlyPendingTimers();
    await Promise.resolve();
    await provider.openDocs();

    expect(client.runPlacementQualityGate).toHaveBeenCalledTimes(1);
    expect(env.openExternal).toHaveBeenCalled();
    jest.useRealTimers();
  });
});
