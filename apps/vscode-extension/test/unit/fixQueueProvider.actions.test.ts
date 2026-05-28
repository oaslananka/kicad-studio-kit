import * as vscode from 'vscode';
import { FixQueueProvider } from '../../src/mcp/fixQueueProvider';
import { McpStateStore } from '../../src/state/stateStores';
import type { FixItem } from '../../src/types';
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
      applyFixTool: jest.fn().mockResolvedValue(undefined),
      applyFixById: jest.fn().mockResolvedValue(undefined)
    };
    const provider = new FixQueueProvider(client as never);
    (window.showInformationMessage as jest.Mock).mockResolvedValue('Apply');
    await provider.refresh();

    await provider.applyFixById('fix-1');

    expect(workspace.openTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'diff' })
    );
    expect(client.applyFixTool).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fix-1' })
    );
  });

  it('renders file-backed queue suggestions as read-only and does not apply them', async () => {
    const client = {
      fetchFixQueue: jest.fn().mockResolvedValue([
        {
          id: 'file-backed-fix-1',
          description: 'Review clearance',
          severity: 'warning',
          tool: 'pcb_score_placement',
          args: {},
          status: 'pending',
          source: 'file-backed',
          disabledReason: 'Read-only suggestion from file-backed diagnostics.'
        }
      ]),
      applyFixTool: jest.fn()
    };
    const provider = new FixQueueProvider(client as never);
    await provider.refresh();

    const [item] = provider.getChildren() as FixItem[];
    const treeItem = provider.getTreeItem(item as never);
    await provider.applyFix(item!);

    expect(treeItem.command).toBeUndefined();
    expect(String(treeItem.description)).toContain('read-only');
    expect(client.applyFixTool).not.toHaveBeenCalled();
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Read-only suggestion from file-backed diagnostics.'
    );
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
      applyFixTool: jest
        .fn()
        .mockRejectedValueOnce(new Error('stop'))
        .mockResolvedValue({})
    };
    const provider = new FixQueueProvider(client as never);
    await provider.refresh();
    const [first, second] = provider.getChildren() as FixItem[];

    expect(provider.getTreeItem(first as never).iconPath).toEqual(
      expect.objectContaining({ id: 'error' })
    );
    expect(provider.getTreeItem(second as never).iconPath).toEqual(
      expect.objectContaining({ id: 'lightbulb' })
    );

    (window.showWarningMessage as jest.Mock).mockResolvedValue('Apply All');
    await provider.applyAll();

    expect(client.applyFixTool).toHaveBeenCalledTimes(1);
    expect(first?.status).toBe('failed');
  });

  it('refresh swallows stdio/fetch/ECONNREFUSED errors and renders recovery state', async () => {
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
    const [state] = provider.getChildren();
    expect(provider.getTreeItem(state as never)).toMatchObject({
      label: 'Fix Queue could not refresh',
      description: 'Retry MCP connection'
    });
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

  it('does not keep stale fixes when MCP cannot serve the queue', async () => {
    const mcpState = new McpStateStore();
    mcpState.update({
      kind: 'Incompatible',
      available: true,
      connected: false,
      message: 'Upgrade required.'
    });
    const client = {
      fetchFixQueue: jest.fn().mockResolvedValue([
        {
          id: 'fix-stale',
          description: 'Stale fix',
          severity: 'warning',
          tool: 'apply_fix',
          args: {},
          status: 'pending'
        }
      ])
    };
    const provider = new FixQueueProvider(client as never, mcpState);

    await provider.refresh();

    expect(client.fetchFixQueue).not.toHaveBeenCalled();
    const [state] = provider.getChildren();
    expect(provider.getTreeItem(state as never)).toMatchObject({
      label: 'Fix Queue unavailable',
      description: 'Use HTTP MCP transport'
    });
  });
});
