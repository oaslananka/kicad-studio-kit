import * as vscode from 'vscode';
import { SETTINGS } from '../constants';
import { localize } from '../i18n';
import type { Logger } from '../utils/logger';

export const SETTINGS_SCHEMA_VERSION_KEY = 'kicadstudio.settingsSchemaVersion';

export interface SettingMigrationContext {
  readonly extensionContext: vscode.ExtensionContext;
  readonly config: vscode.WorkspaceConfiguration;
  readonly logger: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>;
}

export interface SettingMigrationApplyResult {
  readonly changed: boolean;
  readonly destructive: boolean;
}

export interface SettingMigration {
  readonly schemaVersion: number;
  readonly id: string;
  readonly destructive?: boolean;
  describe(): string;
  apply(
    context: SettingMigrationContext
  ): Promise<SettingMigrationApplyResult | void>;
}

export interface SettingsMigrationFailure {
  readonly schemaVersion: number;
  readonly id: string;
  readonly error: unknown;
}

export interface SettingsMigrationRunResult {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly appliedVersions: number[];
  readonly destructiveChanges: boolean;
  readonly failedMigration: SettingsMigrationFailure | undefined;
}

type ConfigurationScopeValueKey =
  | 'globalValue'
  | 'workspaceValue'
  | 'workspaceFolderValue';

const CONFIGURATION_SCOPES: Array<{
  readonly label: string;
  readonly target: vscode.ConfigurationTarget;
  readonly valueKey: ConfigurationScopeValueKey;
}> = [
  {
    label: 'global',
    target: vscode.ConfigurationTarget.Global,
    valueKey: 'globalValue'
  },
  {
    label: 'workspace',
    target: vscode.ConfigurationTarget.Workspace,
    valueKey: 'workspaceValue'
  },
  {
    label: 'workspace folder',
    target: vscode.ConfigurationTarget.WorkspaceFolder,
    valueKey: 'workspaceFolderValue'
  }
];

export function createNoopSettingsMigration(
  schemaVersion: number,
  description = `Seed ${SETTINGS_SCHEMA_VERSION_KEY} at schema version ${schemaVersion}.`
): SettingMigration {
  return {
    schemaVersion,
    id: `settings-schema-v${schemaVersion}-seed`,
    describe: () => description,
    async apply() {
      return { changed: false, destructive: false };
    }
  };
}

export function createRenameSettingMigration(args: {
  readonly schemaVersion: number;
  readonly from: string;
  readonly to: string;
  readonly description?: string;
}): SettingMigration {
  return {
    schemaVersion: args.schemaVersion,
    id: `rename-${args.from}-to-${args.to}`,
    destructive: true,
    describe: () =>
      args.description ??
      `Rename deprecated setting ${args.from} to ${args.to}.`,
    async apply(context) {
      const sourceInspection = context.config.inspect<unknown>(args.from);
      if (!sourceInspection) {
        context.logger.debug(
          `Settings migration v${args.schemaVersion}: ${args.from} has no configured values.`
        );
        return { changed: false, destructive: false };
      }

      const targetInspection = context.config.inspect<unknown>(args.to);
      let changed = false;

      for (const scope of CONFIGURATION_SCOPES) {
        const sourceValue = sourceInspection[scope.valueKey];
        if (typeof sourceValue === 'undefined') {
          continue;
        }

        const targetValue = targetInspection?.[scope.valueKey];
        if (typeof targetValue === 'undefined') {
          await context.config.update(args.to, sourceValue, scope.target);
          context.logger.info(
            `Settings migration v${args.schemaVersion}: copied ${args.from} to ${args.to} at ${scope.label} scope.`
          );
        } else {
          context.logger.info(
            `Settings migration v${args.schemaVersion}: kept existing ${args.to} at ${scope.label} scope.`
          );
        }

        await context.config.update(args.from, undefined, scope.target);
        context.logger.info(
          `Settings migration v${args.schemaVersion}: cleared deprecated ${args.from} at ${scope.label} scope.`
        );
        changed = true;
      }

      return { changed, destructive: changed };
    }
  };
}

export const DEFAULT_SETTINGS_MIGRATIONS: readonly SettingMigration[] = [
  createNoopSettingsMigration(1),
  createRenameSettingMigration({
    schemaVersion: 2,
    from: 'kicadstudio.viewerTheme',
    to: SETTINGS.viewerTheme,
    description: `Rename legacy kicadstudio.viewerTheme to ${SETTINGS.viewerTheme}.`
  })
];

export const CURRENT_SETTINGS_SCHEMA_VERSION =
  DEFAULT_SETTINGS_MIGRATIONS.at(-1)?.schemaVersion ?? 0;

export async function runSettingsMigrations(
  extensionContext: vscode.ExtensionContext,
  logger: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
  migrations: readonly SettingMigration[] = DEFAULT_SETTINGS_MIGRATIONS,
  config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration()
): Promise<SettingsMigrationRunResult> {
  const fromVersion = normalizeStoredSchemaVersion(
    extensionContext.globalState.get<number>(SETTINGS_SCHEMA_VERSION_KEY, 0)
  );
  const appliedVersions: number[] = [];
  let destructiveChanges = false;
  let failedMigration: SettingsMigrationFailure | undefined;

  for (const migration of [...migrations].sort(
    (left, right) => left.schemaVersion - right.schemaVersion
  )) {
    if (migration.schemaVersion <= fromVersion) {
      continue;
    }

    try {
      logger.info(
        `Running settings migration v${migration.schemaVersion}: ${migration.describe()}`
      );
      const result = await migration.apply({
        extensionContext,
        config,
        logger
      });
      await extensionContext.globalState.update(
        SETTINGS_SCHEMA_VERSION_KEY,
        migration.schemaVersion
      );
      appliedVersions.push(migration.schemaVersion);

      if (result?.changed && (result.destructive || migration.destructive)) {
        destructiveChanges = true;
      }

      logger.info(`Settings migration v${migration.schemaVersion} applied.`);
    } catch (error) {
      failedMigration = {
        schemaVersion: migration.schemaVersion,
        id: migration.id,
        error
      };
      logger.error(
        `Settings migration v${migration.schemaVersion} failed: ${migration.describe()}`,
        error
      );
      void vscode.window.showErrorMessage(localize('settingsMigrationFailed'));
      break;
    }
  }

  if (destructiveChanges && !failedMigration) {
    void vscode.window.showInformationMessage(
      localize('settingsMigrationUpdatedDeprecatedSettings')
    );
  }

  return {
    fromVersion,
    toVersion: normalizeStoredSchemaVersion(
      extensionContext.globalState.get<number>(
        SETTINGS_SCHEMA_VERSION_KEY,
        fromVersion
      )
    ),
    appliedVersions,
    destructiveChanges,
    failedMigration
  };
}

function normalizeStoredSchemaVersion(value: number | undefined): number {
  return Number.isInteger(value) && typeof value === 'number' && value >= 0
    ? value
    : 0;
}
