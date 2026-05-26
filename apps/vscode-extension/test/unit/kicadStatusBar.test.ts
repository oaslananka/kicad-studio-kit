import { KiCadStatusBar } from '../../src/statusbar/kicadStatusBar';
import type { DiagnosticSummary } from '../../src/types';
import { window } from './vscodeMock';

type ItemMock = {
  text: string;
  tooltip: string;
  backgroundColor?: unknown;
  color?: unknown;
  command?: unknown;
  show: jest.Mock;
  hide: jest.Mock;
  dispose: jest.Mock;
};

// Capture createStatusBarItem calls so we can inspect rendered text/tooltip.
const items: Record<string, ItemMock> = {};
let itemIndex = 0;

function resetStatusBarItemMock(): void {
  itemIndex = 0;
  Object.keys(items).forEach((key) => delete items[key]);
  (window.createStatusBarItem as jest.Mock).mockImplementation(() => {
    const key = String(itemIndex++);
    const item = {
      text: '',
      tooltip: '',
      backgroundColor: undefined as unknown,
      color: undefined,
      command: undefined as unknown,
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn()
    };
    items[key] = item;
    return item;
  });
}

function makeDrc(
  overrides: Partial<DiagnosticSummary> = {}
): DiagnosticSummary {
  return {
    file: 'board.kicad_pcb',
    errors: 0,
    warnings: 0,
    infos: 0,
    source: 'drc',
    ...overrides
  };
}

function makeErc(
  overrides: Partial<DiagnosticSummary> = {}
): DiagnosticSummary {
  return {
    file: 'demo.kicad_sch',
    errors: 0,
    warnings: 0,
    infos: 0,
    source: 'erc',
    ...overrides
  };
}

function makeBar(): KiCadStatusBar {
  resetStatusBarItemMock();
  return new KiCadStatusBar({} as never);
}

// Existing item helper preserves the pre-project indices used by these tests:
// kicad=0, drc=1, erc=2, sep1=3, ai=4, mcp=5, sep2=6, variant=7.
function item(index: number) {
  return Object.values(items)[index + 1]!;
}

function projectItem() {
  return Object.values(items)[0]!;
}

