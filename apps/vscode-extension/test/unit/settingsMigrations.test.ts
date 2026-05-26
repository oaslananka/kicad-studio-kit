import * as vscode from 'vscode';
import {
  createNoopSettingsMigration,
  createRenameSettingMigration,
  createReplaceSettingValueMigration,
  CURRENT_SETTINGS_SCHEMA_VERSION,
  DEFAULT_SETTINGS_MIGRATIONS,
  runSettingsMigrations,
  SETTINGS_SCHEMA_VERSION_KEY,
  type SettingMigration
} from '../../src/settings/settingsMigrations';
import { SETTINGS } from '../../src/constants';
import { createExtensionContextMock, window } from './vscodeMock';

function createLoggerMock() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
}

describe('settings migrations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs pending migrations in order and stores each successful schema version', async () => {
    const context = createExtensionContextMock();
    const logger = createLoggerMock();
    const applied: number[] = [];
    const migrations: SettingMigration[] = [
      {
        schemaVersion: 1,
        id: 'first',
        describe: () => 'first migration',
        apply: jest.fn(async () => {
          applied.push(1);
        })
      },
      {
        schemaVersion: 2,
        id: 'second',
        describe: () => 'second migration',
        apply: jest.fn(async () => {
          applied.push(2);
        })
      }
    ];

    const result = await runSettingsMigrations(
      context as never,
      logger,
      migrations
    );

    expect(applied).toEqual([1, 2]);
    expect(context.globalState.update).toHaveBeenNthCalledWith(
      1,
      SETTINGS_SCHEMA_VERSION_KEY,
      1
    );
    expect(context.globalState.update).toHaveBeenNthCalledWith(
      2,
      SETTINGS_SCHEMA_VERSION_KEY,
      2
    );
    expect(context.globalState.get(SETTINGS_SCHEMA_VERSION_KEY)).toBe(2);
    expect(result).toEqual(
      expect.objectContaining({
        fromVersion: 0,
        toVersion: 2,
        appliedVersions: [1, 2],
        failedMigration: undefined
      })
    );
  });

  it('skips already-applied migrations without mutating global state', async () => {
    const context = createExtensionContextMock();
    await context.globalState.update(SETTINGS_SCHEMA_VERSION_KEY, 2);
    (context.globalState.update as jest.Mock).mockClear();
    const logger = createLoggerMock();
    const apply = jest.fn();

    const result = await runSettingsMigrations(context as never, logger, [
      createNoopSettingsMigration(1),
      {
        schemaVersion: 2,
        id: 'already-applied',
        describe: () => 'already applied',
        apply
      }
    ]);

    expect(apply).not.toHaveBeenCalled();
    expect(context.globalState.update).not.toHaveBeenCalled();
    expect(result.appliedVersions).toEqual([]);
    expect(result.fromVersion).toBe(2);
    expect(result.toVersion).toBe(2);
  });

  it('does not advance past a failing migration', async () => {
    const context = createExtensionContextMock();
    const logger = createLoggerMock();
    const failure = new Error('migration failed');

    const result = await runSettingsMigrations(context as never, logger, [
      createNoopSettingsMigration(1),
      {
        schemaVersion: 2,
        id: 'failing',
        describe: () => 'failing migration',
        apply: jest.fn(async () => {
          throw failure;
        })
      },
      {
        schemaVersion: 3,
        id: 'never-runs',
        describe: () => 'never runs',
        apply: jest.fn()
      }
    ]);

    expect(context.globalState.update).toHaveBeenCalledTimes(1);
    expect(context.globalState.update).toHaveBeenCalledWith(
      SETTINGS_SCHEMA_VERSION_KEY,
      1
    );
    expect(context.globalState.get(SETTINGS_SCHEMA_VERSION_KEY)).toBe(1);
    expect(result.failedMigration).toEqual(
      expect.objectContaining({
        schemaVersion: 2,
        id: 'failing',
        error: failure
      })
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Settings migration v2 failed'),
      failure
    );
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('KiCad Studio settings migration failed')
    );
  });

  it('renames configuration values per scope without overwriting existing targets', async () => {
    const context = createExtensionContextMock();
    const logger = createLoggerMock();
    const updates: Array<[string, unknown, vscode.ConfigurationTarget]> = [];
    const config = {
      inspect: jest.fn((key: string) => {
        if (key === 'kicadstudio.sample.old') {
          return {
            globalValue: 'global-old',
            workspaceValue: 'workspace-old',
            workspaceFolderValue: 'folder-old'
          };
        }
        if (key === 'kicadstudio.sample.new') {
          return {
            workspaceValue: 'workspace-new'
          };
        }
        return undefined;
      }),
      update: jest.fn(
        async (
          key: string,
          value: unknown,
          target: vscode.ConfigurationTarget
        ) => {
          updates.push([key, value, target]);
        }
      )
    };

    const result = await runSettingsMigrations(
      context as never,
      logger,
      [
        createRenameSettingMigration({
          schemaVersion: 1,
          from: 'kicadstudio.sample.old',
          to: 'kicadstudio.sample.new',
          description: 'rename sample setting'
        })
      ],
      config as never
    );

    expect(updates).toEqual([
      [
        'kicadstudio.sample.new',
        'global-old',
        vscode.ConfigurationTarget.Global
      ],
      ['kicadstudio.sample.old', undefined, vscode.ConfigurationTarget.Global],
      [
        'kicadstudio.sample.old',
        undefined,
        vscode.ConfigurationTarget.Workspace
      ],
      [
        'kicadstudio.sample.new',
        'folder-old',
        vscode.ConfigurationTarget.WorkspaceFolder
      ],
      [
        'kicadstudio.sample.old',
        undefined,
        vscode.ConfigurationTarget.WorkspaceFolder
      ]
    ]);
    expect(result.destructiveChanges).toBe(true);
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('KiCad Studio updated deprecated settings')
    );
  });

  it('migrates legacy Codex provider selections to the Copilot provider per scope', async () => {
    const context = createExtensionContextMock();
    const logger = createLoggerMock();
    const updates: Array<[string, unknown, vscode.ConfigurationTarget]> = [];
    const config = {
      inspect: jest.fn((key: string) => {
        if (key === SETTINGS.aiProvider) {
          return {
            globalValue: 'codex',
            workspaceValue: 'openai',
            workspaceFolderValue: 'codex'
          };
        }
        return undefined;
      }),
      update: jest.fn(
        async (
          key: string,
          value: unknown,
          target: vscode.ConfigurationTarget
        ) => {
          updates.push([key, value, target]);
        }
      )
    };

    const result = await runSettingsMigrations(
      context as never,
      logger,
      [
        createReplaceSettingValueMigration({
          schemaVersion: 1,
          setting: SETTINGS.aiProvider,
          fromValue: 'codex',
          toValue: 'copilot',
          description:
            'Migrate the removed Codex direct provider setting to GitHub Copilot.'
        })
      ],
      config as never
    );

    expect(updates).toEqual([
      [SETTINGS.aiProvider, 'copilot', vscode.ConfigurationTarget.Global],
      [
        SETTINGS.aiProvider,
        'copilot',
        vscode.ConfigurationTarget.WorkspaceFolder
      ]
    ]);
    expect(result.destructiveChanges).toBe(true);
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('KiCad Studio updated deprecated settings')
    );
  });

  it('declares initial seed and template rename migrations', () => {
    expect(
      DEFAULT_SETTINGS_MIGRATIONS.map((migration) => migration.schemaVersion)
    ).toEqual([1, 2, 3]);
    expect(CURRENT_SETTINGS_SCHEMA_VERSION).toBe(3);
    expect(DEFAULT_SETTINGS_MIGRATIONS[1]?.describe()).toContain(
      SETTINGS.viewerTheme
    );
    expect(DEFAULT_SETTINGS_MIGRATIONS[2]?.describe()).toContain(
      SETTINGS.aiProvider
    );
  });
});
