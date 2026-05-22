import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import {
  PCM_PACKAGE_KINDS,
  PcmPackage,
  PcmPackageKind,
  PcmService
} from './pcmService';

type PcmTreeNode = PcmGroupNode | PcmPackageNode;

interface PcmGroupNode {
  type: 'group';
  kind: PcmPackageKind;
  label: string;
}

interface PcmPackageNode {
  type: 'package';
  pkg: PcmPackage;
}

export class PcmLibraryProvider
  implements vscode.TreeDataProvider<PcmTreeNode>, vscode.Disposable
{
  private readonly onDidChangeTreeDataEmitter =
    new vscode.EventEmitter<PcmTreeNode | undefined | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private filter: PcmPackageKind | 'all' = 'all';
  private loaded = false;
  private readonly disposable: vscode.Disposable;

  constructor(private readonly pcmService: PcmService) {
    this.disposable = this.pcmService.onDidChange(() =>
      this.onDidChangeTreeDataEmitter.fire()
    );
  }

  dispose(): void {
    this.disposable.dispose();
    this.onDidChangeTreeDataEmitter.dispose();
  }

  getTreeItem(element: PcmTreeNode): vscode.TreeItem {
    if (element.type === 'group') {
      const packages = this.packagesForKind(element.kind);
      const updates = packages.filter(
        (pkg) => pkg.state === 'update-available'
      ).length;
      const item = new vscode.TreeItem(
        element.label,
        vscode.TreeItemCollapsibleState.Collapsed
      );
      item.description = updates
        ? `${packages.length} packages, ${updates} updates`
        : `${packages.length} packages`;
      item.contextValue = `pcmGroup${toContextSuffix(element.kind)}`;
      item.iconPath = new vscode.ThemeIcon(iconForKind(element.kind));
      return item;
    }

    const { pkg } = element;
    const item = new vscode.TreeItem(
      pkg.metadata.name,
      vscode.TreeItemCollapsibleState.None
    );
    item.description = descriptionForPackage(pkg);
    item.tooltip = tooltipForPackage(pkg);
    item.iconPath = new vscode.ThemeIcon(iconForPackage(pkg));
    item.contextValue =
      pkg.state === 'update-available'
        ? 'pcmPackageUpdate'
        : pkg.state === 'installed'
          ? 'pcmPackageInstalled'
          : 'pcmPackageAvailable';
    if (pkg.state === 'available') {
      item.command = {
        command: COMMANDS.installPcmPackage,
        title: 'Install PCM Package',
        arguments: [pkg]
      };
    } else if (pkg.state === 'update-available') {
      item.command = {
        command: COMMANDS.updatePcmPackage,
        title: 'Update PCM Package',
        arguments: [pkg]
      };
    }
    return item;
  }

  async getChildren(element?: PcmTreeNode): Promise<PcmTreeNode[]> {
    await this.ensureLoaded();
    if (element?.type === 'group') {
      return this.packagesForKind(element.kind).map((pkg) => ({
        type: 'package',
        pkg
      }));
    }
    if (element?.type === 'package') {
      return [];
    }
    if (this.filter !== 'all') {
      return this.packagesForKind(this.filter).map((pkg) => ({
        type: 'package',
        pkg
      }));
    }
    return PCM_PACKAGE_KINDS.map((entry) => ({
      type: 'group',
      kind: entry.kind,
      label: entry.label
    }));
  }

  async refresh(): Promise<void> {
    this.loaded = true;
    await this.pcmService.refreshRepositories();
    this.onDidChangeTreeDataEmitter.fire();
  }

  async pickFilter(): Promise<void> {
    const picked = await vscode.window.showQuickPick<
      vscode.QuickPickItem & { value: PcmPackageKind | 'all' }
    >(
      [
        { label: 'All PCM package types', value: 'all' as const },
        ...PCM_PACKAGE_KINDS.map((entry) => ({
          label: entry.label,
          value: entry.kind
        }))
      ],
      { title: 'Filter KiCad PCM libraries' }
    );
    if (!picked) {
      return;
    }
    this.filter = picked.value;
    this.onDidChangeTreeDataEmitter.fire();
  }

  setFilter(filter: PcmPackageKind | 'all'): void {
    this.filter = filter;
    this.onDidChangeTreeDataEmitter.fire();
  }

  getFilter(): PcmPackageKind | 'all' {
    return this.filter;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }
    this.loaded = true;
    await this.pcmService.refreshRepositories();
  }

  private packagesForKind(kind: PcmPackageKind): PcmPackage[] {
    return this.pcmService
      .getPackages()
      .filter((pkg) => pkg.contentTypes.includes(kind))
      .sort(comparePackages);
  }
}

export function unwrapPcmPackage(value: unknown): PcmPackage | undefined {
  if (value && typeof value === 'object') {
    const maybeNode = value as Partial<PcmPackageNode>;
    if (maybeNode.type === 'package' && maybeNode.pkg) {
      return maybeNode.pkg;
    }
    const maybePackage = value as PcmPackage;
    if (maybePackage.metadata?.identifier) {
      return maybePackage;
    }
  }
  return undefined;
}

function descriptionForPackage(pkg: PcmPackage): string {
  const version = pkg.latestVersion?.version
    ? `v${pkg.latestVersion.version}`
    : 'no version';
  if (pkg.state === 'installed') {
    return `Installed ${pkg.installed?.version ?? version}`;
  }
  if (pkg.state === 'update-available') {
    return `Update ${pkg.installed?.version ?? '?'} -> ${version}`;
  }
  return `Available ${version}`;
}

function tooltipForPackage(pkg: PcmPackage): string {
  const kinds = pkg.contentTypes
    .map((kind) => PCM_PACKAGE_KINDS.find((entry) => entry.kind === kind)?.label)
    .filter(Boolean)
    .join(', ');
  return [
    pkg.metadata.description || pkg.metadata.name,
    `Identifier: ${pkg.metadata.identifier}`,
    `Repository: ${pkg.repositoryName}`,
    `Type: ${kinds || pkg.metadata.type}`,
    pkg.latestVersion ? `Latest: ${pkg.latestVersion.version}` : undefined,
    pkg.installed ? `Installed: ${pkg.installed.version}` : undefined
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
}

function iconForPackage(pkg: PcmPackage): string {
  if (pkg.state === 'installed') {
    return 'check';
  }
  if (pkg.state === 'update-available') {
    return 'sync';
  }
  return iconForKind(pkg.contentTypes[0] ?? 'symbols');
}

function iconForKind(kind: PcmPackageKind): string {
  switch (kind) {
    case 'footprints':
      return 'circuit-board';
    case '3d-models':
      return 'symbol-structure';
    case 'plugins':
      return 'extensions';
    case 'color-themes':
      return 'color-mode';
    case 'symbols':
    default:
      return 'symbol-property';
  }
}

function comparePackages(left: PcmPackage, right: PcmPackage): number {
  const stateOrder = (pkg: PcmPackage): number =>
    pkg.state === 'update-available' ? 0 : pkg.state === 'available' ? 1 : 2;
  return (
    stateOrder(left) - stateOrder(right) ||
    left.metadata.name.localeCompare(right.metadata.name)
  );
}

function toContextSuffix(value: string): string {
  return value
    .split(/[^a-z0-9]+/u)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join('');
}
