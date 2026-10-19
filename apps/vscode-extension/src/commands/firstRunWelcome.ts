import * as vscode from 'vscode';
import { COMMANDS, EXTENSION_ID } from '../constants';

// Primary path needs only a KiCad project; MCP and AI are optional.
export async function showFirstRunWelcome(): Promise<void> {
  const selection = await vscode.window.showInformationMessage(
    'Welcome to KiCad Studio. Open a project to review schematics and PCBs, run checks, and prepare manufacturing outputs. MCP and AI are optional.',
    'Explore Tasks',
    'Guided Tour',
    'Maybe Later'
  );
  if (selection === 'Explore Tasks') {
    await vscode.commands.executeCommand(COMMANDS.openTaskHub);
  } else if (selection === 'Guided Tour') {
    await vscode.commands.executeCommand(
      'workbench.action.openWalkthrough',
      `${EXTENSION_ID}#kicadstudio.gettingStarted`
    );
  }
}
