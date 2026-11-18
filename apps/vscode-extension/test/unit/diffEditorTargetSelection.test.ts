import * as vscode from 'vscode';
import { DiffEditorProvider } from '../../src/providers/diffEditorProvider';
import { window, workspace } from './vscodeMock';

describe('visual Git diff target selection', () => {
  const selected = '/workspace/selected.kicad_sch';
  const unrelated = '/workspace/other-project.kicad_sch';

  const resolve = async (resource?: vscode.Uri) => {
    const provider = new DiffEditorProvider({} as never, {} as never);
    return (
      provider as unknown as {
        resolveTarget: (resource?: vscode.Uri) => Promise<string | undefined>;
      }
    ).resolveTarget(resource);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    window.activeTextEditor = undefined;
    window.tabGroups.activeTabGroup.activeTab = undefined;
  });

  it('uses the visible custom editor URI instead of an unrelated first schematic', async () => {
    window.tabGroups.activeTabGroup.activeTab = {
      input: { uri: vscode.Uri.file(selected) }
    } as never;
    (workspace.findFiles as jest.Mock).mockResolvedValue([
      vscode.Uri.file(unrelated)
    ]);
    await expect(resolve()).resolves.toBe(selected);
    expect(workspace.findFiles).not.toHaveBeenCalled();
  });

  it('uses the visible PCB custom editor rather than a stale schematic text editor', async () => {
    const board = '/workspace/assembly.kicad_pcb';
    window.tabGroups.activeTabGroup.activeTab = {
      input: { uri: vscode.Uri.file(board) }
    } as never;
    window.activeTextEditor = {
      document: { fileName: unrelated, uri: vscode.Uri.file(unrelated) }
    } as never;
    await expect(resolve()).resolves.toBe(board);
  });

  it('keeps an explicitly selected explorer-file resource authoritative', async () => {
    window.tabGroups.activeTabGroup.activeTab = {
      input: { uri: vscode.Uri.file(selected) }
    } as never;
    await expect(resolve(vscode.Uri.file(unrelated))).resolves.toBe(unrelated);
  });

  it('falls back to workspace discovery when there is no relevant active file', async () => {
    (workspace.findFiles as jest.Mock).mockResolvedValue([
      vscode.Uri.file(unrelated)
    ]);
    await expect(resolve()).resolves.toBe(unrelated);
  });
});

describe('visual diff webview startup handshake', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('waits for the webview to register its listener before first diff payload', async () => {
    let receive: ((message: unknown) => Promise<void>) | undefined;
    let viewState:
      | ((event: { webviewPanel: { visible: boolean } }) => Promise<void>)
      | undefined;
    let listenerRegisteredBeforeHtml = false;
    const webview = {
      options: {},
      onDidReceiveMessage: jest.fn(
        (callback: (message: unknown) => Promise<void>) => {
          receive = callback;
          return { dispose: jest.fn() };
        }
      ),
      postMessage: jest.fn().mockResolvedValue(true)
    } as {
      options: object;
      html?: string;
      onDidReceiveMessage: jest.Mock;
      postMessage: jest.Mock;
    };
    Object.defineProperty(webview, 'html', {
      configurable: true,
      set() {
        listenerRegisteredBeforeHtml = Boolean(receive);
      }
    });
    const panel = {
      webview,
      onDidDispose: jest.fn(() => ({ dispose: jest.fn() })),
      onDidChangeViewState: jest.fn(
        (
          callback: (event: {
            webviewPanel: { visible: boolean };
          }) => Promise<void>
        ) => {
          viewState = callback;
          return { dispose: jest.fn() };
        }
      ),
      reveal: jest.fn()
    };
    (window.createWebviewPanel as jest.Mock).mockReturnValue(panel);
    const provider = new DiffEditorProvider(
      { extensionUri: vscode.Uri.file('/extension') } as never,
      {} as never
    );
    const internal = provider as unknown as {
      buildHtml: (webview: vscode.Webview) => string;
      postDiffContent: (webview: vscode.Webview, file: string) => Promise<void>;
    };
    jest.spyOn(internal, 'buildHtml').mockReturnValue('<html>Diff</html>');
    const sendContent = jest
      .spyOn(internal, 'postDiffContent')
      .mockResolvedValue(undefined);

    const selected = '/workspace/active.kicad_sch';
    await provider.show(vscode.Uri.file(selected));
    expect(listenerRegisteredBeforeHtml).toBe(true);
    expect(sendContent).not.toHaveBeenCalled();
    expect(receive).toEqual(expect.any(Function));
    expect(viewState).toEqual(expect.any(Function));
    await viewState?.({ webviewPanel: { visible: true } });
    expect(sendContent).not.toHaveBeenCalled();

    await receive?.({ type: 'ready' });
    expect(sendContent).toHaveBeenCalledTimes(1);
    expect(sendContent).toHaveBeenCalledWith(webview, selected);
    await receive?.({ type: 'ready' });
    expect(sendContent).toHaveBeenCalledTimes(1);
    await viewState?.({ webviewPanel: { visible: true } });
    expect(sendContent).toHaveBeenCalledTimes(2);
  });
});
