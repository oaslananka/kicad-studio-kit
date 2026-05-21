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
      vscode.window.onDidChangeActiveTextEditor(() => this.scheduleRefresh(250)),
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
    const file = await this.findSchematicFile();
    if (!file) {
      this._lastFile = '';
      this.exportState?.complete('netlist', undefined, 'No schematic opened.');
      await this.postNetlist([], 'No schematic opened.');
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

  private async findSchematicFile(): Promise<string | undefined> {
    const active = vscode.window.activeTextEditor?.document;
    if (active?.fileName.endsWith('.kicad_sch')) {
      return active.fileName;
    }
    // Find all schematics and prefer ones that have a sibling .kicad_pro
    // (root schematics) over hierarchical sub-sheets.
    const files = await vscode.workspace.findFiles(
      '**/*.kicad_sch',
      '**/node_modules/**',
      50
    );
    if (files.length === 0) return undefined;
    const rootSchematic = files.find(
      (f) => findSiblingProjectFile(f.fsPath) !== undefined
    );
    return (rootSchematic ?? files[0])!.fsPath;
  }
}
