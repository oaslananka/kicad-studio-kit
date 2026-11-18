import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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

describe('visual diff revisions and user-visible payloads', () => {
  let dir: string;
  let root: string;
  let child: string;
  let send: jest.Mock;

  const mainText =
    '(kicad_sch (version 20250114) (sheet (property "Sheetfile" "sub/child.kicad_sch")))';

  beforeEach(() => {
    jest.clearAllMocks();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-real-diff-'));
    fs.mkdirSync(path.join(dir, 'sub'));
    root = path.join(dir, 'board.kicad_sch');
    child = path.join(dir, 'sub', 'child.kicad_sch');
    fs.writeFileSync(root, mainText);
    fs.writeFileSync(child, '(kicad_sch (version 20250114) (text "child"))');
    send = jest.fn().mockResolvedValue(true);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function deliver(
    filename: string,
    loadVersions: (file: string) => { beforeText: string; afterText: string },
    components: Array<{ type: string; reference: string }> = []
  ) {
    const detector = {
      readFileVersions: jest.fn(loadVersions),
      getChangedComponents: jest.fn().mockResolvedValue(components)
    };
    const provider = new DiffEditorProvider({} as never, detector as never);
    const writer = provider as unknown as {
      postDiffContent: (
        webview: vscode.Webview,
        filePath: string
      ) => Promise<void>;
    };
    await writer.postDiffContent({ postMessage: send } as never, filename);
    return { detector, messages: send.mock.calls.map((args) => args[0]) };
  }

  it('sends independently versioned children and all three real diff counters', async () => {
    const versions = (file: string) => {
      if (file === root) {
        return { beforeText: mainText, afterText: mainText };
      }
      expect(file).toBe(fs.realpathSync(child));
      return {
        beforeText: '(kicad_sch (version 20250114) (text "before change"))',
        afterText: '(kicad_sch (version 20250114) (text "after change"))'
      };
    };
    const outcome = await deliver(root, versions, [
      { type: 'added', reference: 'R1' },
      { type: 'removed', reference: 'C1' },
      { type: 'changed', reference: 'U1' }
    ]);
    expect(outcome.messages.map((m) => m.type)).toEqual(['loading', 'setDiff']);
    const payload = outcome.messages[1].payload;
    expect(payload.summary).toContain('1 added, 1 removed, 1 changed');
    expect(payload.fileName).toBe('board.kicad_sch');
    expect(payload.fileType).toBe('schematic');
    expect(payload.subSheets.before[0].name).toBe('sub/child.kicad_sch');
    expect(payload.subSheets.after[0].name).toBe('sub/child.kicad_sch');
    const head = Buffer.from(
      payload.subSheets.before[0].base64,
      'base64'
    ).toString('utf8');
    const working = Buffer.from(
      payload.subSheets.after[0].base64,
      'base64'
    ).toString('utf8');
    expect(head).toContain('before change');
    expect(working).toContain('after change');
    expect(outcome.detector.readFileVersions).toHaveBeenCalledTimes(3);
    expect(outcome.detector.getChangedComponents).toHaveBeenCalledWith(root);
  });

  it('keeps a PCB revision free of schematic child lookup', async () => {
    const pcb = path.join(dir, 'board.kicad_pcb');
    fs.writeFileSync(pcb, '(kicad_pcb (version 20250114))');
    const outcome = await deliver(
      pcb,
      () => ({
        beforeText: '(kicad_pcb (version 20250114))',
        afterText: '(kicad_pcb (version 20250114) (net 1 "GND"))'
      }),
      [{ type: 'added', reference: 'J1' }]
    );
    const payload = outcome.messages[1].payload;
    expect(payload.subSheets).toEqual({ before: [], after: [] });
    expect(payload.fileType).toBe('board');
    expect(payload.summary).toContain('1 added, 0 removed, 0 changed');
    expect(outcome.detector.readFileVersions).toHaveBeenCalledTimes(1);
  });

  it('shows a meaningful error instead of silently dropping missing Git child revisions', async () => {
    const outcome = await deliver(root, (file: string) => {
      if (file === root) return { beforeText: mainText, afterText: mainText };
      return { beforeText: '', afterText: '' };
    });
    expect(outcome.messages.map((m) => m.type)).toEqual(['loading', 'error']);
    expect(outcome.messages[1].payload.message).toContain(
      'referenced schematic sheet is missing in the selected Git revision'
    );
  });

  it('reports a detector failure and does not display a false successful comparison', async () => {
    const outcome = await deliver(root, () => {
      throw new Error('Git HEAD cannot be read');
    });
    expect(outcome.messages.map((m) => m.type)).toEqual(['loading', 'error']);
    expect(outcome.messages[1].payload.message).toContain(
      'Git HEAD cannot be read'
    );
  });

  it('treats an untracked empty HEAD as an absent revision instead of reading child sheets', async () => {
    const outcome = await deliver(root, () => ({
      beforeText: '',
      afterText: '(kicad_sch (version 20250114))'
    }));
    expect(outcome.messages.map((m) => m.type)).toEqual(['loading', 'setDiff']);
    expect(outcome.messages[1].payload.subSheets).toEqual({
      before: [],
      after: []
    });
  });
});
