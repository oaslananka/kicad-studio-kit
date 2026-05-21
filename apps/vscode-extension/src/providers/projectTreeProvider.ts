import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import type { ProjectTreeNode } from '../types';

class KiCadTreeItem extends vscode.TreeItem {
  constructor(
    public readonly node: ProjectTreeNode,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(node.label, collapsibleState);
    this.contextValue = node.type;
    if (node.uri) {
      this.resourceUri = node.uri;
    }
    const diagnostics = diagnosticsForNode(node);
    this.description = descriptionForNode(node, diagnostics);
    this.tooltip = tooltipForNode(node, diagnostics);
    this.iconPath = new vscode.ThemeIcon(iconForNode(node, diagnostics));

    if (
      node.uri &&
      (node.type === 'schematic' ||
        node.type === 'pcb' ||
        node.type === 'drc-rule' ||
        node.type === 'file' ||
        node.type === 'jobset')
    ) {
      this.command = {
        command:
          node.type === 'schematic'
            ? COMMANDS.openSchematic
            : node.type === 'pcb'
              ? COMMANDS.openPCB
              : node.type === 'jobset'
                ? COMMANDS.runJobset
                : 'vscode.open',
        title: node.label,
        arguments: [node.uri]
      };
    }
  }
}

export class KiCadProjectTreeProvider implements vscode.TreeDataProvider<ProjectTreeNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    ProjectTreeNode | undefined
  >();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  getTreeItem(element: ProjectTreeNode): vscode.TreeItem {
    const collapsible =
      element.children && element.children.length > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None;
    return new KiCadTreeItem(element, collapsible);
  }

  async getChildren(element?: ProjectTreeNode): Promise<ProjectTreeNode[]> {
    if (element?.children) {
      return element.children;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    const roots: ProjectTreeNode[] = [];

    for (const folder of workspaceFolders) {
      roots.push(await this.buildWorkspaceNode(folder.uri.fsPath));
    }

    return roots;
  }

  private async buildWorkspaceNode(rootPath: string): Promise<ProjectTreeNode> {
    const outputDirName = vscode.workspace
      .getConfiguration()
      .get<string>('kicadstudio.defaultOutputDir', 'fab');
    const [
      projectFiles,
      jobsetFiles,
      symbolFiles,
      footprintFiles,
      models,
      fabFiles
    ] = await Promise.all([
      collectFiles(rootPath, /\.(kicad_pro|kicad_sch|kicad_pcb|kicad_dru)$/i),
      collectFiles(rootPath, /\.kicad_jobset$/i),
      collectFiles(rootPath, /\.kicad_sym$/i),
      collectFiles(rootPath, /\.kicad_mod$/i),
      collectFiles(rootPath, /\.(step|stp|wrl)$/i),
      collectFiles(
        path.join(rootPath, outputDirName),
        /\.(gbr|drl|pdf|svg|zip|glb|csv|xlsx|json|html|net)$/i
      )
    ]);

    const children: ProjectTreeNode[] = [
      groupProjectNodes(
        'Project Files',
        projectFiles.filter((file) => hasExtension(file, '.kicad_pro'))
      ),
      groupProjectNodes(
        'Schematic Sheets',
        projectFiles.filter((file) => hasExtension(file, '.kicad_sch'))
      ),
      groupProjectNodes(
        'PCB',
        projectFiles.filter((file) => hasExtension(file, '.kicad_pcb'))
      ),
      groupProjectNodes(
        'Design Rules',
        projectFiles.filter((file) => hasExtension(file, '.kicad_dru'))
      ),
      {
        label: 'Jobsets',
        type: 'jobset' as const,
        children: jobsetFiles.map(
          (file): ProjectTreeNode => ({
            label: path.basename(file),
            type: 'jobset',
            uri: vscode.Uri.file(file)
          })
        )
      },
      {
        label: 'Schematic Libraries',
        type: 'symbol-library' as const,
        children: symbolFiles.map(
          (file): ProjectTreeNode => ({
            label: path.basename(file),
            type: 'file',
            uri: vscode.Uri.file(file)
          })
        )
      },
      {
        label: 'Footprint Libraries',
        type: 'footprint-library' as const,
        children: footprintFiles.map(
          (file): ProjectTreeNode => ({
            label: path.basename(file),
            type: 'file',
            uri: vscode.Uri.file(file)
          })
        )
      },
      {
        label: 'Fabrication Outputs',
        type: 'fab-output' as const,
        children: fabFiles.map(
          (file): ProjectTreeNode => ({
            label: path.basename(file),
            type: 'file',
            uri: vscode.Uri.file(file)
          })
        )
      },
      {
        label: '3D Models',
        type: 'model' as const,
        children: models.map(
          (file): ProjectTreeNode => ({
            label: path.basename(file),
            type: 'file',
            uri: vscode.Uri.file(file)
          })
        )
      }
    ].filter((node) => !node.children || node.children.length > 0);

    return {
      label: path.basename(rootPath),
      type: 'project',
      uri: vscode.Uri.file(rootPath),
      children
    };
  }
}

