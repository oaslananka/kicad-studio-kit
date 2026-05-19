import * as vscode from 'vscode';
import { findFirstWorkspaceFile } from './pathUtils';
import * as fs from 'node:fs';

/**
 * Returns the URI of the currently active editor resource, falling back to
 * the active tab's input URI when no text editor is focused (e.g. when a
 * custom webview editor is active).
 */
export function getActiveResourceUri(): vscode.Uri | undefined {
  const editorUri = vscode.window.activeTextEditor?.document.uri;
  if (editorUri) {
    return editorUri;
  }

  const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab?.input as
    | { uri?: vscode.Uri }
    | undefined;
  return activeTab?.uri;
}

/**
 * Resolve a target file for a command that operates on a specific file type.
 * Priority: explicit argument → active editor → first workspace match.
 */
export async function resolveTargetFile(
  resource: vscode.Uri | undefined,
  extname: string
): Promise<string | undefined> {
  if (resource?.fsPath.endsWith(extname)) {
    return resource.fsPath;
  }
  const active = getActiveResourceUri();
  if (active?.fsPath.endsWith(extname)) {
    return active.fsPath;
  }
  const files = await vscode.workspace.findFiles(
    `**/*${extname}`,
    '**/node_modules/**',
    1
  );
  return files[0]?.fsPath;
}

/**
 * Check whether the current workspace contains a KiCad project file with
 * variant definitions.
 */
export async function workspaceHasVariants(): Promise<boolean> {
  const projectFile = await findFirstWorkspaceFile('**/*.kicad_pro');
  if (!projectFile) {
    return false;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(projectFile, 'utf8')) as {
      variants?: unknown[];
      design_variants?: unknown[];
    };
    return (
      (Array.isArray(parsed.variants) && parsed.variants.length > 0) ||
      (Array.isArray(parsed.design_variants) &&
        parsed.design_variants.length > 0)
    );
  } catch {
    return false;
  }
}
