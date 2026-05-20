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
    this.tooltip = node.uri?.fsPath ?? node.label;
    this.iconPath = new vscode.ThemeIcon(iconForNode(node));

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
      ...projectFiles.map(
        (file): ProjectTreeNode => ({
          label: path.basename(file),
          type: file.endsWith('.kicad_sch')
            ? 'schematic'
            : file.endsWith('.kicad_pcb')
              ? 'pcb'
              : file.endsWith('.kicad_dru')
                ? 'drc-rule'
                : 'file',
          uri: vscode.Uri.file(file)
        })
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

function iconForNode(node: ProjectTreeNode): string {
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