describe('KiCadStatusBar', () => {
  describe('Project item', () => {
    it('shows active project name and switch command', () => {
      const bar = makeBar();
      bar.update({ activeProjectName: 'alpha' });
      expect(projectItem().text).toContain('alpha');
      expect(projectItem().command).toBe('kicadstudio.selectActiveProject');
      bar.dispose();
    });
  });

  describe('KiCad CLI item (index 0)', () => {
    it('shows warning when kicad-cli not found', () => {
      const bar = makeBar();
      bar.update({ cli: undefined });
      expect(item(0).text).toContain('KiCad');
      expect(item(0).text).toContain('warning');
      bar.dispose();
    });

    it('shows version label when cli is detected', () => {
      const bar = makeBar();
      bar.update({
        cli: {
          path: '/usr/bin/kicad-cli',
          version: '10.0.3',
          versionLabel: 'KiCad 10.0.3',
          source: 'path'
        }
      });
      expect(item(0).text).toContain('10.0.3');
      bar.dispose();
    });

    it('warns when detected CLI reports an unparseable version', () => {
      const bar = makeBar();
      bar.update({
        cli: {
          path: '/usr/bin/kicad-cli',
          version: 'nightly',
          versionLabel: 'KiCad nightly',
          source: 'path'
        }
      });
      expect(item(0).tooltip).toContain('parseable KiCad major version');
      expect(item(0).backgroundColor).toBeDefined();
      bar.dispose();
    });

    it('shows circuit-board icon when cli is detected', () => {
      const bar = makeBar();
      bar.update({
        cli: {
          path: '/usr/bin/kicad-cli',
          version: '7.0.0',
          versionLabel: 'KiCad 7.0.0',
          source: 'path'
        }
      });
      expect(item(0).text).toContain('circuit-board');
      bar.dispose();
    });
  });

  describe('DRC item (index 1)', () => {
    it('hides DRC when it has not been run', () => {
      const bar = makeBar();
      bar.update({});
      expect(item(1).hide).toHaveBeenCalled();
      bar.dispose();
    });

    it('shows error count with error icon', () => {
      const bar = makeBar();
      bar.update({ drc: makeDrc({ errors: 5, warnings: 2 }) });
      expect(item(1).text).toContain('5');
      expect(item(1).text).toContain('error');
      expect(item(1).tooltip).toContain('board.kicad_pcb');
      bar.dispose();
    });

    it('shows warning count with warning icon when errors are zero', () => {
      const bar = makeBar();
      bar.update({ drc: makeDrc({ errors: 0, warnings: 3 }) });
      expect(item(1).text).toContain('3');
      expect(item(1).text).toContain('warning');
      bar.dispose();
    });

    it('shows pass icon when DRC has no issues', () => {
      const bar = makeBar();
      bar.update({ drc: makeDrc({ errors: 0, warnings: 0 }) });
      expect(item(1).text).toContain('pass');
      bar.dispose();
    });

    it('sets error background color on DRC errors', () => {
      const bar = makeBar();
      bar.update({ drc: makeDrc({ errors: 2, warnings: 0 }) });
      expect(item(1).backgroundColor).toBeDefined();
      bar.dispose();
    });

    it('clears background color when DRC passes', () => {
      const bar = makeBar();
      bar.update({ drc: makeDrc({ errors: 0, warnings: 0 }) });
      expect(item(1).backgroundColor).toBeUndefined();
      bar.dispose();
    });

    it('does not render stale DRC errors as current failures', () => {
      const bar = makeBar();
      const staleDrc = {
        ...makeDrc({ errors: 5, warnings: 2 }),
        freshness: 'stale',
        staleReason: 'Viewer reloaded after source file changed.'
      } as DiagnosticSummary;

      bar.update({ drc: staleDrc });

      expect(item(1).text).toContain('stale');
      expect(item(1).text).not.toContain('5');
      expect(item(1).backgroundColor).toBeUndefined();
      expect(item(1).tooltip).toContain('Viewer reloaded');
      bar.dispose();
    });
  });

  describe('ERC item (index 2)', () => {
    it('hides ERC when it has not been run', () => {
      const bar = makeBar();
      bar.update({});
      expect(item(2).hide).toHaveBeenCalled();
      bar.dispose();
    });

    it('shows warning count with warning icon', () => {
      const bar = makeBar();
      bar.update({ erc: makeErc({ errors: 0, warnings: 3 }) });
      expect(item(2).text).toContain('3');
      expect(item(2).text).toContain('warning');
      bar.dispose();
    });

    it('shows error count with error icon when ERC has errors', () => {
      const bar = makeBar();
      bar.update({ erc: makeErc({ errors: 2, warnings: 0 }) });
      expect(item(2).text).toContain('2');
      expect(item(2).text).toContain('error');
      expect(item(2).tooltip).toContain('demo.kicad_sch');
      bar.dispose();
    });

    it('shows pass icon when ERC passes', () => {
      const bar = makeBar();
      bar.update({ erc: makeErc({ errors: 0, warnings: 0 }) });
      expect(item(2).text).toContain('pass');
      bar.dispose();
    });
  });

  describe('AI item (index 4)', () => {
    it('shows AI not configured when aiConfigured is false', () => {
      const bar = makeBar();
      bar.update({ aiConfigured: false });
      expect(item(4).text).toContain('AI');
      bar.dispose();
    });

    it('shows warning icon when AI is configured but unhealthy', () => {
      const bar = makeBar();
      bar.update({ aiConfigured: true, aiHealthy: false });
      expect(item(4).text).toContain('warning');
      expect(item(4).text).toContain('AI');
      bar.dispose();
    });

    it('shows sparkle icon when AI is healthy', () => {
      const bar = makeBar();
      bar.update({ aiConfigured: true, aiHealthy: true });
      expect(item(4).text).toContain('sparkle');
      expect(item(4).text).toContain('AI');
      bar.dispose();
    });
  });

  describe('MCP item (index 5)', () => {
    it('shows MCP connected with profile', () => {
      const bar = makeBar();
      bar.update({
        mcpState: { kind: 'Connected', available: true, connected: true },
        mcpProfile: 'full'
      });
      expect(item(5).text).toContain('MCP');
      expect(item(5).text).toContain('full');
      bar.dispose();
    });

    it('shows MCP not detected when disconnected', () => {
      const bar = makeBar();
      bar.update({
        mcpState: { kind: 'Disconnected', available: false, connected: false }
      });
      expect(item(5).text).toContain('MCP');
      bar.dispose();
    });

    it('shows MCP incompatible warning', () => {
      const bar = makeBar();
      bar.update({
        mcpState: {
          kind: 'Incompatible',
          available: true,
          connected: false,
          server: {
            version: '1.2.3',
            compat: 'incompatible',
            capabilities: { tools: [], resources: [], prompts: [] },
            capturedAt: ''
          }
        }
      });
      expect(item(5).text).toContain('MCP');
      expect(item(5).text).toContain('!');
      bar.dispose();
    });

    it('shows MCP connected via VsCodeStdio', () => {
      const bar = makeBar();
      bar.update({
        mcpState: { kind: 'VsCodeStdio', available: true, connected: true }
      });
      expect(item(5).text).toContain('MCP');
      bar.dispose();
    });
  });

  describe('Variant item (index 7)', () => {
    it('hides variant item when no active variant', () => {
      const bar = makeBar();
      bar.update({});
      expect(item(7).hide).toHaveBeenCalled();
      bar.dispose();
    });

    it('shows variant text when activeVariant is set', () => {
      const bar = makeBar();
      bar.update({ activeVariant: 'production' });
      expect(item(7).text).toContain('production');
      expect(item(7).show).toHaveBeenCalled();
      bar.dispose();
    });
  });

  describe('getSnapshot', () => {
    it('returns current state after update', () => {
      const bar = makeBar();
      bar.update({ aiConfigured: true, aiHealthy: true });
      const snap = bar.getSnapshot();
      expect(snap.aiConfigured).toBe(true);
      expect(snap.aiHealthy).toBe(true);
      bar.dispose();
    });

    it('preserves previous fields when partial update is applied', () => {
      const bar = makeBar();
      bar.update({
        cli: {
          path: '/bin/kicad-cli',
          version: '10.0.0',
          versionLabel: 'KiCad 10.0.0',
          source: 'path'
        }
      });
      bar.update({ aiConfigured: true });
      const snap = bar.getSnapshot();
      expect(snap.cli?.version).toBe('10.0.0');
      expect(snap.aiConfigured).toBe(true);
      bar.dispose();
    });

    it('returns correct mcpKind in snapshot', () => {
      const bar = makeBar();
      bar.update({
        mcpState: { kind: 'VsCodeStdio', available: true, connected: true }
      });
      const snap = bar.getSnapshot();
      expect(snap.mcpKind).toBe('VsCodeStdio');
      bar.dispose();
    });
  });
});
