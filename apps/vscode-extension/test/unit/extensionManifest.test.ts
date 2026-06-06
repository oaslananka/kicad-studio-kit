import * as fs from 'node:fs';
import * as path from 'node:path';
import { COMMANDS } from '../../src/constants';

describe('extensionManifest', () => {
  const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    name: string;
    publisher: string;
    version: string;
    engines: { vscode: string };
    contributes?: {
      commands?: Array<{ command: string; title: string }>;
      views?: Record<string, unknown[]>;
      viewsContainers?: Record<string, unknown[]>;
      customEditors?: Array<{ viewType: string }>;
      viewsWelcome?: unknown[];
    };
    activationEvents?: string[];
  };

  it('has correct identity', () => {
    expect(packageJson.name).toBe('kicadstudiokit');
    expect(packageJson.publisher).toBe('oaslananka');
  });

  it('has a valid semver version', () => {
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('targets VS Code >= 1.100.0', () => {
    const vsCodeEngine = packageJson.engines.vscode;
    expect(vsCodeEngine).toMatch(/^\^1\.100\.0$/);
  });

  it('contributes exported command IDs in package.json', () => {
    const contributedSet = new Set(
      (packageJson.contributes?.commands ?? []).map((c) => c.command)
    );
    // The COMMANDS const also carries setting keys, view IDs, and context
    // keys.  We only verify entries whose ID matches a flat two-segment
    // command pattern (`kicadstudio.<action>`) — these are the actual
    // registered commands.  Multi-segment IDs (kicadstudio.ai.*, etc.)
    // are settings/views/context keys, not contributed commands.
    const runtimeOnly: string[] = [];
    for (const commandId of Object.values(COMMANDS)) {
      if (
        typeof commandId === 'string' &&
        /^kicadstudio\.[a-z][a-zA-Z]+$/.test(commandId)
      ) {
        if (!contributedSet.has(commandId)) {
          runtimeOnly.push(commandId);
        }
      }
    }
    // Runtime-only commands are registered programmatically in extension.ts
    const expectedRuntimeOnly = new Set([
      'kicadstudio.showStatusMenu',
      'kicadstudio.selectActiveProject',
      'kicadstudio.exportTo',
      'kicadstudio.importFrom',
      'kicadstudio.importAuto',
      'kicadstudio.exportViewerSnapshot'
    ]);
    const unexpected = runtimeOnly.filter((id) => !expectedRuntimeOnly.has(id));
    expect(unexpected).toEqual([]);
  });

  it('registers sidebar views', () => {
    const sidebarViews =
      packageJson.contributes?.views?.['kicadstudio-sidebar'] ?? [];
    expect(sidebarViews.length).toBeGreaterThanOrEqual(6);
  });

  it('registers an activitybar viewsContainer', () => {
    const containers =
      packageJson.contributes?.viewsContainers?.['activitybar'] ?? [];
    expect(containers.length).toBeGreaterThanOrEqual(1);
  });

  it('registers custom editors', () => {
    const editors = packageJson.contributes?.customEditors ?? [];
    const viewTypes = editors.map((e) => e.viewType);
    expect(viewTypes).toContain('kicadstudio.schematicViewer');
    expect(viewTypes).toContain('kicadstudio.pcbViewer');
  });

  it('declares workspace-triggered activation events', () => {
    const events = packageJson.activationEvents ?? [];
    expect(events.length).toBeGreaterThan(0);
    // Activation is file-type driven, not startup-triggered
    expect(events).toContain('workspaceContains:**/*.kicad_pro');
    expect(events).toContain('workspaceContains:**/*.kicad_sch');
    expect(events).toContain('workspaceContains:**/*.kicad_pcb');
  });
});
