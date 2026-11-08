import * as vscode from 'vscode';
import { findFirstWorkspaceFile } from './pathUtils';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Returns the resource of the active VS Code tab. In a custom webview editor,
 * activeTextEditor can still refer to a different, previously focused text
 * editor; that stale URI must not override the user's visible KiCad tab.
 */
export function getActiveResourceUri(): vscode.Uri | undefined {
  const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab?.input as
    { uri?: vscode.Uri } | undefined;
  return activeTab?.uri ?? vscode.window.activeTextEditor?.document.uri;
}

/**
 * Resolve a target file for a command that operates on a specific file type.
 * Priority: explicit argument → active editor → first workspace match.
 */
export async function resolveTargetFile(
  resource: vscode.Uri | undefined,
  extname: string,
  options: { projectRoot?: string | undefined } = {}
): Promise<string | undefined> {
  if (resource?.fsPath.endsWith(extname)) {
    return resource.fsPath;
  }
  const active = getActiveResourceUri();
  if (
    active?.fsPath.endsWith(extname) &&
    (!options.projectRoot ||
      belongsToProjectRoot(options.projectRoot, active.fsPath))
  ) {
    return active.fsPath;
  }
  if (options.projectRoot) {
    const projectFile = await findFirstProjectFile(
      options.projectRoot,
      extname
    );
    if (projectFile) {
      return projectFile;
    }
  }
  const files = await vscode.workspace.findFiles(
    `**/*${extname}`,
    '**/node_modules/**',
    1
  );
  return files[0]?.fsPath;
}

async function findFirstProjectFile(
  rootPath: string,
  extname: string
): Promise<string | undefined> {
  const resolvedRoot = path.resolve(rootPath);
  try {
    await fs.promises.access(resolvedRoot);
  } catch {
    return undefined;
  }

  const entries = await collectFiles(resolvedRoot, extname, resolvedRoot);
  return entries[0];
}

async function collectFiles(
  currentPath: string,
  extname: string,
  rootPath: string
): Promise<string[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
  } catch {
    return [];
  }

  if (
    currentPath !== rootPath &&
    entries.some(
      (entry) =>
        entry.isFile() &&
        path.extname(entry.name).toLowerCase() === '.kicad_pro'
    )
  ) {
    return [];
  }

  const matches: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORY_NAMES.has(entry.name.toLowerCase())) {
        matches.push(...(await collectFiles(absolute, extname, rootPath)));
      }
      continue;
    }
    if (
      path.extname(entry.name).toLowerCase() === extname.toLowerCase() &&
      !entry.name.toLowerCase().endsWith('.lck')
    ) {
      matches.push(absolute);
    }
  }
  return matches.sort();
}

function isWithinDirectory(rootPath: string, filePath: string): boolean {
  const relative = path.relative(
    path.resolve(rootPath),
    path.resolve(filePath)
  );
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

function belongsToProjectRoot(rootPath: string, filePath: string): boolean {
  const resolvedRoot = path.resolve(rootPath);
  let currentPath = path.dirname(path.resolve(filePath));
  while (isWithinDirectory(resolvedRoot, currentPath)) {
    if (directoryHasProjectFile(currentPath)) {
      return path.resolve(currentPath) === resolvedRoot;
    }
    const parent = path.dirname(currentPath);
    if (parent === currentPath) {
      break;
    }
    currentPath = parent;
  }
  return true;
}

function directoryHasProjectFile(directoryPath: string): boolean {
  try {
    return fs
      .readdirSync(directoryPath, { withFileTypes: true })
      .some(
        (entry) =>
          entry.isFile() &&
          path.extname(entry.name).toLowerCase() === '.kicad_pro'
      );
  } catch {
    return false;
  }
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

const IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  'out',
  'build',
  'coverage',
  '.history',
  '.code-backups',
  'generated',
  'temp',
  'tmp',
  'backups',
  'backup'
]);