interface TreeDiagnostics {
  errors: number;
  warnings: number;
  total: number;
}

function groupProjectNodes(label: string, files: string[]): ProjectTreeNode {
  return {
    label,
    type: 'folder',
    children: files.map(projectFileNode)
  };
}

function projectFileNode(file: string): ProjectTreeNode {
  const extension = normalizedExtension(file);
  return {
    label: path.basename(file),
    type: extension === '.kicad_sch'
      ? 'schematic'
      : extension === '.kicad_pcb'
        ? 'pcb'
        : extension === '.kicad_dru'
          ? 'drc-rule'
          : 'file',
    uri: vscode.Uri.file(file)
  };
}

function diagnosticsForNode(node: ProjectTreeNode): TreeDiagnostics {
  if (node.children && node.children.length > 0) {
    return node.children.reduce<TreeDiagnostics>(
      (state, child) => {
        const childDiagnostics = diagnosticsForNode(child);
        return {
          errors: state.errors + childDiagnostics.errors,
          warnings: state.warnings + childDiagnostics.warnings,
          total: state.total + childDiagnostics.total
        };
      },
      { errors: 0, warnings: 0, total: 0 }
    );
  }

  if (!node.uri || node.type === 'project' || node.type === 'folder') {
    return { errors: 0, warnings: 0, total: 0 };
  }

  const diagnostics = vscode.languages.getDiagnostics(node.uri);
  return diagnostics.reduce(
    (state, diagnostic) => ({
      errors:
        state.errors +
        (diagnostic.severity === vscode.DiagnosticSeverity.Error ? 1 : 0),
      warnings:
        state.warnings +
        (diagnostic.severity === vscode.DiagnosticSeverity.Warning ? 1 : 0),
      total: state.total + 1
    }),
    { errors: 0, warnings: 0, total: 0 }
  );
}

function descriptionForNode(
  node: ProjectTreeNode,
  diagnostics: TreeDiagnostics
): string {
  const description = roleForNode(node);
  const diagnosticState = diagnosticSummary(diagnostics);
  return diagnosticState ? `${description} | ${diagnosticState}` : description;
}

function tooltipForNode(
  node: ProjectTreeNode,
  diagnostics: TreeDiagnostics
): string {
  const diagnosticState = diagnosticSummary(diagnostics);
  const detail = [
    `Role: ${roleForNode(node)}`,
    node.uri ? `Path: ${node.uri.fsPath}` : undefined,
    node.children
      ? `State: ${node.children.length} visible item${node.children.length === 1 ? '' : 's'}${diagnosticState ? ` | ${diagnosticState}` : ''}`
      : `State: ${diagnosticState ?? 'No diagnostics reported'}`,
    node.uri && node.type !== 'project'
      ? 'Source control: VS Code file decorations reflect working tree changes.'
      : undefined
  ].filter(Boolean);

  return detail.join('\n');
}

function hasExtension(file: string, extension: string): boolean {
  return normalizedExtension(file) === extension;
}

function normalizedExtension(file: string): string {
  return path.extname(file).toLowerCase();
}

