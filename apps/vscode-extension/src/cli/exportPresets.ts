import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  COMMANDS,
  EXPORT_PRESET_SETTING,
  KICAD_EXPORT_PRESETS_FILE
} from '../constants';
import type { ExportPreset } from '../types';

const LAST_USED_PRESET_KEY = 'kicadstudio.exportPresets.lastUsed';
const CURRENT_SCHEMA_VERSION = 2;

/**
 * Workspace-backed export preset storage with validation and import/export helpers.
 */
export class ExportPresetStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getAll(): ExportPreset[] {
    const configured = vscode.workspace
      .getConfiguration()
      .get<ExportPreset[]>(EXPORT_PRESET_SETTING, [])
      .map((preset) => ExportPresetStore.migrate(preset));
    return mergePresets(configured, this.readWorkspacePresets());
  }

  getByName(name: string): ExportPreset | undefined {
    return this.getAll().find((preset) => preset.name === name);
  }

  getLastUsedName(): string | undefined {
    return this.context.workspaceState.get<string>(LAST_USED_PRESET_KEY);
  }

  async save(preset: ExportPreset): Promise<void> {
    const normalized = ExportPresetStore.migrate(preset);
    this.validatePreset(normalized);
    const config = vscode.workspace.getConfiguration();
    const presets = vscode.workspace
      .getConfiguration()
      .get<ExportPreset[]>(EXPORT_PRESET_SETTING, [])
      .map((item) => ExportPresetStore.migrate(item))
      .filter((item) => item.name !== normalized.name);
    presets.push(normalized);
    await config.update(
      EXPORT_PRESET_SETTING,
      presets,
      vscode.ConfigurationTarget.Workspace
    );
  }

  async rememberLastUsed(name: string): Promise<void> {
    await this.context.workspaceState.update(LAST_USED_PRESET_KEY, name);
  }

  async exportToFile(filePath: string): Promise<void> {
    fs.writeFileSync(filePath, JSON.stringify(this.getAll(), null, 2), 'utf8');
  }

  async importFromFile(filePath: string): Promise<void> {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = (JSON.parse(raw) as ExportPreset[]).map((preset) =>
      ExportPresetStore.migrate(preset)
    );
    for (const preset of parsed) {
      this.validatePreset(preset);
    }
    await vscode.workspace
      .getConfiguration()
      .update(
        EXPORT_PRESET_SETTING,
        parsed,
        vscode.ConfigurationTarget.Workspace
      );
  }

  static migrate(preset: ExportPreset): ExportPreset {
    return {
      ...preset,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      commands: Array.isArray(preset.commands) ? preset.commands : []
    };
  }

  private readWorkspacePresets(): ExportPreset[] {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      return [];
    }
    const presetFile = path.join(root, '.vscode', KICAD_EXPORT_PRESETS_FILE);
    if (!fs.existsSync(presetFile)) {
      return [];
    }
    try {
      const parsed = JSON.parse(
        fs.readFileSync(presetFile, 'utf8')
      ) as ExportPreset[];
      return parsed.map((preset) => ExportPresetStore.migrate(preset));
    } catch {
      return [];
    }
  }

  private validatePreset(preset: ExportPreset): void {
    if (!preset.name.trim()) {
      throw new Error('Export preset name cannot be empty.');
    }
    const validCommands = new Set(Object.values(COMMANDS));
    for (const command of preset.commands) {
      if (
        !validCommands.has(command as (typeof COMMANDS)[keyof typeof COMMANDS])
      ) {
        throw new Error(
          `Export preset "${preset.name}" contains an unknown command: ${command}`
        );
      }
    }
  }
}

function mergePresets(
  configured: ExportPreset[],
  workspacePresets: ExportPreset[]
): ExportPreset[] {
  const merged = [...configured];
  const names = new Set(configured.map((preset) => preset.name));
  for (const preset of workspacePresets) {
    if (!names.has(preset.name)) {
      merged.push(preset);
      names.add(preset.name);
    }
  }
  return merged;
}
