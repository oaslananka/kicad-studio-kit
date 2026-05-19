import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { NetlistNode } from '../types';
import { SExpressionParser, type SNode } from '../language/sExpressionParser';
import { KiCadCliRunner } from '../cli/kicadCliRunner';
import { Logger } from '../utils/logger';
import { createNonce } from '../utils/nonce';

export class NetlistViewProvider
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  private readonly disposables: vscode.Disposable[] = [];
  private view?: vscode.WebviewView;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly parser: SExpressionParser,
    private readonly runner?: KiCadCliRunner,
    private readonly logger?: Logger
  ) {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => void this.refresh()),
      vscode.workspace.onDidSaveTextDocument(() => void this.refresh())
    );
  }

  dispose(): void {
    this.disposables.forEach((item) => item.dispose());
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

  async refresh(): Promise<void> {
    if (!this.view) {
      return;
    }
    const file = await this.findSchematicFile();
    if (!file) {
      await this.postNetlist([], 'No schematic opened.');
      return;
    }
    if (!this.runner) {
      await this.postNetlist(
        [],
        'kicad-cli is not configured, so real net/node extraction is unavailable.'
      );
      return;
    }
    try {
      await this.postNetlist(
        await this.buildNetlistFromCli(file),
        `Netlist from ${path.basename(file)}`
      );
    } catch (error) {
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
    const files = await vscode.workspace.findFiles(
      '**/*.kicad_sch',
      '**/node_modules/**',
      1
    );
    return files[0]?.fsPath;
  }
}
