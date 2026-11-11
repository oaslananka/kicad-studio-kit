import * as fs from 'node:fs';
import * as path from 'node:path';

type Shortcut = {
  command: string;
  key: string;
  mac: string;
  when?: string;
};

describe('KiCad Studio keyboard shortcuts respect native VS Code', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')
  ) as {
    contributes: {
      keybindings: Shortcut[];
      commands: { command: string }[];
      menus: { commandPalette: { command: string; when?: string }[] };
    };
  };

  it('keeps all six custom shortcuts discoverable and scoped', () => {
    const expected: Record<string, string> = {
      'kicadstudio.runDRC': 'd',
      'kicadstudio.runERC': 'e',
      'kicadstudio.exportGerbers': 'g',
      'kicadstudio.searchLibrarySymbol': 's',
      'kicadstudio.searchLibraryFootprint': 'f',
      'kicadstudio.openSettings': ','
    };
    const entries = manifest.contributes.keybindings;
    expect(entries).toHaveLength(6);
    const allCommands = new Set(
      manifest.contributes.commands.map((entry) => entry.command)
    );
    const inPalette = new Set(
      manifest.contributes.menus.commandPalette.map((entry) => entry.command)
    );
    for (const entry of entries) {
      const suffix = expected[entry.command];
      expect(suffix).toBeDefined();
      expect(entry.key).toBe('ctrl+k ctrl+shift+' + suffix);
      expect(entry.mac).toBe('cmd+k cmd+shift+' + suffix);
      expect(allCommands.has(entry.command)).toBe(true);
      expect(inPalette.has(entry.command)).toBe(true);
    }
  });

  it('does not override VS Code Explorer, Debug, Source Control or Delete Line', () => {
    const windowsLinuxCore = new Set([
      'ctrl+shift+d', 'ctrl+shift+e', 'ctrl+shift+g', 'ctrl+shift+k'
    ]);
    const macCore = new Set([
      'cmd+shift+d', 'cmd+shift+e', 'cmd+shift+g', 'cmd+shift+k'
    ]);
    for (const shortcut of manifest.contributes.keybindings) {
      const windowsLinux = shortcut.key.toLowerCase();
      const mac = shortcut.mac.toLowerCase();
      expect(windowsLinuxCore.has(windowsLinux)).toBe(false);
      expect(macCore.has(mac)).toBe(false);
      expect(windowsLinux.startsWith('ctrl+shift+k ')).toBe(false);
      expect(mac.startsWith('cmd+shift+k ')).toBe(false);
    }
  });
});
