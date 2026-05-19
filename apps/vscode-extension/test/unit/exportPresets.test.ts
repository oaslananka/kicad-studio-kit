import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { ExportPresetStore } from '../../src/cli/exportPresets';
import { COMMANDS, EXPORT_PRESET_SETTING } from '../../src/constants';
import {
  __setConfiguration,
  createExtensionContextMock,
  workspace
} from './vscodeMock';

describe('ExportPresetStore', () => {
  let tempDir: string;
  const originalGetConfiguration = workspace.getConfiguration;

  beforeEach(() => {
    jest.clearAllMocks();
    __setConfiguration({});
    workspace.getConfiguration = originalGetConfiguration;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kicadstudio-presets-'));
    workspace.workspaceFolders = [{ uri: vscode.Uri.file(tempDir) }] as never;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('migrates legacy presets without schemaVersion on load', () => {
    __setConfiguration({
      [EXPORT_PRESET_SETTING]: [
        {
          name: 'Legacy Gerbers',
          commands: [COMMANDS.exportGerbers]
        }
      ]
    });
    const store = new ExportPresetStore(
      createExtensionContextMock() as unknown as vscode.ExtensionContext
    );

    expect(store.getAll()).toEqual([
      expect.objectContaining({
        schemaVersion: 2,
        name: 'Legacy Gerbers',
        commands: [COMMANDS.exportGerbers]
      })
    ]);
  });

  it('loads workspace presets from .vscode/kicad-export-presets.json after configured presets', () => {
    __setConfiguration({
      [EXPORT_PRESET_SETTING]: [
        {
          schemaVersion: 2,
          name: 'User Gerbers',
          commands: [COMMANDS.exportGerbers]
        }
      ]
    });
    const vscodeDir = path.join(tempDir, '.vscode');
    fs.mkdirSync(vscodeDir, { recursive: true });
    fs.writeFileSync(
      path.join(vscodeDir, 'kicad-export-presets.json'),
      JSON.stringify([
        {
          name: 'Workspace Pack',
          commands: [COMMANDS.exportGerbersWithDrill]
        }
      ]),
      'utf8'
    );
    const store = new ExportPresetStore(
      createExtensionContextMock() as unknown as vscode.ExtensionContext
    );

    expect(store.getAll().map((preset) => preset.name)).toEqual([
      'User Gerbers',
      'Workspace Pack'
    ]);
    expect(store.getByName('Workspace Pack')?.schemaVersion).toBe(2);
  });

  it('saves migrated presets and replaces entries with the same name', async () => {
    const update = jest.fn(async () => undefined);
    workspace.getConfiguration = jest.fn(() => ({
      get: <T>(key: string, fallback?: T): T => {
        const config: Record<string, unknown> = {
          [EXPORT_PRESET_SETTING]: [
            {
              schemaVersion: 1,
              name: 'Legacy Gerbers',
              commands: ['obsolete']
            }
          ]
        };
        return Object.prototype.hasOwnProperty.call(config, key)
          ? (config[key] as T)
          : (fallback as T);
      },
      inspect: jest.fn(),
      update
    })) as never;

    const store = new ExportPresetStore(
      createExtensionContextMock() as unknown as vscode.ExtensionContext
    );

    await store.save({
      name: 'Legacy Gerbers',
      commands: [COMMANDS.exportGerbers]
    });

    expect(update).toHaveBeenCalledWith(
      EXPORT_PRESET_SETTING,
      [
        {
          schemaVersion: 2,
          name: 'Legacy Gerbers',
          commands: [COMMANDS.exportGerbers]
        }
      ],
      vscode.ConfigurationTarget.Workspace
    );
  });

  it('imports presets from disk and remembers the last used preset name', async () => {
    const update = jest.fn(async () => undefined);
    workspace.getConfiguration = jest.fn(() => ({
      get: <T>(key: string, fallback?: T): T => {
        const config: Record<string, unknown> = {
          [EXPORT_PRESET_SETTING]: []
        };
        return Object.prototype.hasOwnProperty.call(config, key)
          ? (config[key] as T)
          : (fallback as T);
      },
      inspect: jest.fn(),
      update
    })) as never;

    const store = new ExportPresetStore(
      createExtensionContextMock() as unknown as vscode.ExtensionContext
    );
    const presetFile = path.join(tempDir, 'import.json');
    fs.writeFileSync(
      presetFile,
      JSON.stringify([
        {
          name: 'Imported ODB',
          commands: [COMMANDS.exportODB]
        }
      ]),
      'utf8'
    );

    await store.importFromFile(presetFile);
    await store.rememberLastUsed('Imported ODB');

    expect(update).toHaveBeenCalledWith(
      EXPORT_PRESET_SETTING,
      [
        {
          schemaVersion: 2,
          name: 'Imported ODB',
          commands: [COMMANDS.exportODB]
        }
      ],
      vscode.ConfigurationTarget.Workspace
    );
    expect(store.getLastUsedName()).toBe('Imported ODB');
  });

  it('exports configured presets to disk', async () => {
    __setConfiguration({
      [EXPORT_PRESET_SETTING]: [
        {
          name: 'Archive',
          commands: [COMMANDS.exportGerbers]
        }
      ]
    });
    const store = new ExportPresetStore(
      createExtensionContextMock() as unknown as vscode.ExtensionContext
    );
    const outputFile = path.join(tempDir, 'presets.json');

    await store.exportToFile(outputFile);

    expect(JSON.parse(fs.readFileSync(outputFile, 'utf8'))).toEqual([
      {
        schemaVersion: 2,
        name: 'Archive',
        commands: [COMMANDS.exportGerbers]
      }
    ]);
  });

  it('rejects invalid preset definitions before writing settings', async () => {
    const update = jest.fn(async () => undefined);
    workspace.getConfiguration = jest.fn(() => ({
      get: <T>(_key: string, fallback?: T): T => fallback as T,
      inspect: jest.fn(),
      update
    })) as never;
    const store = new ExportPresetStore(
      createExtensionContextMock() as unknown as vscode.ExtensionContext
    );

    await expect(store.save({ name: '   ', commands: [] })).rejects.toThrow(
      'Export preset name cannot be empty.'
    );
    await expect(
      store.save({ name: 'Invalid', commands: ['kicadstudio.unknown'] })
    ).rejects.toThrow('contains an unknown command');
    expect(update).not.toHaveBeenCalled();
  });
});
