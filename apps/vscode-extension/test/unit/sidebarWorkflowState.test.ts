import * as vscode from 'vscode';
import {
  sidebarState,
  isSidebarWorkflowState,
  sidebarStateTreeItem,
  type SidebarWorkflowStateKind
} from '../../src/providers/sidebarWorkflowState';

jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});

describe('sidebarWorkflowState', () => {
  describe('sidebarState', () => {
    it('creates a sidebar state object with all fields', () => {
      const state = sidebarState(
        'empty',
        'No items',
        'Nothing to show',
        'Add something to get started',
        'inbox',
        {
          command: 'test.command',
          title: 'Test'
        }
      );

      expect(state).toEqual({
        kind: 'sidebar-state',
        state: 'empty',
        label: 'No items',
        description: 'Nothing to show',
        detail: 'Add something to get started',
        icon: 'inbox',
        command: { command: 'test.command', title: 'Test' }
      });
    });

    it('creates a state without a command', () => {
      const state = sidebarState(
        'loading',
        'Loading...',
        'Please wait',
        'Fetching data...',
        'sync'
      );

      expect(state.command).toBeUndefined();
    });

    it('accepts all valid state kinds', () => {
      const kinds: SidebarWorkflowStateKind[] = [
        'empty',
        'loading',
        'error',
        'ready',
        'populated'
      ];
      for (const kind of kinds) {
        const state = sidebarState(kind, kind, '', '', 'circle');
        expect(state.state).toBe(kind);
      }
    });
  });

  describe('isSidebarWorkflowState', () => {
    it('returns true for valid sidebar state objects', () => {
      expect(
        isSidebarWorkflowState(sidebarState('ready', '', '', '', ''))
      ).toBe(true);
    });

    it('returns false for non-object values', () => {
      expect(isSidebarWorkflowState(null)).toBe(false);
      expect(isSidebarWorkflowState(undefined)).toBe(false);
      expect(isSidebarWorkflowState('')).toBe(false);
      expect(isSidebarWorkflowState(42)).toBe(false);
    });

    it('returns false for objects without kind sidebar-state', () => {
      expect(isSidebarWorkflowState({ kind: 'other' })).toBe(false);
      expect(isSidebarWorkflowState({})).toBe(false);
    });
  });

  describe('sidebarStateTreeItem', () => {
    it('creates a TreeItem with correct properties', () => {
      const state = sidebarState(
        'error',
        'Error label',
        'Error description',
        'Detailed error info',
        'warning',
        {
          command: 'retry.command',
          title: 'Retry'
        }
      );

      const item = sidebarStateTreeItem(state);

      expect(item.label).toBe('Error label');
      expect(item.description).toBe('Error description');
      expect(item.tooltip).toBe('Error label\nDetailed error info');
      expect(item.contextValue).toBe('sidebar-state-error');
      expect(item.iconPath).toBeInstanceOf(vscode.ThemeIcon);
      expect((item.iconPath as vscode.ThemeIcon).id).toBe('warning');
      expect(item.command).toEqual({
        command: 'retry.command',
        title: 'Retry'
      });
    });

    it('creates a TreeItem without a command', () => {
      const state = sidebarState('loading', 'Loading', '', '', 'sync');
      const item = sidebarStateTreeItem(state);

      expect(item.command).toBeUndefined();
    });

    it('sets contextValue from state kind', () => {
      const kinds: [SidebarWorkflowStateKind, string][] = [
        ['empty', 'sidebar-state-empty'],
        ['loading', 'sidebar-state-loading'],
        ['populated', 'sidebar-state-populated']
      ];
      for (const [kind, expected] of kinds) {
        const item = sidebarStateTreeItem(sidebarState(kind, kind, '', '', ''));
        expect(item.contextValue).toBe(expected);
      }
    });
  });
});
