import { KiCadStatusBar } from '../../src/statusbar/kicadStatusBar';
import { window } from './vscodeMock';

describe('KiCadStatusBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a missing CLI state by default', () => {
    const statusBar = new KiCadStatusBar({} as never);
    const [mainItem, mcpItem] = getStatusBarItems();

    expect(mainItem.text).toBe('$(warning) KiCad: Not found  DRC: —  ERC: —');
    expect(mainItem.tooltip).toContain('kicad-cli not found');
    expect(mcpItem.text).toBe('$(plug) MCP Setup');

    statusBar.dispose();
  });

  it('renders CLI, check summaries, AI health, and MCP connectivity', () => {
    const statusBar = new KiCadStatusBar({} as never);
    const [mainItem, mcpItem] = getStatusBarItems();

    statusBar.update({
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
      mcpAvailable: true,
      mcpConnected: true
    });

    expect(mainItem.text).toContain('KiCad 10.0.1');
    expect(mainItem.text).toContain('$(warning) DRC: 1');
    expect(mainItem.text).toContain('$(error) ERC: 2');
    expect(mainItem.text).toContain('$(warning) AI');
    expect(mainItem.tooltip).toContain('/opt/kicad/kicad-cli');
    expect(mcpItem.text).toBe('$(plug) MCP');
    expect(mcpItem.tooltip).toContain('Connected (recommended)');

    statusBar.dispose();
  });

  it('renders success states and the available-but-not-connected MCP branch', () => {
    const statusBar = new KiCadStatusBar({} as never);
    const [mainItem, mcpItem] = getStatusBarItems();

    statusBar.update({
      cli: {
        path: '/opt/kicad/kicad-cli',
        version: '10.0.1',
        versionLabel: 'KiCad 10.0.1',
        source: 'path'
      },
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
      aiHealthy: true,
      mcpAvailable: true,
      mcpConnected: false
    });

    expect(mainItem.text).toContain('$(pass) DRC');
    expect(mainItem.text).toContain('$(pass) ERC');
    expect(mainItem.text).toContain('$(pass-filled) AI');
    expect(mcpItem.text).toBe('$(plug) MCP Disconnected');
    expect(statusBar.getSnapshot().mcpAvailable).toBe(true);

    statusBar.dispose();
  });

  it('renders older recommended and incompatible MCP states', () => {
    const statusBar = new KiCadStatusBar({} as never);
    const [, mcpItem] = getStatusBarItems();

    statusBar.update({
      mcpState: {
        kind: 'Connected',
        available: true,
        connected: true,
        server: {
          version: '3.0.0',
          compat: 'warn',
          capturedAt: new Date().toISOString(),
          capabilities: { tools: [], resources: [], prompts: [] }
        }
      }
    });
    expect(mcpItem.tooltip).toContain('Connected (older than recommended)');

    statusBar.update({
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
    expect(mcpItem.text).toBe('$(warning) MCP Incompatible');
    expect(mcpItem.tooltip).toContain('Incompatible');

    statusBar.dispose();
  });
});

function getStatusBarItems(): [
  { text: string; tooltip: string },
  { text: string; tooltip: string }
] {
  const mock = window.createStatusBarItem as jest.Mock;
  const items = mock.mock.results.map(
    (result) => result.value as { text: string; tooltip: string }
  );
  const mainItem = items[0];
  const mcpItem = items[1];
  if (!mainItem || !mcpItem) {
    throw new Error(
      'Expected both main and MCP status bar items to be created.'
    );
  }
  return [mainItem, mcpItem];
}