function diagnosticSummary(diagnostics: TreeDiagnostics): string | undefined {
  if (diagnostics.errors > 0) {
    return `${diagnostics.errors} error${diagnostics.errors === 1 ? '' : 's'}`;
  }
  if (diagnostics.warnings > 0) {
    return `${diagnostics.warnings} warning${diagnostics.warnings === 1 ? '' : 's'}`;
  }
  if (diagnostics.total > 0) {
    return `${diagnostics.total} diagnostic${diagnostics.total === 1 ? '' : 's'}`;
  }
  return undefined;
}

function roleForNode(node: ProjectTreeNode): string {
  switch (node.type) {
    case 'project':
      return 'KiCad workspace';
    case 'schematic':
      return 'Schematic sheet';
    case 'pcb':
      return 'PCB layout';
    case 'drc-rule':
      return 'Design rules';
    case 'jobset':
      return node.children ? 'Jobset group' : 'Jobset';
    case 'symbol-library':
      return 'Schematic library group';
    case 'footprint-library':
      return 'Footprint library group';
    case 'fab-output':
      return 'Fabrication output group';
    case 'model':
      return '3D model group';
    case 'folder':
      return `${node.label} group`;
    case 'file':
      return roleForFile(node.label);
  }
}

function roleForFile(label: string): string {
  switch (path.extname(label).toLowerCase()) {
    case '.kicad_pro':
      return 'KiCad project file';
    case '.kicad_sym':
      return 'Symbol library';
    case '.kicad_mod':
      return 'Footprint library';
    case '.gbr':
    case '.drl':
      return 'Fabrication output';
    case '.step':
    case '.stp':
    case '.wrl':
      return '3D model';
    default:
      return 'KiCad file';
  }
}

function iconForNode(
  node: ProjectTreeNode,
  diagnostics: TreeDiagnostics
): string {
  if (diagnostics.errors > 0) {
    return 'error';
  }
  if (diagnostics.warnings > 0) {
    return 'warning';
  }

  switch (node.type) {
    case 'project':
      return 'repo';
    case 'schematic':
      return 'symbol-class';
    case 'pcb':
      return 'circuit-board';
    case 'drc-rule':
      return 'law';
    case 'jobset':
      return 'play-circle';
    case 'symbol-library':
      return 'library';
    case 'footprint-library':
      return 'extensions';
    case 'fab-output':
      return 'package';
    case 'model':
      return 'symbol-structure';
    case 'folder':
      return 'folder';
    case 'file':
      return iconForFile(node.label);
  }
}

function iconForFile(label: string): string {
  const ext = path.extname(label).toLowerCase();
  switch (ext) {
    case '.kicad_pro':
      return 'repo';
    case '.kicad_sch':
      return 'symbol-class';
    case '.kicad_pcb':
      return 'circuit-board';
    case '.kicad_dru':
      return 'law';
    case '.kicad_sym':
      return 'symbol-enum';
    case '.kicad_mod':
      return 'symbol-structure';
    case '.kicad_jobset':
      return 'play-circle';
    case '.step':
    case '.stp':
    case '.wrl':
      return 'symbol-structure';
    case '.gbr':
    case '.drl':
      return 'layers';
    case '.csv':
    case '.xlsx':
    case '.json':
      return 'table';
    case '.pdf':
    case '.svg':
    case '.html':
      return 'preview';
    case '.zip':
      return 'file-zip';
    default:
      return 'file';
  }
}

async function collectFiles(
  rootPath: string,
  pattern: RegExp
): Promise<string[]> {
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
        if (
          [
            // Version control / dependency management
            '.git',
            'node_modules',
            // Build/coverage artefacts
            'dist',
            'out',
            'build',
            'coverage',
            '.nyc_output',
            // Extension development dirs (not KiCad design files)
            'src',
            'test',
            'scripts',
            'media',
            'docs',
            // Hidden/tooling dirs
            '.vscode',
            '.github',
            '.husky'
          ].includes(entry.name)
        ) {
          continue;
        }
        await visit(absolute);
      } else if (pattern.test(entry.name)) {
        result.push(absolute);
      }
    }
  };

  await visit(rootPath);
  return result.sort();
}
