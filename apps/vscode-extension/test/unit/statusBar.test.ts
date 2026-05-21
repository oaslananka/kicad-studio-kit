// Integration-level tests for the KiCadStatusBar multi-item layout.
// These complement the more granular per-item tests in kicadStatusBar.test.ts
// by verifying cross-item state combinations and MCP compatibility edge cases.

import { KiCadStatusBar } from '../../src/statusbar/kicadStatusBar';
import { window } from './vscodeMock';

// Item indices in allItems(): kicad=0, drc=1, erc=2, sep1=3, ai=4, mcp=5, sep2=6, variant=7
const IDX = {
  kicad: 0,
  drc: 1,
  erc: 2,
  sep1: 3,
  ai: 4,
  mcp: 5,
  sep2: 6,
  variant: 7
};

function getItems() {
  const mock = window.createStatusBarItem as jest.Mock;
  return mock.mock.results.map(
    (r) =>
      r.value as {
        text: string;
        tooltip: string;
        backgroundColor?: unknown;
        show: jest.Mock;
        hide: jest.Mock;
      }
  );
}

describe('KiCadStatusBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates eight status bar items', () => {
    const bar = new KiCadStatusBar({} as never);
    expect((window.createStatusBarItem as jest.Mock).mock.calls).toHaveLength(
      8
    );
    bar.dispose();
  });

  it('shows warning on kicad item and hides inactive drc/erc by default', () => {
    const bar = new KiCadStatusBar({} as never);
    const items = getItems();
    expect(items[IDX.kicad]!.text).toContain('warning');
    expect(items[IDX.drc]!.hide).toHaveBeenCalled();
    expect(items[IDX.erc]!.hide).toHaveBeenCalled();
    expect(items[IDX.sep1]!.hide).toHaveBeenCalled();
    bar.dispose();
  });

  it('renders full state: cli + drc warning + erc error + ai unhealthy + mcp connected', () => {
    const bar = new KiCadStatusBar({} as never);
    bar.update({
      cli: {
        path: '/opt/kicad/kicad-cli',
        version: '10.0.1',
        versionLabel: 'KiCad 10.0.1',
        source: 'path'
      },
      drc: {
        file: 'board.kicad_pcb',
        errors: 0,
        warnings: 1,
        infos: 0,
        source: 'drc'
      },
      erc: {
        file: 'board.kicad_sch',
        errors: 2,
        warnings: 0,
        infos: 0,
        source: 'erc'
      },
      aiConfigured: true,
      aiHealthy: false,
      mcpState: { kind: 'Connected', available: true, connected: true }
    });
    const items = getItems();
    expect(items[IDX.kicad]!.text).toContain('10.0.1');
    expect(items[IDX.drc]!.text).toContain('warning');
    expect(items[IDX.drc]!.text).toContain('1');
    expect(items[IDX.erc]!.text).toContain('error');
    expect(items[IDX.erc]!.text).toContain('2');
    expect(items[IDX.ai]!.text).toContain('warning');
    expect(items[IDX.mcp]!.text).toContain('MCP');
    bar.dispose();
  });

  it('renders pass states for drc and erc', () => {
    const bar = new KiCadStatusBar({} as never);
    bar.update({
      drc: {
        file: 'board.kicad_pcb',
        errors: 0,
        warnings: 0,
        infos: 0,
        source: 'drc'
      },
      erc: {
        file: 'board.kicad_sch',
        errors: 0,
        warnings: 0,
        infos: 0,
        source: 'erc'
      },
      aiConfigured: true,
      aiHealthy: true
    });
    const items = getItems();
    expect(items[IDX.drc]!.text).toContain('pass');
    expect(items[IDX.erc]!.text).toContain('pass');
    expect(items[IDX.ai]!.text).not.toContain('warning');
    bar.dispose();
  });

  it('shows MCP incompatible state', () => {
    const bar = new KiCadStatusBar({} as never);
    bar.update({
      mcpState: {
        kind: 'Incompatible',
        available: true,
        connected: false,
        server: {
          version: '2.4.8',
          compat: 'incompatible',
          capturedAt: new Date().toISOString(),
          capabilities: { tools: [], resources: [], prompts: [] }
        }
      }
    });
    const items = getItems();
    expect(items[IDX.mcp]!.text).toContain('MCP');
    expect(items[IDX.mcp]!.text).toContain('!');
    expect(items[IDX.mcp]!.tooltip).toContain('incompatible');
    bar.dispose();
  });

  it('shows MCP degraded state when the protocol contract fails', () => {
    const bar = new KiCadStatusBar({} as never);
    bar.update({
      mcpState: {
        kind: 'Degraded',
        available: true,
        connected: false,
        message: 'MCP protocol contract failed: HTTP 421'
      }
    });
    const items = getItems();
    expect(items[IDX.mcp]!.text).toContain('warning');
    expect(items[IDX.mcp]!.tooltip).toContain('HTTP 421');
    expect(items[IDX.mcp]!.backgroundColor).toBeDefined();
    bar.dispose();
  });

  it('shows MCP warn compat state as connected with version in tooltip', () => {
    const bar = new KiCadStatusBar({} as never);
    bar.update({
      mcpState: {
        kind: 'Connected',
        available: true,
        connected: true,
        server: {
          version: '1.0.0',
          compat: 'warn',
          capturedAt: new Date().toISOString(),
          capabilities: { tools: [], resources: [], prompts: [] }
        }
      }
    });
    const items = getItems();
    expect(items[IDX.mcp]!.text).toContain('MCP');
    expect(items[IDX.mcp]!.tooltip).toContain('1.0.0');
    bar.dispose();
  });

  it('shows variant item when activeVariant is set', () => {
    const bar = new KiCadStatusBar({} as never);
    bar.update({ activeVariant: 'prototype' });
    const items = getItems();
    expect(items[IDX.variant]!.text).toContain('prototype');
    bar.dispose();
  });

  it('snapshot returns cli, drc, erc, ai, mcp state', () => {
    const bar = new KiCadStatusBar({} as never);
    bar.update({
      cli: {
        path: '/bin/kicad-cli',
        version: '10.0.0',
        versionLabel: 'KiCad 10.0.0',
        source: 'path'
      },
      drc: {
        file: 'board.kicad_pcb',
        errors: 1,
        warnings: 0,
        infos: 0,
        source: 'drc'
      },
      aiConfigured: true,
      aiHealthy: true,
      mcpState: { kind: 'Connected', available: true, connected: true }
    });
    const snap = bar.getSnapshot();
    expect(snap.cli?.version).toBe('10.0.0');
    expect(snap.drc?.errors).toBe(1);
    expect(snap.aiConfigured).toBe(true);
    expect(snap.mcpConnected).toBe(true);
    bar.dispose();
  });
});
