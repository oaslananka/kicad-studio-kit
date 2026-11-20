import * as vscode from 'vscode';
import { DrcRuleEditorPanel } from '../../src/drc/drcRuleEditorPanel';
import { window } from './vscodeMock';

function createPanelMock() {
  let handler: ((message: unknown) => Promise<void>) | undefined;
  const panel = {
    webview: {
      cspSource: 'vscode-resource:',
      html: '',
      onDidReceiveMessage: jest.fn(
        (callback: (message: unknown) => Promise<void>) => {
          handler = callback;
          return { dispose: jest.fn() };
        }
      )
    },
    onDidDispose: jest.fn(() => ({ dispose: jest.fn() })),
    reveal: jest.fn()
  };
  return {
    panel,
    post: async (message: unknown) => handler?.(message)
  };
}

describe('DrcRuleEditorPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (DrcRuleEditorPanel as any).currentPanel = undefined;
  });

  it('opens setup guidance when MCP is not connected', async () => {
    const mcpClient = {
      testConnection: jest.fn().mockResolvedValue({ connected: false })
    };

    await DrcRuleEditorPanel.createOrShow(
      {
        extensionUri: vscode.Uri.file('/extension')
      } as vscode.ExtensionContext,
      mcpClient as never
    );

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'DRC rule editing requires a connected kicad-mcp-pro server.',
      'Setup MCP'
    );
  });

  it('reports MCP connection test and setup command failures', async () => {
    const failingClient = {
      testConnection: jest.fn().mockRejectedValue(new Error('probe failed'))
    };

    await expect(
      DrcRuleEditorPanel.createOrShow(
        {
          extensionUri: vscode.Uri.file('/extension')
        } as vscode.ExtensionContext,
        failingClient as never
      )
    ).resolves.toBeUndefined();

    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'Unable to check MCP connection for DRC rule editing: probe failed'
    );

    const disconnectedClient = {
      testConnection: jest.fn().mockResolvedValue({ connected: false })
    };
    (window.showWarningMessage as jest.Mock).mockResolvedValue('Setup MCP');
    (vscode.commands.executeCommand as jest.Mock).mockRejectedValue(
      new Error('setup failed')
    );

    await DrcRuleEditorPanel.createOrShow(
      {
        extensionUri: vscode.Uri.file('/extension')
      } as vscode.ExtensionContext,
      disconnectedClient as never
    );

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'kicadstudio.setupMcpIntegration'
    );
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'Unable to open MCP setup: setup failed'
    );
  });

  it('calls MCP upsert and delete tools from webview messages', async () => {
    const panelMock = createPanelMock();
    (window.createWebviewPanel as jest.Mock).mockReturnValue(panelMock.panel);
    const mcpClient = {
      testConnection: jest.fn().mockResolvedValue({ connected: true }),
      upsertDrcRule: jest.fn().mockResolvedValue(undefined),
      deleteDrcRule: jest.fn().mockResolvedValue(undefined)
    };

    await DrcRuleEditorPanel.createOrShow(
      {
        extensionUri: vscode.Uri.file('/extension')
      } as vscode.ExtensionContext,
      mcpClient as never
    );
    await panelMock.post({
      type: 'upsert',
      payload: {
        name: 'power_clearance',
        constraintType: 'clearance',
        minValue: '0.35mm',
        condition: "A.NetClass == 'POWER'",
        severity: 'error'
      }
    });
    (window.showWarningMessage as jest.Mock).mockResolvedValueOnce(
      'Delete rule'
    );
    await panelMock.post({
      type: 'delete',
      payload: {
        name: 'power_clearance'
      }
    });

    expect(mcpClient.upsertDrcRule).toHaveBeenCalledWith({
      name: 'power_clearance',
      constraintType: 'clearance',
      minValue: '0.35mm',
      condition: "A.NetClass == 'POWER'",
      severity: 'error'
    });
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'DRC rule "power_clearance" saved to the connected MCP project.'
    );
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Delete DRC rule "power_clearance" from the connected MCP project?',
      { modal: true },
      'Delete rule'
    );
    expect(mcpClient.deleteDrcRule).toHaveBeenCalledWith('power_clearance');
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'DRC rule "power_clearance" deleted from the connected MCP project.'
    );
    expect(panelMock.panel.webview.html).toContain('KiCad DRC Rule Editor');
    expect(panelMock.panel.webview.html).toContain('id="constraint-type"');
    expect(panelMock.panel.webview.html).toContain('id="min-value"');
    expect(panelMock.panel.webview.html).toContain('id="max-value"');
  });

  it('rejects malformed DRC bounds and unsupported constraint types', async () => {
    const panelMock = createPanelMock();
    (window.createWebviewPanel as jest.Mock).mockReturnValue(panelMock.panel);
    const mcpClient = {
      testConnection: jest.fn().mockResolvedValue({ connected: true }),
      upsertDrcRule: jest.fn()
    };
    await DrcRuleEditorPanel.createOrShow(
      {
        extensionUri: vscode.Uri.file('/extension')
      } as vscode.ExtensionContext,
      mcpClient as never
    );

    for (const payload of [
      {
        name: 'A',
        constraintType: 'clearance',
        minValue: 'nope',
        severity: 'error'
      },
      {
        name: 'A',
        constraintType: 'unknown',
        minValue: '0.2mm',
        severity: 'error'
      },
      {
        name: 'A',
        constraintType: 'clearance',
        minValue: '0.2mm',
        maxValue: 'oops',
        severity: 'warning'
      },
      {
        name: 'A',
        constraintType: 'track_width',
        minValue: '0.2mm',
        severity: 'fatal'
      }
    ]) {
      await panelMock.post({ type: 'upsert', payload });
    }

    expect(mcpClient.upsertDrcRule).not.toHaveBeenCalled();
    expect(window.showErrorMessage).toHaveBeenCalledTimes(4);
  });

  it('does not delete a rule when the confirmation is cancelled', async () => {
    const panelMock = createPanelMock();
    (window.createWebviewPanel as jest.Mock).mockReturnValue(panelMock.panel);
    const mcpClient = {
      testConnection: jest.fn().mockResolvedValue({ connected: true }),
      deleteDrcRule: jest.fn()
    };
    await DrcRuleEditorPanel.createOrShow(
      {
        extensionUri: vscode.Uri.file('/extension')
      } as vscode.ExtensionContext,
      mcpClient as never
    );
    (window.showWarningMessage as jest.Mock).mockResolvedValueOnce(undefined);

    await panelMock.post({ type: 'delete', payload: { name: 'QA_RULE' } });

    expect(mcpClient.deleteDrcRule).not.toHaveBeenCalled();
  });

  it('reports DRC rule edit failures from webview messages', async () => {
    const panelMock = createPanelMock();
    (window.createWebviewPanel as jest.Mock).mockReturnValue(panelMock.panel);
    const mcpClient = {
      testConnection: jest.fn().mockResolvedValue({ connected: true }),
      upsertDrcRule: jest.fn().mockRejectedValue(new Error('upsert failed')),
      deleteDrcRule: jest.fn().mockRejectedValue(new Error('delete failed'))
    };

    await DrcRuleEditorPanel.createOrShow(
      {
        extensionUri: vscode.Uri.file('/extension')
      } as vscode.ExtensionContext,
      mcpClient as never
    );

    await expect(
      panelMock.post({
        type: 'upsert',
        payload: {
          name: 'power_clearance',
          constraintType: 'clearance',
          minValue: '0.35mm',
          condition: "A.NetClass == 'POWER'",
          severity: 'error'
        }
      })
    ).resolves.toBeUndefined();
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'Unable to save DRC rule power_clearance: upsert failed'
    );

    (window.showWarningMessage as jest.Mock).mockResolvedValueOnce(
      'Delete rule'
    );
    await expect(
      panelMock.post({
        type: 'delete',
        payload: {
          name: 'power_clearance'
        }
      })
    ).resolves.toBeUndefined();
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'Unable to delete DRC rule power_clearance: delete failed'
    );
  });
});
