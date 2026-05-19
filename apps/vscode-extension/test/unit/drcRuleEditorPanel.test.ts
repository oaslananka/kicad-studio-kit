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

  it('calls MCP upsert and delete tools from webview messages', async () => {
    const panelMock = createPanelMock();
    (window.createWebviewPanel as jest.Mock).mockReturnValue(panelMock.panel);
    const mcpClient = {
      testConnection: jest.fn().mockResolvedValue({ connected: true }),
      callTool: jest.fn().mockResolvedValue({})
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
        condition: "A.NetClass == 'POWER'",
        constraint: 'clearance min 0.35mm'
      }
    });
    await panelMock.post({
      type: 'delete',
      payload: {
        name: 'power_clearance'
      }
    });

    expect(mcpClient.callTool).toHaveBeenCalledWith('drc_rule_upsert', {
      name: 'power_clearance',
      condition: "A.NetClass == 'POWER'",
      constraint: 'clearance min 0.35mm'
    });
    expect(mcpClient.callTool).toHaveBeenCalledWith('drc_rule_delete', {
      name: 'power_clearance'
    });
    expect(panelMock.panel.webview.html).toContain('KiCad DRC Rule Editor');
  });
});
