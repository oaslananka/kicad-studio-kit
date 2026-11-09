import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ProjectContext } from '../types';

export const ACTIVE_PROJECT_STORAGE_KEY = 'kicadstudio.activeProjectId';

interface ActiveProjectPickOptions {
  requestedProjectId?: string | undefined;
  previousActiveProjectId?: string | undefined;
  persistedActiveProjectId?: string | undefined;
  activeResourcePath?: string | undefined;
}

export async function discoverKiCadProjects(
  workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined
): Promise<ProjectContext[]> {
  const folders = workspaceFolders ?? [];
  const projects: ProjectContext[] = [];

  for (const folder of folders) {
    const workspaceFolder = path.resolve(folder.uri.fsPath);
    const projectFiles = await collectProjectFiles(workspaceFolder);
    for (const projectFile of projectFiles) {
      projects.push(createProjectContext(workspaceFolder, projectFile));
    }
  }

  return projects.sort((left, right) =>
    pathComparisonKey(left.projectFile).localeCompare(
      pathComparisonKey(right.projectFile)
    )
  );
}

export function pickActiveProject(
  projects: readonly ProjectContext[],
  options: ActiveProjectPickOptions = {}
): ProjectContext | undefined {
  if (!projects.length) {
    return undefined;
  }

  // Explicit selections (including the persisted user preference) win.
  for (const id of [
    options.requestedProjectId,
    options.persistedActiveProjectId
  ]) {
    const match = id
      ? projects.find((project) => project.id === id)
      : undefined;
    if (match) return cloneProjectContext(match);
  }

  // An automatically selected previous project is not an explicit preference.
  // In multi-project workspaces the visible file determines the active
  // project, otherwise ERC can publish findings to one project while the
  // Validation panel is pinned to another (showing "Not run").
  const resourceProject = findProjectForResource(
    projects,
    options.activeResourcePath
  );
  if (resourceProject) return resourceProject;

  const previousProject = options.previousActiveProjectId
    ? projects.find((project) => project.id === options.previousActiveProjectId)
    : undefined;
  if (previousProject) return cloneProjectContext(previousProject);

  return cloneProjectContext(projects[0]!);
}

export function findProjectForResource(
  projects: readonly ProjectContext[],
  resource: vscode.Uri | string | undefined
): ProjectContext | undefined {
  const resourcePath =
    typeof resource === 'string' ? resource : resource?.fsPath;
  if (!resourcePath) {
    return undefined;
  }
  const resolvedResource = path.resolve(resourcePath);
  const candidates = projects
    .filter(
      (project) =>
        samePath(project.projectFile, resolvedResource) ||
        isWithinDirectory(project.rootPath, resolvedResource)
    )
    .sort((left, right) => right.rootPath.length - left.rootPath.length);

  return candidates[0] ? cloneProjectContext(candidates[0]) : undefined;
}

export function cloneProjectContext(project: ProjectContext): ProjectContext {
  return { ...project };
}

export function mcpProjectArguments(
  project: ProjectContext | undefined
): Record<string, unknown> {
  if (!project) {
    return {};
  }

  const context = cloneProjectContext(project);
  return {
    project: context,
    projectId: context.id,
    projectName: context.name,
    projectRoot: context.rootPath,
    projectFile: context.projectFile
  };
}

function createProjectContext(
  workspaceFolder: string,
  projectFile: string
): ProjectContext {
  const resolvedProjectFile = path.resolve(projectFile);
  const rootPath = path.dirname(resolvedProjectFile);
  return {
    id: vscode.Uri.file(resolvedProjectFile).toString(),
    name: path.basename(resolvedProjectFile, '.kicad_pro'),
    rootPath,
    projectFile: resolvedProjectFile,
    workspaceFolder
  };
}

async function collectProjectFiles(rootPath: string): Promise<string[]> {
  try {
    await fs.promises.access(rootPath);
  } catch {
    return [];
  }

  const result: string[] = [];
  const visit = async (currentPath: string): Promise<void> => {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absolute = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (!shouldIgnoreDirectory(entry.name)) {
          await visit(absolute);
        }
        continue;
      }

      if (
        !shouldIgnoreFile(entry.name) &&
        path.extname(entry.name).toLowerCase() === '.kicad_pro'
      ) {
        result.push(absolute);
      }
    }
  };

  await visit(rootPath);
  return result.sort((left, right) =>
    pathComparisonKey(left).localeCompare(pathComparisonKey(right))
  );
}

function shouldIgnoreDirectory(name: string): boolean {
  const normalizedName = name.toLowerCase();
  return (
    IGNORED_DIRECTORY_NAMES.has(normalizedName) ||
    normalizedName.endsWith('-backups')
  );
}

function shouldIgnoreFile(name: string): boolean {
  const normalizedName = name.toLowerCase();
  return (
    normalizedName.endsWith('.bak') ||
    normalizedName.endsWith('.backup') ||
    normalizedName.endsWith('.lck') ||
    normalizedName.endsWith('.lock') ||
    normalizedName.endsWith('.tmp') ||
    normalizedName.endsWith('~')
  );
}

function isWithinDirectory(rootPath: string, filePath: string): boolean {
  const relative = path.relative(rootPath, filePath);
  return (
    Boolean(relative) &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative)
  );
}

function samePath(left: string, right: string): boolean {
  return pathComparisonKey(left) === pathComparisonKey(right);
}

function pathComparisonKey(filePath: string): string {
  const normalizedPath = path.normalize(filePath);
  return CASE_INSENSITIVE_PLATFORM_PATHS
    ? normalizedPath.toLowerCase()
    : normalizedPath;
}

const CASE_INSENSITIVE_PLATFORM_PATHS =
  process.platform === 'win32' || process.platform === 'darwin';

const IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  'out',
  'build',
  'coverage',
  '.nyc_output',
  'generated',
  'temp',
  'tmp',
  'backups',
  'backup',
  '.vscode',
  '.github',
  '.husky',
  '.history',
  '.code-backups'
]);
