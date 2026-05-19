import * as vscode from 'vscode';
import { FixQueueProvider } from '../../src/mcp/fixQueueProvider';
import { window, workspace } from './vscodeMock';

describe('FixQueueProvider code-action support', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('filters fixes by uri and one-line tolerance', async () => {
    const provider = new FixQueueProvider({
      fetchFixQueue: jest.fn().mockResolvedValue([
        {
          id: 'fix-1',
          description: 'Fix line',
          severity: 'warning',
          tool: 'apply_fix',
          args: {},
          status: 'pending',
          path: 'C:/project/board.kicad_pcb',
          line: 10
        },
        {
          id: 'fix-2',
          description: 'No location',
          severity: 'info',
          tool: 'apply_fix',
          args: {},
          status: 'pending'
        }
      ])
    } as never);
    await provider.refresh();

    expect(
      provider.getFixesForUri(
        vscode.Uri.file('c:/project/board.kicad_pcb'),
        new vscode.Range(9, 0, 9, 1)
      )
    ).toHaveLength(1);
  });

  it('previews and applies a fix by id', async () => {
    const client = {
      fetchFixQueue: jest.fn().mockResolvedValue([
        {
          id: 'fix-1',
          description: 'Fix line',
          severity: 'warning',
          tool: 'apply_fix',
          args: { id: 'fix-1' },
          status: 'pending',
          preview: 'diff'
        }
      ]),
      previewToolCall: jest.fn(),
      callTool: jest.fn().mockResolvedValue({})
    };
    const provider = new FixQueueProvider(client as never);
    (window.showInformationMessage as jest.Mock).mockResolvedValue('Apply');
    await provider.refresh();

    await provider.applyFixById('fix-1');

    expect(workspace.openTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'diff' })
    );
    expect(client.callTool).toHaveBeenCalledWith('apply_fix', { id: 'fix-1' });
  });

  it('builds tree items for severities and stops bulk apply on failure', async () => {
    const client = {
      fetchFixQueue: jest.fn().mockResolvedValue([
        {
          id: 'fix-error',
          description: 'Error fix',
          severity: 'error',
          tool: 'tool_error',
          args: {},
          status: 'pending'
        },
        {
          id: 'fix-info',
          description: 'Info fix',
          severity: 'info',
          tool: 'tool_info',
          args: {},
          status: 'pending'
        }
      ]),
      previewToolCall: jest.fn().mockResolvedValue('preview'),
      callTool: jest
        .fn()
        .mockRejectedValueOnce(new Error('stop'))
        .mockResolvedValue({})
    };
    const provider = new FixQueueProvider(client as never);
    await provider.refresh();
    const [first, second] = provider.getChildren();

    expect(provider.getTreeItem(first as never).iconPath).toEqual(
      expect.objectContaining({ id: 'error' })
    );
    expect(provider.getTreeItem(second as never).iconPath).toEqual(
      expect.objectContaining({ id: 'lightbulb' })
    );

    (window.showWarningMessage as jest.Mock).mockResolvedValue('Apply All');
    await provider.applyAll();

    expect(client.callTool).toHaveBeenCalledTimes(1);
    expect(first?.status).toBe('failed');
  });

  it('refresh swallows stdio/fetch/ECONNREFUSED errors and leaves items empty', async () => {
    const client = {
      fetchFixQueue: jest
        .fn()
        .mockRejectedValueOnce(
          new Error('kicad-mcp-pro is connected via VS Code stdio')
        )
        .mockRejectedValueOnce(new Error('fetch failed'))
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
    };
    const provider = new FixQueueProvider(client as never);

    // All three should resolve without throwing.
    await expect(provider.refresh()).resolves.toBeUndefined();
    await expect(provider.refresh()).resolves.toBeUndefined();
    await expect(provider.refresh()).resolves.toBeUndefined();
    expect(provider.getChildren()).toHaveLength(0);
  });

  it('refresh re-throws errors unrelated to stdio/fetch', async () => {
    const client = {
      fetchFixQueue: jest
        .fn()
        .mockRejectedValue(new Error('unexpected server crash'))
    };
    const provider = new FixQueueProvider(client as never);
    await expect(provider.refresh()).rejects.toThrow('unexpected server crash');
  });
});
