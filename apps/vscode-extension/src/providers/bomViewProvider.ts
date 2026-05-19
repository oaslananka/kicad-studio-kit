import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { BomExporter } from '../bom/bomExporter';
import { BomParser } from '../bom/bomParser';
import { BomWebviewManager } from '../bom/bomWebviewManager';
import { SExpressionParser } from '../language/sExpressionParser';
import { readTextFileSync } from '../utils/fileUtils';
import { asRecord, asString, hasType } from '../utils/webviewMessages';
import { createNonce } from '../utils/nonce';

export class BomViewProvider
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  private readonly manager = new BomWebviewManager();
  private readonly bomParser: BomParser;
  private readonly bomExporter = new BomExporter();
  private readonly disposables: vscode.Disposable[] = [];
  private currentFile?: string;
  /** URI of the last schematic opened in the custom viewer (webview panel). */
  private _lastViewedSchematicUri?: vscode.Uri;

  constructor(
    private readonly context: vscode.ExtensionContext,
    parser: SExpressionParser
  ) {
    this.bomParser = new BomParser(parser);
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => void this.refresh()),
      vscode.workspace.onDidSaveTextDocument(() => void this.refresh())
    );
  }

  dispose(): void {
    this.disposables.forEach((item) => item.dispose());
  }

  /**
   * Called by the schematic viewer's onDidActivate event when a
   * `.kicad_sch` file is opened or brought to focus in the custom editor.
   * Triggers a BOM refresh for the newly active schematic.
   */
  setSchematicUri(uri: vscode.Uri): void {
    this._lastViewedSchematicUri = uri;
    void this.refresh();
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.manager.attach(webviewView);
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'media')
      ]
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!hasType(message, ['exportCsv', 'exportXlsx', 'rowSelected'])) {
        return;
      }
      if (message.type === 'exportCsv') {
        await vscode.commands.executeCommand(COMMANDS.exportBOMCSV);
      }
      if (message.type === 'exportXlsx') {
        await vscode.commands.executeCommand(COMMANDS.exportBOMXLSX);
      }
      if (message.type === 'rowSelected') {
        const payload = asRecord(message.payload);
        const reference = asString(payload?.['reference']);
        if (reference) {
          await this.revealReference(reference);
        }
      }
    });
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const file = await this.findSchematicFile();
    if (!file) {
      this.manager.setStatus('No schematic opened.');
      return;
    }
    this.manager.setLoading();
    this.currentFile = file;
    const entries = this.bomParser.parse(readTextFileSync(file));
    this.manager.setEntries(entries);
  }

  async exportJsonForCurrentFile(): Promise<string | undefined> {
    if (!this.currentFile) {
      return undefined;
    }
    const outputFile = path.join(
      path.dirname(this.currentFile),
      'fab',
      `${path.parse(this.currentFile).name}-bom.json`
    );
    const entries = this.bomParser.parse(readTextFileSync(this.currentFile));
    return this.bomExporter.exportJson(entries, outputFile);
  }

  private async revealReference(reference: string): Promise<void> {
    const file = await this.findSchematicFile();
    if (!file) {
      return;
    }
    const document = await vscode.workspace.openTextDocument(file);
    const editor = await vscode.window.showTextDocument(document, {
      preview: false
    });
    const escapedReference = reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`"${escapedReference}"`);
    const match = pattern.exec(document.getText());
    if (match) {
      const start = document.positionAt(match.index);
      const end = document.positionAt(match.index + match[0].length);
      editor.selection = new vscode.Selection(start, end);
      editor.revealRange(
        new vscode.Range(start, end),
        vscode.TextEditorRevealType.InCenter
      );
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = createNonce();
    const template = fs.readFileSync(
      path.join(
        this.context.extensionUri.fsPath,
        'media',
        'viewer',
        'bom.html'
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
              'bom.js'
            )
          )
          .toString()
      );
  }

  private async findSchematicFile(): Promise<string | undefined> {
    // 1. Active text editor (highest priority — user is editing the file directly).
    const active = vscode.window.activeTextEditor?.document;
    if (active?.fileName.endsWith('.kicad_sch')) {
      return active.fileName;
    }
    // 2. Schematic viewer webview panel — set via setSchematicUri() from the
    //    SchematicEditorProvider.onDidActivate event.
    if (this._lastViewedSchematicUri) {
      return this._lastViewedSchematicUri.fsPath;
    }
    // 3. Fallback: first .kicad_sch file found in the workspace.
    const files = await vscode.workspace.findFiles(
      '**/*.kicad_sch',
      '**/node_modules/**',
      1
    );
    return files[0]?.fsPath;
  }
}
