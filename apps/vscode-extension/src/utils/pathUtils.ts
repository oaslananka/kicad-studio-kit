import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { KICAD_FILE_EXTENSIONS } from '../constants';

export function isKiCadFile(uriOrPath: vscode.Uri | string): boolean {
  const extname = path.extname(
    uriOrPath instanceof vscode.Uri ? uriOrPath.fsPath : uriOrPath
  );
  return KICAD_FILE_EXTENSIONS.includes(
    extname as (typeof KICAD_FILE_EXTENSIONS)[number]
  );
}

export function getWorkspaceFolderForUri(
  uri: vscode.Uri
): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.getWorkspaceFolder(uri);
}

export function getWorkspaceRoot(uri?: vscode.Uri): string | undefined {
  if (uri) {
    return getWorkspaceFolderForUri(uri)?.uri.fsPath;
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function toPosixPath(value: string): string {
  return value.split(path.sep).join(path.posix.sep);
}

export function relativeToWorkspace(
  filePath: string,
  root = getWorkspaceRoot()
): string {
  if (!root) {
    return filePath;
  }
  return toPosixPath(path.relative(root, filePath));
}

export function pathExistsOnAnyPlatform(targetPath: string): boolean {
  try {
    return fs.existsSync(targetPath);
  } catch {
    return false;
  }
}

export function normalizeUserPath(targetPath: string): string {
  const trimmed = targetPath.trim();
  const unquoted =
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
      ? trimmed.slice(1, -1)
      : trimmed;
  if (!unquoted) {
    return '';
  }
  if (unquoted === '~') {
    return os.homedir();
  }
  if (unquoted.startsWith('~/') || unquoted.startsWith('~\\')) {
    return path.join(os.homedir(), unquoted.slice(2));
  }
  return path.normalize(unquoted);
}

export function isPathInside(parentPath: string, childPath: string): boolean {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  const relative = path.relative(parent, child);
  return (
    relative === '' ||
    (relative.length > 0 &&
      !relative.startsWith('..') &&
      !path.isAbsolute(relative))
  );
}

export function assertPathInside(
  parentPath: string,
  childPath: string,
  message: string
): void {
  if (!isPathInside(parentPath, childPath)) {
    throw new Error(message);
  }
}

export function resolveWorkspaceOutputDir(
  filePath: string,
  configuredOutputDir: string
): string {
  const workspaceRoot =
    getWorkspaceRoot(vscode.Uri.file(filePath)) ?? path.dirname(filePath);
  const configured = normalizeUserPath(configuredOutputDir) || 'fab';
  const candidate = path.isAbsolute(configured)
    ? path.normalize(configured)
    : path.resolve(workspaceRoot, configured);

  const workspaceRealPath = resolveExistingPath(workspaceRoot);
  const candidateRealPath = resolveThroughExistingAncestor(candidate);

  assertPathInside(
    workspaceRealPath,
    candidateRealPath,
    `Output directory must stay inside the workspace: ${configuredOutputDir}`
  );

  return candidate;
}

export function findSiblingProjectFile(filePath: string): string | undefined {
  const sibling = path.join(
    path.dirname(filePath),
    `${path.parse(filePath).name}.kicad_pro`
  );
  if (fs.existsSync(sibling)) {
    return sibling;
  }

  try {
    const entries = fs.readdirSync(path.dirname(filePath));
    const projectEntry = entries.find((entry) => entry.endsWith('.kicad_pro'));
    return projectEntry
      ? path.join(path.dirname(filePath), projectEntry)
      : undefined;
  } catch {
    return undefined;
  }
}

export async function findFirstWorkspaceFile(
  pattern: string,
  exclude = '**/node_modules/**'
): Promise<string | undefined> {
  const files = await vscode.workspace.findFiles(pattern, exclude, 1);
  return files[0]?.fsPath;
}

function resolveExistingPath(targetPath: string): string {
  try {
    return fs.realpathSync.native(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

function resolveThroughExistingAncestor(targetPath: string): string {
  const missingSegments: string[] = [];
  let current = path.resolve(targetPath);

  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(targetPath);
    }
    missingSegments.unshift(path.basename(current));
    current = parent;
  }

  return path.join(resolveExistingPath(current), ...missingSegments);
}
