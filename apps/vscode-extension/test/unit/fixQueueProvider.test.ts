import * as vscode from 'vscode';
import { FixQueueProvider } from '../../src/mcp/fixQueueProvider';
import { McpStateStore } from '../../src/state/stateStores';
import type { FixItem } from '../../src/types';
import { window, __setConfiguration, ThemeIcon } from './vscodeMock';

jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});

describe('FixQueueProvider', () => {
  let adapter: any;

  beforeEach(() => {
    jest.clearAllMocks();
    __setConfiguration({});
    adapter = {
      fetchFixQueue: jest.fn().mockResolvedValue([]),
      previewToolCall: jest.fn(),
      applyFixTool: jest.fn(),
      applyFixById: jest.fn()
    };
  });

  function makeItem(overrides: Partial<FixItem> = {}): FixItem {
    return {
      id: 'fix-1',
      description: 'Test fix',
      severity: 'warning',
      tool: 'apply_fix',
      args: { file: '/path' },
      status: 'pending',
      ...overrides
    } as FixItem;
  }

  describe('constructor and initial state', () => {
    it('creates an empty provider', () => {
      const provider = new FixQueueProvider(adapter);
      expect(provider.getChildren()).toHaveLength(1);
      const [node] = provider.getChildren();
      const item = provider.getTreeItem(node as never);
      expect(item.label).toBe('No pending AI fixes');
    });
  });

  describe('getTreeItem', () => {
    it('returns a sidebar state tree item for workflow state nodes', () => {
      const provider = new FixQueueProvider(adapter);
      const [node] = provider.getChildren();
      const item = provider.getTreeItem(node as never);
      expect(item.contextValue).toBe('sidebar-state-empty');
    });

    it('returns FixQueueTreeItem with correct severity icon and contextValue', () => {
      const provider = new FixQueueProvider(adapter);
      Object.defineProperty(provider as any, 'items', {
        value: [
          makeItem({ id: 'e1', severity: 'error' }),
          makeItem({ id: 'w1', severity: 'warning' }),
          makeItem({ id: 'i1', severity: 'info' })
        ],
        writable: true
      });

      const [error, warning, info] = provider.getChildren() as FixItem[];
      expect(provider.getTreeItem(error as never).iconPath).toBeInstanceOf(
        ThemeIcon
      );
      expect(
        (provider.getTreeItem(error as never).iconPath as ThemeIcon).id
      ).toBe('error');
      expect(
        (provider.getTreeItem(warning as never).iconPath as ThemeIcon).id
      ).toBe('warning');
      expect(
        (provider.getTreeItem(info as never).iconPath as ThemeIcon).id
      ).toBe('lightbulb');
    });

    it('marks disabled items as read-only with no command', () => {
      const provider = new FixQueueProvider(adapter);
      Object.defineProperty(provider as any, 'items', {
        value: [
          makeItem({
            disabledReason: 'Read-only from file-backed diagnostics.'
          })
        ],
        writable: true
      });

      const [item] = provider.getChildren() as FixItem[];
      const treeItem = provider.getTreeItem(item as never);
      expect(treeItem.contextValue).toBe('fix-warning-disabled');
      expect(treeItem.command).toBeUndefined();
    });
  });

  describe('refresh', () => {
    it('fetches fixes from the adapter on refresh', async () => {
      adapter.fetchFixQueue.mockResolvedValue([makeItem()]);
      const provider = new FixQueueProvider(adapter);

      await provider.refresh();

      const nodes = provider.getChildren() as FixItem[];
      expect(nodes[0]!.id).toBe('fix-1');
    });

    it('clears items when MCP state is incompatible', async () => {
      const mcpState = new McpStateStore();
      mcpState.update({
        kind: 'Incompatible',
        available: true,
        connected: false,
        message: 'Upgrade required.'
      });
      adapter.fetchFixQueue.mockResolvedValue([makeItem()]);
      const provider = new FixQueueProvider(adapter, mcpState);

      await provider.refresh();

      expect(adapter.fetchFixQueue).not.toHaveBeenCalled();
      const [node] = provider.getChildren();
      const item = provider.getTreeItem(node as never);
      expect(item.label).toBe('Fix Queue unavailable');
    });

    it('renders degraded state when MCP is degraded', async () => {
      const mcpState = new McpStateStore();
      mcpState.update({
        kind: 'Degraded',
        available: true,
        connected: true,
        message: 'Server unreachable'
      });
      const provider = new FixQueueProvider(adapter, mcpState);

      await provider.refresh();

      const [node] = provider.getChildren();
      const item = provider.getTreeItem(node as never);
      expect(item.contextValue).toBe('sidebar-state-error');
    });
  });

  describe('getFixesForUri', () => {
    it('filters fixes by matching path', () => {
      const provider = new FixQueueProvider(adapter);
      Object.defineProperty(provider as any, 'items', {
        value: [
          makeItem({ id: 'f1', path: 'C:/project/board.kicad_pcb', line: 10 }),
          makeItem({ id: 'f2', path: 'C:/other/file.kicad_sch', line: 20 })
        ],
        writable: true
      });

      const result = provider.getFixesForUri(
        vscode.Uri.file('c:/project/board.kicad_pcb'),
        new vscode.Range(9, 0, 11, 0)
      );

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('f1');
    });

    it('returns empty when no fixes match', () => {
      const provider = new FixQueueProvider(adapter);
      Object.defineProperty(provider as any, 'items', {
        value: [makeItem({ path: '/other/file.kicad_pcb', line: 10 })],
        writable: true
      });

      expect(
        provider.getFixesForUri(vscode.Uri.file('/project/board.kicad_pcb'))
      ).toHaveLength(0);
    });

    it('skips items without path or line', () => {
      const provider = new FixQueueProvider(adapter);
      Object.defineProperty(provider as any, 'items', {
        value: [
          makeItem({
            id: 'f1',
            path: undefined as any,
            line: undefined as any
          }),
          makeItem({ id: 'f2', path: '/path', line: undefined as any })
        ],
        writable: true
      });

      expect(provider.getFixesForUri(vscode.Uri.file('/path'))).toHaveLength(0);
    });
  });

  describe('applyFixById', () => {
    it('applies a fix found in the local list', async () => {
      const provider = new FixQueueProvider(adapter);
      Object.defineProperty(provider as any, 'items', {
        value: [makeItem({ status: 'done' })],
        writable: true
      });
      (window.showInformationMessage as jest.Mock).mockResolvedValue('Apply');

      await provider.applyFixById('fix-1');

      expect(adapter.applyFixTool).toHaveBeenCalled();
    });

    it('delegates to adapter and refresh when id is not found locally', async () => {
      adapter.fetchFixQueue.mockResolvedValue([]);
      const provider = new FixQueueProvider(adapter);

      await provider.applyFixById('unknown-id');

      expect(adapter.applyFixById).toHaveBeenCalledWith('unknown-id');
      expect(adapter.fetchFixQueue).toHaveBeenCalled();
    });
  });

  describe('applyAll', () => {
    it('does nothing when no pending items exist', async () => {
      const provider = new FixQueueProvider(adapter);
      await provider.applyAll();
      expect(adapter.applyFixTool).not.toHaveBeenCalled();
    });

    it('applies all pending items and stops on failure', async () => {
      adapter.fetchFixQueue.mockResolvedValue([
        makeItem({ id: 'f1' }),
        makeItem({ id: 'f2', status: 'pending' })
      ]);
      adapter.applyFixTool
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce(undefined);
      const provider = new FixQueueProvider(adapter);
      await provider.refresh();
      (window.showWarningMessage as jest.Mock).mockResolvedValue('Apply All');

      await provider.applyAll();

      expect(adapter.applyFixTool).toHaveBeenCalledTimes(1);
    });
  });
});
