import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { BomViewProvider } from '../../src/providers/bomViewProvider';
import { SExpressionParser } from '../../src/language/sExpressionParser';
import { ProjectStateStore } from '../../src/state/projectStateStore';
import type { ProjectContext } from '../../src/types';
import {
  Uri,
  createExtensionContextMock,
  window,
  workspace
} from './vscodeMock';

jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});

function writeProject(
  root: string,
  name: string,
  reference: string
): ProjectContext {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  const projectFile = path.join(dir, name + '.kicad_pro');
  fs.writeFileSync(projectFile, '{}');
  fs.writeFileSync(
    path.join(dir, name + '.kicad_sch'),
    '(kicad_sch (symbol (property "Reference" "' +
      reference +
      '") (property "Value" "10k") (property "Footprint" "R_0603")))'
  );
  return { id: name, name, rootPath: dir, projectFile, workspaceFolder: root };
}

function viewHarness() {
  let receive: ((message: unknown) => void) | undefined;
  const postMessage = jest.fn().mockResolvedValue(true);
  const webview = {
    options: {},
    html: '',
    cspSource: 'vscode-resource:',
    asWebviewUri: (uri: unknown) => uri,
    postMessage,
    onDidReceiveMessage: jest.fn((handler: (message: unknown) => void) => {
      receive = handler;
      return { dispose: jest.fn() };
    })
  };
  return {
    view: { webview } as unknown as vscode.WebviewView,
    postMessage,
    receive: (message: unknown) => receive?.(message)
  };
}

describe('BomViewProvider project identity and readiness', () => {
  let tempRoot: string;
  let projectState: ProjectStateStore;
  let provider: BomViewProvider;
  let alpha: ProjectContext;
  let beta: ProjectContext;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kicad-bom-active-'));
    alpha = writeProject(tempRoot, 'alpha', 'R1');
    beta = writeProject(tempRoot, 'beta', 'C9');
    projectState = new ProjectStateStore();
    (projectState.onDidChange as jest.Mock).mockImplementation(() => ({
      dispose: jest.fn()
    }));
    projectState.update({
      projects: [alpha, beta],
      activeProject: alpha,
      hasProject: true
    });
    (workspace.findFiles as jest.Mock)
      .mockReset()
      .mockResolvedValue([
        Uri.file(path.join(alpha.rootPath, 'alpha.kicad_sch'))
      ]);
    window.activeTextEditor = undefined;
    const context = {
      ...createExtensionContextMock(),
      extensionUri: Uri.file(process.cwd())
    } as unknown as vscode.ExtensionContext;
    // The fourth argument is intentionally exercised before implementation.
    const WithProjectState = BomViewProvider as unknown as new (
      context: vscode.ExtensionContext,
      parser: SExpressionParser,
      exportState: undefined,
      projects: ProjectStateStore
    ) => BomViewProvider;
    provider = new WithProjectState(
      context,
      new SExpressionParser(),
      undefined,
      projectState
    );
  });

  afterEach(() => {
    provider.dispose();
    projectState.dispose();
    window.activeTextEditor = undefined;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('uses the explicitly selected project instead of the last-viewed or first workspace schematic', async () => {
    const harness = viewHarness();
    provider.resolveWebviewView(harness.view);

    provider.setSchematicUri(
      Uri.file(path.join(alpha.rootPath, 'alpha.kicad_sch')) as never
    );
    window.activeTextEditor = {
      document: { fileName: path.join(alpha.rootPath, 'alpha.kicad_sch') }
    } as never;
    projectState.update({ activeProject: beta });

    await provider.refresh();
    const messages = harness.postMessage.mock.calls
      .map(([message]) => message)
      .filter((message) => message.type === 'setData');
    const last = messages.at(-1);
    expect(last?.payload?.entries).toEqual([
      expect.objectContaining({ references: ['C9'] })
    ]);
  });

  it('uses visual cross-probing instead of opening the schematic source text', async () => {
    provider.dispose();
    const focus = jest.fn(async () => true);
    const context = {
      ...createExtensionContextMock(),
      extensionUri: Uri.file(process.cwd())
    } as unknown as vscode.ExtensionContext;
    const WithViewerFocus = BomViewProvider as unknown as new (
      context: vscode.ExtensionContext,
      parser: SExpressionParser,
      exportState: undefined,
      projects: ProjectStateStore,
      focus: (uri: vscode.Uri, reference: string) => Promise<boolean>
    ) => BomViewProvider;
    provider = new WithViewerFocus(
      context,
      new SExpressionParser(),
      undefined,
      projectState,
      focus
    );
    const harness = viewHarness();
    provider.resolveWebviewView(harness.view);
    await provider.refresh();
    (workspace.openTextDocument as jest.Mock).mockClear();
    harness.receive({ type: 'rowSelected', payload: { reference: 'R1' } });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(focus).toHaveBeenCalledWith(
      expect.objectContaining({
        fsPath: path.join(alpha.rootPath, 'alpha.kicad_sch')
      }),
      'R1'
    );
    expect(workspace.openTextDocument).not.toHaveBeenCalled();
  });

  it('resends current BOM state when the webview script announces readiness', async () => {
    const harness = viewHarness();
    provider.resolveWebviewView(harness.view);
    await provider.refresh();
    harness.postMessage.mockClear();

    harness.receive({ type: 'ready' });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(harness.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'setData' })
    );
  });
});
