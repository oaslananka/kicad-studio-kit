import * as vscode from 'vscode';
import { COMMANDS, CONTEXT_KEYS, EXTENSION_ID } from '../constants';

// The first-run message follows the discovered project and workspace-trust
// state. A visible project does not imply permission to run design tools.
export async function showFirstRunWelcome(workspace: {
  hasProject: boolean;
  workspaceTrusted: boolean;
}): Promise<void> {
  const message = workspace.hasProject
    ? workspace.workspaceTrusted
      ? 'Welcome to KiCad Studio. Your KiCad project is ready. Review schematics and PCBs, run checks, and prepare manufacturing outputs. MCP and AI are optional.'
      : 'Welcome to KiCad Studio. KiCad project detected. You can inspect files now. Trust this workspace to run design checks and manufacturing exports. MCP and AI are optional.'
    : 'Welcome to KiCad Studio. Open a project to review schematics and PCBs, run checks, and prepare manufacturing outputs. MCP and AI are optional.';
  const selection = await vscode.window.showInformationMessage(
    message,
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
    // The project may have been discovered before VS Code registers this
    // walkthrough's completion listener. Publish a separate context event
    // only after the walkthrough is open; preserve the real hasProject key.
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEYS.walkthroughProjectReady,
      workspace.hasProject
    );
  }
}
