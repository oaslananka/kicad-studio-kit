import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { KiCadSettingsPanel } from '../settings/settingsPanel';
import type { CommandServices } from './types';

export function registerSettingsCommands(
  extensionContext: vscode.ExtensionContext,
  services: CommandServices
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(COMMANDS.openSettings, () => {
      KiCadSettingsPanel.createOrShow(extensionContext, services);
    })
  ];
}
