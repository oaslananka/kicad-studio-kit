import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { NetlistNode } from '../types';
import { SExpressionParser, type SNode } from '../language/sExpressionParser';
import { KiCadCliRunner } from '../cli/kicadCliRunner';
import { Logger } from '../utils/logger';
import { createNonce } from '../utils/nonce';
import { findSiblingProjectFile } from '../utils/pathUtils';
import type { ExportStateStore } from '../state/stateStores';

type SchematicResolution = {
  file?: string | undefined;
  status?: string | undefined;
};

export class NetlistViewProvider
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  private readonly disposables: vscode.Disposable[] = [];
  private view?: vscode.WebviewView;
  private _refreshTimer: NodeJS.Timeout | undefined = undefined;
  private _lastFile: string | undefined = undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly parser: SExpressionParser,
    private readonly runner?: KiCadCliRunner,
    private readonly logger?: Logger,
    private readonly exportState?: ExportStateStore | undefined
  ) {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() =>
        this.scheduleRefresh(250)
      ),
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (doc.fileName.endsWith('.kicad_sch')) {
          this.scheduleRefresh(0, true);
        }
      })
    );
  }

  dispose(): void {
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = undefined;
    }
    this.disposables.forEach((item) => item.dispose());
  }

  private scheduleRefresh(delayMs: number, force = false): void {
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
    }
    this._refreshTimer = setTimeout(() => {
      this._refreshTimer = undefined;
      void this.refresh(force);
    }, delayMs);
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'media')
      ]
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);
    void this.refresh();
  }

  async refresh(force = false): Promise<void> {
    if (!this.view) {
      return;
    }
    const resolution = await this.findSchematicFile();
    const file = resolution.file;
    if (!file) {
      this._lastFile = '';
      const status =
        resolution.status ??
        'No schematic file could be resolved. Active file: none. Project file: none. Discovered schematic candidates: none. Suggested command: open a .kicad_sch file or select a KiCad project.';
      this.exportState?.complete('netlist', undefined, status);
      await this.postNetlist([], status);
      return;
    }
    if (!force && this._lastFile !== undefined && file === this._lastFile) {
      return;
    }
    this._lastFile = file;
    const uri = vscode.Uri.file(file);
    if (!this.runner) {
      this.exportState?.fail(
        'netlist',
        uri,
        'kicad-cli is not configured, so real net/node extraction is unavailable.'
      );
      await this.postNetlist(
        [],
        'kicad-cli is not configured, so real net/node extraction is unavailable.'
      );
      return;
    }
    try {
      this.exportState?.begin('netlist', uri, 'Exporting KiCad netlist.');
      await this.postNetlist(
        await this.buildNetlistFromCli(file),
        `Netlist from ${path.basename(file)}`
      );
      this.exportState?.complete(
        'netlist',
        uri,
        `Netlist loaded from ${path.basename(file)}.`
      );
    } catch (error) {
      this.exportState?.fail('netlist', uri, error);
      this.logger?.warn(
        `Netlist extraction failed: ${error instanceof Error ? error.message : String(error)}`
      );
      await this.postNetlist(
        [],
        error instanceof Error
          ? `Could not export netlist: ${error.message}`
          : 'Could not export netlist. Configure kicad-cli and try again.'
      );
    }
  }

  private async postNetlist(
    nets: NetlistNode[],
    status: string
  ): Promise<void> {
    await this.view?.webview.postMessage({
      type: 'setNetlist',
      payload: { nets, status }
    });
  }

  private async buildNetlistFromCli(file: string): Promise<NetlistNode[]> {
    const outputFile = path.join(
      os.tmpdir(),
      `kicadstudio-netlist-${Date.now()}.net`
    );
    try {
      await this.runner?.runWithProgress<string>({
        command: [
          'sch',
          'export',
          'netlist',
          '--output',
          outputFile,
          '--format',
          'kicadsexpr',
          file
        ],
        cwd: path.dirname(file),
        progressTitle: 'Exporting KiCad netlist'
      });
      const ast = this.parser.parse(fs.readFileSync(outputFile, 'utf8'));
      return this.parser
        .findAllNodes(ast, 'net')
        .map((node, index) => this.toNetlistNode(node, index))
        .filter((node): node is NetlistNode => Boolean(node));
    } finally {
      fs.rmSync(outputFile, { force: true });
    }
  }

  private toNetlistNode(net: SNode, index: number): NetlistNode | undefined {
    const netName = this.getChildAtomValue(net, 'name') || `Net-${index + 1}`;
    const nodes =
      net.children
        ?.filter((child) => this.getListTag(child) === 'node')
        .map((node) => ({
          reference: this.getChildAtomValue(node, 'ref') || '?',
          pin: this.getChildAtomValue(node, 'pin') || '?'
        })) ?? [];
    return { netName, nodes };
  }

  private getChildAtomValue(node: SNode, tag: string): string | undefined {
    const child = node.children?.find(
      (candidate) => this.getListTag(candidate) === tag
    );
    const valueNode = child?.children?.[1];
    if (
      valueNode?.type === 'string' ||
      valueNode?.type === 'atom' ||
      valueNode?.type === 'number'
    ) {
      return String(valueNode.value ?? '');
    }
    return undefined;
  }

  private getListTag(node: SNode): string | undefined {
    const first = node.children?.[0];
    if (
      node.type === 'list' &&
      (first?.type === 'atom' || first?.type === 'string')
    ) {
      return String(first.value ?? '');
    }
    return undefined;
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = createNonce();
    const template = fs.readFileSync(
      path.join(
        this.context.extensionUri.fsPath,
        'media',
        'viewer',
        'netlist.html'
      ),
      'utf8'
    );
    return template
      .replaceAll('{{cspSource}}', webview.cspSource)
      .replaceAll('{{scriptNonce}}', nonce)
      .replaceAll(
        '{{bomCssUri}}',
        webview
          .asWebviewUri(
            vscode.Uri.joinPath(
              this.context.extensionUri,
              'media',
              'styles',
              'bom.css'
            )
          )
          .toString()
      )
      .replaceAll(
        '{{scriptUri}}',
        webview
          .asWebviewUri(
            vscode.Uri.joinPath(
              this.context.extensionUri,
              'media',
              'viewer',
              'netlist.js'
            )
          )
          .toString()
      );
  }

  private async findSchematicFile(): Promise<SchematicResolution> {
    const active = vscode.window.activeTextEditor?.document;
    if (active?.fileName.endsWith('.kicad_sch')) {
      return { file: active.fileName };
    }
    const files = await vscode.workspace.findFiles(
      '**/*.kicad_sch',
      '**/node_modules/**',
      50
    );
    const candidates = files.map((file) => file.fsPath);

    // If we have a cached last file and it's still in the workspace, prefer it
    // over falling back to prompting if there are multiple candidates.
    // Except if the user specifically opened a different project.
    if (this._lastFile && candidates.includes(this._lastFile)) {
       const activeProject = this.findProjectFile(active?.fileName);
       const lastProject = this.findProjectFile(this._lastFile);
       if (!activeProject || activeProject === lastProject) {
         return { file: this._lastFile };
       }
    }

    const projectFile = this.findProjectFile(active?.fileName);
    const projectSchematic = projectFile
      ? this.findSchematicBesideProject(projectFile)
      : undefined;
    if (projectSchematic) {
      return { file: projectSchematic };
    }
    if (candidates.length === 1) {
      return { file: candidates[0] };
    }
    const rootSchematics = candidates.filter(
      (candidate) => findSiblingProjectFile(candidate) !== undefined
    );
    if (rootSchematics.length === 1) {
      return { file: rootSchematics[0] };
    }
    if (candidates.length > 1) {
      const picked = await this.pickSchematic(candidates);
      if (picked) {
        return { file: picked };
      }
    }
    return {
      status: this.describeMissingSchematic(
        active?.fileName,
        projectFile,
        candidates
      )
    };
  }

  private findProjectFile(activeFile: string | undefined): string | undefined {
    if (!activeFile) {
      return undefined;
    }
    if (activeFile.endsWith('.kicad_pro')) {
      return activeFile;
    }
    if (
      activeFile.endsWith('.kicad_pcb') ||
      activeFile.endsWith('.kicad_sch')
    ) {
      return findSiblingProjectFile(activeFile);
    }
    return undefined;
  }

  private findSchematicBesideProject(projectFile: string): string | undefined {
    const parsed = path.parse(projectFile);
    const sibling = path.join(parsed.dir, `${parsed.name}.kicad_sch`);
    return fs.existsSync(sibling) ? sibling : undefined;
  }

  private async pickSchematic(
    candidates: string[]
  ): Promise<string | undefined> {
    const picked = await vscode.window.showQuickPick(
      candidates.map((candidate) => ({
        label: path.basename(candidate),
        description: path.dirname(candidate),
        path: candidate
      })),
      {
        title: 'Select schematic for netlist',
        placeHolder: 'Multiple KiCad schematics were found.'
      }
    );
    return picked?.path;
  }

  private describeMissingSchematic(
    activeFile: string | undefined,
    projectFile: string | undefined,
    candidates: string[]
  ): string {
    const candidateText = candidates.length
      ? candidates.map((candidate) => path.basename(candidate)).join(', ')
      : 'none';
    return [
      'No schematic file could be resolved.',
      `Active file: ${activeFile ?? 'none'}.`,
      `Project file: ${projectFile ?? 'none'}.`,
      `Discovered schematic candidates: ${candidateText}.`,
      'Suggested command: open a .kicad_sch file or select a KiCad project.'
    ].join(' ');
  }
}
