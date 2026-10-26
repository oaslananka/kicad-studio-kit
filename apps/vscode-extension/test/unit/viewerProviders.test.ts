import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SchematicEditorProvider } from '../../src/providers/schematicEditorProvider';
import { PcbEditorProvider } from '../../src/providers/pcbEditorProvider';
import { ViewerStateStore } from '../../src/state/stateStores';
import {
  __setConfiguration,
  createExtensionContextMock,
  window,
  workspace
} from './vscodeMock';

type ProviderCtor = new (
  context: vscode.ExtensionContext,
  svgFallbackProvider?: (uri: vscode.Uri) => Promise<string | undefined>
) => {
  resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void>;
  dispose(): void;
};

function createPanel() {
  const webview = {
    html: '',
    cspSource: 'vscode-resource:',
    options: undefined,
    postMessage: jest.fn().mockResolvedValue(true),
    onDidReceiveMessage: jest.fn((callback: (message: unknown) => void) => {
      (
        webview as { receiveMessage?: (message: unknown) => void }
      ).receiveMessage = callback;
      return { dispose: jest.fn() };
    }),
    asWebviewUri: jest.fn((value) => value)
  };

  let disposeCallback: (() => void) | undefined;
  let viewStateCallback:
    ((event: { webviewPanel: unknown }) => void) | undefined;
  const panel = {
    webview,
    onDidDispose: jest.fn((callback: () => void) => {
      disposeCallback = callback;
      return { dispose: jest.fn() };
    }),
    onDidChangeViewState: jest.fn(
      (callback: (event: { webviewPanel: unknown }) => void) => {
        viewStateCallback = callback;
        return { dispose: jest.fn() };
      }
    ),
    visible: true,
    reveal: jest.fn(),
    fireViewState: () => viewStateCallback?.({ webviewPanel: panel }),
    fireDispose: () => disposeCallback?.(),
    fireMessage: (message: unknown) =>
      (
        webview as { receiveMessage?: (message: unknown) => unknown }
      ).receiveMessage?.(message)
  };

  return panel;
}

describe.each([
  [
    'schematic',
    SchematicEditorProvider,
    '.kicad_sch',
    '(kicad_sch (symbol "R1"))'
  ],
  ['pcb', PcbEditorProvider, '.kicad_pcb', '(kicad_pcb (footprint "R1"))']
])('%s viewer provider', (_label, Provider, extension, sourceText) => {
  const ContextProvider = Provider as ProviderCtor;
  let tempFile: string;

  beforeEach(() => {
    jest.useFakeTimers();
    __setConfiguration({
      'kicadstudio.viewer.autoRefresh': true
    });
    tempFile = path.join(os.tmpdir(), `kicadstudio-${Date.now()}${extension}`);
    fs.writeFileSync(tempFile, sourceText, 'utf8');
    (workspace.fs.readFile as jest.Mock).mockReset();
    (workspace.fs.readFile as jest.Mock).mockResolvedValue(
      Buffer.from(sourceText, 'utf8')
    );
    (workspace.fs.stat as jest.Mock).mockReset();
    (workspace.fs.stat as jest.Mock).mockResolvedValue({
      size: Buffer.byteLength(sourceText),
      ctime: 0,
      mtime: 0,
      type: 1
    });
    (workspace.fs.writeFile as jest.Mock).mockReset();
    (window.showSaveDialog as jest.Mock).mockReset();
    (window.showErrorMessage as jest.Mock).mockReset();
    (workspace.onDidSaveTextDocument as jest.Mock).mockClear();
    (workspace.createFileSystemWatcher as jest.Mock).mockReset();
    (workspace.createFileSystemWatcher as jest.Mock).mockImplementation(() => ({
      onDidChange: jest.fn(() => ({ dispose: jest.fn() })),
      onDidCreate: jest.fn(() => ({ dispose: jest.fn() })),
      onDidDelete: jest.fn(() => ({ dispose: jest.fn() })),
      dispose: jest.fn()
    }));
    workspace.textDocuments.length = 0;
  });

  afterEach(() => {
    jest.useRealTimers();
    fs.rmSync(tempFile, { force: true });
  });

  it('writes HTML on initial load', async () => {
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    const panel = createPanel();
    const document = {
      uri: vscode.Uri.file(tempFile)
    } as vscode.CustomDocument;

    await provider.resolveCustomEditor(
      document,
      panel as unknown as vscode.WebviewPanel
    );

    expect(panel.webview.html).toContain('Opening interactive renderer...');
    expect(panel.webview.html).toContain('kicanvas-source');
  });

  it('watches open viewer files only and disposes the watcher when the last panel closes (#849)', async () => {
    const watcher = {
      onDidChange: jest.fn(() => ({ dispose: jest.fn() })),
      onDidCreate: jest.fn(() => ({ dispose: jest.fn() })),
      onDidDelete: jest.fn(() => ({ dispose: jest.fn() })),
      dispose: jest.fn()
    };
    (workspace.createFileSystemWatcher as jest.Mock).mockReturnValue(watcher);
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    expect(workspace.createFileSystemWatcher).not.toHaveBeenCalled();
    const panel = createPanel();
    const document = {
      uri: vscode.Uri.file(tempFile)
    } as vscode.CustomDocument;
    await provider.resolveCustomEditor(
      document,
      panel as unknown as vscode.WebviewPanel
    );
    expect(workspace.createFileSystemWatcher).toHaveBeenCalledWith(
      `**/*${extension}`
    );
    panel.fireDispose();
    expect(watcher.dispose).toHaveBeenCalledTimes(1);
    provider.dispose();
  });

  it('coalesces a burst of external updates to one redraw and ignores unchanged events (#849)', async () => {
    let changed: ((uri: vscode.Uri) => void) | undefined;
    const watcher = {
      onDidChange: jest.fn((callback: (uri: vscode.Uri) => void) => {
        changed = callback;
        return { dispose: jest.fn() };
      }),
      onDidCreate: jest.fn(() => ({ dispose: jest.fn() })),
      onDidDelete: jest.fn(() => ({ dispose: jest.fn() })),
      dispose: jest.fn()
    };
    (workspace.createFileSystemWatcher as jest.Mock).mockReturnValue(watcher);
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    const panel = createPanel();
    const uri = vscode.Uri.file(tempFile);
    await provider.resolveCustomEditor(
      { uri } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel
    );

    const next = `${sourceText} (updated)`;
    (workspace.fs.stat as jest.Mock).mockResolvedValue({
      size: Buffer.byteLength(next),
      mtime: 42,
      ctime: 0,
      type: 1
    });
    (workspace.fs.readFile as jest.Mock).mockResolvedValue(Buffer.from(next));
    for (let i = 0; i < 25; i++) changed?.(uri);
    await jest.advanceTimersByTimeAsync(760);
    expect(panel.webview.postMessage).toHaveBeenCalledTimes(1);
    expect(workspace.fs.readFile).toHaveBeenCalledTimes(2);

    changed?.(uri);
    await jest.advanceTimersByTimeAsync(760);
    expect(panel.webview.postMessage).toHaveBeenCalledTimes(1);
    expect(workspace.fs.readFile).toHaveBeenCalledTimes(2);
    provider.dispose();
  });

  it('defers hidden viewers and refreshes only when visible again (#849)', async () => {
    let changed: ((uri: vscode.Uri) => void) | undefined;
    (workspace.createFileSystemWatcher as jest.Mock).mockImplementation(() => ({
      onDidChange: (callback: (uri: vscode.Uri) => void) => {
        changed = callback;
        return { dispose: jest.fn() };
      },
      onDidCreate: jest.fn(() => ({ dispose: jest.fn() })),
      onDidDelete: jest.fn(() => ({ dispose: jest.fn() })),
      dispose: jest.fn()
    }));
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    const panel = createPanel();
    const uri = vscode.Uri.file(tempFile);
    await provider.resolveCustomEditor(
      { uri } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel
    );
    panel.visible = false;
    (workspace.fs.stat as jest.Mock).mockResolvedValue({
      size: 1234,
      mtime: 7,
      ctime: 0,
      type: 1
    });
    changed?.(uri);
    await jest.advanceTimersByTimeAsync(600);
    expect(panel.webview.postMessage).not.toHaveBeenCalled();
    expect(workspace.fs.readFile).toHaveBeenCalledTimes(1);
    panel.visible = true;
    panel.fireViewState();
    await jest.advanceTimersByTimeAsync(165);
    expect(panel.webview.postMessage).toHaveBeenCalledTimes(1);
    provider.dispose();
  });

  it('keeps the previous render when a text editor has unsaved content (#849)', async () => {
    let changed: ((uri: vscode.Uri) => void) | undefined;
    (workspace.createFileSystemWatcher as jest.Mock).mockImplementation(() => ({
      onDidChange: (callback: (uri: vscode.Uri) => void) => {
        changed = callback;
        return { dispose: jest.fn() };
      },
      onDidCreate: jest.fn(() => ({ dispose: jest.fn() })),
      onDidDelete: jest.fn(() => ({ dispose: jest.fn() })),
      dispose: jest.fn()
    }));
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    const panel = createPanel();
    const uri = vscode.Uri.file(tempFile);
    await provider.resolveCustomEditor(
      { uri } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel
    );
    workspace.textDocuments.push({ uri, isDirty: true });
    (workspace.fs.stat as jest.Mock).mockResolvedValue({
      size: 1234,
      mtime: 8,
      ctime: 0,
      type: 1
    });
    changed?.(uri);
    await jest.advanceTimersByTimeAsync(600);
    expect(panel.webview.postMessage).not.toHaveBeenCalled();
    workspace.textDocuments[0]!.isDirty = false;
    const onSave = (workspace.onDidSaveTextDocument as jest.Mock).mock.calls.at(
      -1
    )?.[0];
    expect(onSave).toBeDefined();
    onSave({ uri, fileName: tempFile });
    await jest.advanceTimersByTimeAsync(760);
    expect(panel.webview.postMessage).toHaveBeenCalledTimes(1);
    workspace.textDocuments.length = 0;
    provider.dispose();
  });

  it('retains the last good image during incomplete writes and recovers on atomic replacement (#849)', async () => {
    let changed: ((uri: vscode.Uri) => void) | undefined;
    let created: ((uri: vscode.Uri) => void) | undefined;
    (workspace.createFileSystemWatcher as jest.Mock).mockImplementation(() => ({
      onDidChange: (callback: (uri: vscode.Uri) => void) => {
        changed = callback;
        return { dispose: jest.fn() };
      },
      onDidCreate: (callback: (uri: vscode.Uri) => void) => {
        created = callback;
        return { dispose: jest.fn() };
      },
      onDidDelete: jest.fn(() => ({ dispose: jest.fn() })),
      dispose: jest.fn()
    }));
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    const panel = createPanel();
    const uri = vscode.Uri.file(tempFile);
    await provider.resolveCustomEditor(
      { uri } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel
    );
    (workspace.fs.stat as jest.Mock).mockResolvedValue({
      size: 15,
      mtime: 10,
      ctime: 0,
      type: 1
    });
    (workspace.fs.readFile as jest.Mock).mockResolvedValue(
      Buffer.from(`(kicad_${_label === 'pcb' ? 'pcb' : 'sch'} (footprint`)
    );
    changed?.(uri);
    await jest.advanceTimersByTimeAsync(770);
    expect(panel.webview.postMessage).not.toHaveBeenCalled();

    const next = sourceText.replace('R1', 'R2');
    (workspace.fs.stat as jest.Mock).mockResolvedValue({
      size: Buffer.byteLength(next),
      mtime: 11,
      ctime: 0,
      type: 1
    });
    (workspace.fs.readFile as jest.Mock).mockResolvedValue(Buffer.from(next));
    created?.(uri);
    await jest.advanceTimersByTimeAsync(770);
    expect(panel.webview.postMessage).toHaveBeenCalledTimes(1);
    provider.dispose();
  });

  it('waits for stable file metadata rather than rendering an in-progress write (#849)', async () => {
    let changed: ((uri: vscode.Uri) => void) | undefined;
    (workspace.createFileSystemWatcher as jest.Mock).mockImplementation(() => ({
      onDidChange: (callback: (uri: vscode.Uri) => void) => {
        changed = callback;
        return { dispose: jest.fn() };
      },
      onDidCreate: jest.fn(() => ({ dispose: jest.fn() })),
      onDidDelete: jest.fn(() => ({ dispose: jest.fn() })),
      dispose: jest.fn()
    }));
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    const panel = createPanel();
    const uri = vscode.Uri.file(tempFile);
    await provider.resolveCustomEditor(
      { uri } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel
    );
    let statCalls = 0;
    (workspace.fs.stat as jest.Mock).mockImplementation(async () => {
      statCalls++;
      return { size: 20, mtime: statCalls === 1 ? 10 : 11, ctime: 0, type: 1 };
    });
    changed?.(uri);
    await jest.advanceTimersByTimeAsync(590);
    expect(panel.webview.postMessage).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(760);
    expect(panel.webview.postMessage).toHaveBeenCalledTimes(1);
    expect(statCalls).toBeGreaterThanOrEqual(4);
    provider.dispose();
  });

  it('disables external file redraw when autoRefresh is false (#849)', async () => {
    let changed: ((uri: vscode.Uri) => void) | undefined;
    (workspace.createFileSystemWatcher as jest.Mock).mockImplementation(() => ({
      onDidChange: (callback: (uri: vscode.Uri) => void) => {
        changed = callback;
        return { dispose: jest.fn() };
      },
      onDidCreate: jest.fn(() => ({ dispose: jest.fn() })),
      onDidDelete: jest.fn(() => ({ dispose: jest.fn() })),
      dispose: jest.fn()
    }));
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    const panel = createPanel();
    const uri = vscode.Uri.file(tempFile);
    await provider.resolveCustomEditor(
      { uri } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel
    );
    __setConfiguration({ 'kicadstudio.viewer.autoRefresh': false });
    (workspace.fs.stat as jest.Mock).mockResolvedValue({
      size: 100,
      mtime: 44,
      ctime: 0,
      type: 1
    });
    changed?.(uri);
    await jest.advanceTimersByTimeAsync(40);
    expect(panel.webview.postMessage).not.toHaveBeenCalled();
    expect(workspace.fs.readFile).toHaveBeenCalledTimes(1);
    provider.dispose();
  });

  it('does not redraw on delete and can recover when a file is recreated (#849)', async () => {
    let deleted: ((uri: vscode.Uri) => void) | undefined;
    let created: ((uri: vscode.Uri) => void) | undefined;
    (workspace.createFileSystemWatcher as jest.Mock).mockImplementation(() => ({
      onDidChange: jest.fn(() => ({ dispose: jest.fn() })),
      onDidCreate: (callback: (uri: vscode.Uri) => void) => {
        created = callback;
        return { dispose: jest.fn() };
      },
      onDidDelete: (callback: (uri: vscode.Uri) => void) => {
        deleted = callback;
        return { dispose: jest.fn() };
      },
      dispose: jest.fn()
    }));
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    const panel = createPanel();
    const uri = vscode.Uri.file(tempFile);
    await provider.resolveCustomEditor(
      { uri } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel
    );
    (workspace.fs.stat as jest.Mock).mockRejectedValue(new Error('missing'));
    deleted?.(uri);
    await jest.advanceTimersByTimeAsync(760);
    expect(panel.webview.postMessage).not.toHaveBeenCalled();

    const updated = sourceText.replace('R1', 'R8');
    (workspace.fs.stat as jest.Mock).mockResolvedValue({
      size: Buffer.byteLength(updated),
      mtime: 77,
      ctime: 0,
      type: 1
    });
    (workspace.fs.readFile as jest.Mock).mockResolvedValue(
      Buffer.from(updated)
    );
    created?.(uri);
    await jest.advanceTimersByTimeAsync(760);
    expect(panel.webview.postMessage).toHaveBeenCalledTimes(1);
    provider.dispose();
  });

  it('keeps the shared file watcher until all same-type panels close (#849)', async () => {
    const watcher = {
      onDidChange: jest.fn(() => ({ dispose: jest.fn() })),
      onDidCreate: jest.fn(() => ({ dispose: jest.fn() })),
      onDidDelete: jest.fn(() => ({ dispose: jest.fn() })),
      dispose: jest.fn()
    };
    (workspace.createFileSystemWatcher as jest.Mock).mockReturnValue(watcher);
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    const first = createPanel();
    const second = createPanel();
    const uri = vscode.Uri.file(tempFile);
    await provider.resolveCustomEditor(
      { uri } as vscode.CustomDocument,
      first as unknown as vscode.WebviewPanel
    );
    await provider.resolveCustomEditor(
      { uri } as vscode.CustomDocument,
      second as unknown as vscode.WebviewPanel
    );
    expect(workspace.createFileSystemWatcher).toHaveBeenCalledTimes(1);
    first.fireDispose();
    expect(watcher.dispose).not.toHaveBeenCalled();
    second.fireDispose();
    expect(watcher.dispose).toHaveBeenCalledTimes(1);
    provider.dispose();
  });

  it('ignores file events unrelated to a currently opened viewer (#849)', async () => {
    let changed: ((uri: vscode.Uri) => void) | undefined;
    (workspace.createFileSystemWatcher as jest.Mock).mockImplementation(() => ({
      onDidChange: (callback: (uri: vscode.Uri) => void) => {
        changed = callback;
        return { dispose: jest.fn() };
      },
      onDidCreate: jest.fn(() => ({ dispose: jest.fn() })),
      onDidDelete: jest.fn(() => ({ dispose: jest.fn() })),
      dispose: jest.fn()
    }));
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    const panel = createPanel();
    await provider.resolveCustomEditor(
      { uri: vscode.Uri.file(tempFile) } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel
    );
    changed?.(vscode.Uri.file(tempFile + '.unrelated'));
    await jest.advanceTimersByTimeAsync(35);
    expect(panel.webview.postMessage).not.toHaveBeenCalled();
    provider.dispose();
  });

  it('checks disk metadata on focus to recover missed remote watcher events (#849)', async () => {
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    const panel = createPanel();
    const uri = vscode.Uri.file(tempFile);
    await provider.resolveCustomEditor(
      { uri } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel
    );
    panel.visible = false;
    panel.visible = true;
    panel.fireViewState();
    await jest.advanceTimersByTimeAsync(30);
    expect(panel.webview.postMessage).not.toHaveBeenCalled();
    (workspace.fs.stat as jest.Mock).mockResolvedValue({
      size: 999,
      mtime: 9,
      ctime: 0,
      type: 1
    });
    panel.fireViewState();
    await jest.advanceTimersByTimeAsync(760);
    expect(panel.webview.postMessage).toHaveBeenCalledTimes(1);
    provider.dispose();
  });

  it('does not launch concurrent viewer redraws for the same document (#849)', async () => {
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    const panel = createPanel();
    const uri = vscode.Uri.file(tempFile);
    await provider.resolveCustomEditor(
      { uri } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel
    );

    const first = (provider as any).refreshDocument(uri);
    const second = (provider as any).refreshDocument(uri);
    await Promise.all([first, second]);
    expect(panel.webview.postMessage).toHaveBeenCalledTimes(1);
    provider.dispose();
  });

  it('does not probe files on focus while auto-refresh is disabled (#849)', async () => {
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    const panel = createPanel();
    const uri = vscode.Uri.file(tempFile);
    await provider.resolveCustomEditor(
      { uri } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel
    );
    (workspace.fs.stat as jest.Mock).mockClear();
    __setConfiguration({ 'kicadstudio.viewer.autoRefresh': false });
    await (provider as any).checkForChangesOnFocus(uri);
    expect(workspace.fs.stat).not.toHaveBeenCalled();
    provider.dispose();
  });

  it('retains the last image when the source disappears during a focus check (#849)', async () => {
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    const panel = createPanel();
    const uri = vscode.Uri.file(tempFile);
    await provider.resolveCustomEditor(
      { uri } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel
    );
    (workspace.fs.stat as jest.Mock).mockRejectedValueOnce(
      new Error('not found')
    );
    await (provider as any).checkForChangesOnFocus(uri);
    expect(panel.webview.postMessage).not.toHaveBeenCalled();
    expect(workspace.fs.readFile).toHaveBeenCalledTimes(1);
    provider.dispose();
  });

  it('rechecks changed size on focus even if source mtime has not changed (#849)', async () => {
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    const panel = createPanel();
    const uri = vscode.Uri.file(tempFile);
    await provider.resolveCustomEditor(
      { uri } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel
    );
    const changed = sourceText + ' (comment "new")';
    (workspace.fs.stat as jest.Mock).mockResolvedValue({
      size: Buffer.byteLength(changed),
      mtime: 0,
      ctime: 0,
      type: 1
    });
    (workspace.fs.readFile as jest.Mock).mockResolvedValue(
      Buffer.from(changed)
    );
    await (provider as any).checkForChangesOnFocus(uri);
    await jest.advanceTimersByTimeAsync(760);
    expect(panel.webview.postMessage).toHaveBeenCalledTimes(1);
    provider.dispose();
  });

  it('retains a preview if a document becomes dirty during an external refresh (#849)', async () => {
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    const panel = createPanel();
    const uri = vscode.Uri.file(tempFile);
    await provider.resolveCustomEditor(
      { uri } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel
    );
    const next = sourceText.replace('R1', 'R5');
    (workspace.fs.stat as jest.Mock).mockResolvedValue({
      size: Buffer.byteLength(next),
      mtime: 15,
      ctime: 0,
      type: 1
    });
    (workspace.fs.readFile as jest.Mock).mockImplementation(async () => {
      workspace.textDocuments.push({ uri, isDirty: true });
      return Buffer.from(next);
    });
    (provider as any).pendingExternal.add(uri.toString());
    const refresh = (provider as any).refreshDocument(uri);
    await jest.advanceTimersByTimeAsync(140);
    await refresh;
    expect(panel.webview.postMessage).not.toHaveBeenCalled();
    expect((provider as any).panelInfo.get(panel).pendingRefresh).toBe(true);
    workspace.textDocuments.length = 0;
    provider.dispose();
  });

  it('keeps the previous render on a failed external read and retries later (#849)', async () => {
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    const panel = createPanel();
    const uri = vscode.Uri.file(tempFile);
    await provider.resolveCustomEditor(
      { uri } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel
    );
    (workspace.fs.stat as jest.Mock).mockResolvedValue({
      size: 456,
      mtime: 55,
      ctime: 0,
      type: 1
    });
    (workspace.fs.readFile as jest.Mock).mockRejectedValueOnce(
      new Error('write in progress')
    );
    (provider as any).pendingExternal.add(uri.toString());
    const refresh = (provider as any).refreshDocument(uri);
    await jest.advanceTimersByTimeAsync(140);
    await refresh;
    expect(panel.webview.postMessage).not.toHaveBeenCalled();
    const next = sourceText.replace('R1', 'R7');
    (workspace.fs.stat as jest.Mock).mockResolvedValue({
      size: Buffer.byteLength(next),
      mtime: 56,
      ctime: 0,
      type: 1
    });
    (workspace.fs.readFile as jest.Mock).mockResolvedValue(Buffer.from(next));
    const refreshAfterRecovery = (provider as any).refreshDocument(uri);
    await jest.advanceTimersByTimeAsync(140);
    await refreshAfterRecovery;
    expect(panel.webview.postMessage).toHaveBeenCalledTimes(1);
    provider.dispose();
  });

  it('avoids publishing a stale image if a new write arrives during the read (#849)', async () => {
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    const panel = createPanel();
    const uri = vscode.Uri.file(tempFile);
    await provider.resolveCustomEditor(
      { uri } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel
    );
    const next = sourceText.replace('R1', 'R4');
    (workspace.fs.stat as jest.Mock).mockResolvedValue({
      size: Buffer.byteLength(next),
      mtime: 60,
      ctime: 0,
      type: 1
    });
    let interrupted = false;
    (workspace.fs.readFile as jest.Mock).mockImplementation(async () => {
      if (!interrupted) {
        interrupted = true;
        (provider as any).externalFileChanged(uri);
      }
      return Buffer.from(next);
    });
    (provider as any).pendingExternal.add(uri.toString());
    const refresh = (provider as any).refreshDocument(uri);
    await jest.advanceTimersByTimeAsync(140);
    await refresh;
    expect(panel.webview.postMessage).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(770);
    expect(panel.webview.postMessage).toHaveBeenCalledTimes(1);
    provider.dispose();
  });

  it('keeps last rendered metadata after hidden cache eviction and avoids unchanged redraw (#849)', async () => {
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    const panel = createPanel();
    const uri = vscode.Uri.file(tempFile);
    await provider.resolveCustomEditor(
      { uri } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel
    );
    panel.visible = false;
    panel.fireViewState();
    await jest.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);
    expect((provider as any).fileCache.has(uri.toString())).toBe(false);
    expect((provider as any).lastRendered.has(uri.toString())).toBe(true);
    panel.visible = true;
    panel.fireViewState();
    await jest.advanceTimersByTimeAsync(1000);
    expect(panel.webview.postMessage).not.toHaveBeenCalled();
    expect(workspace.fs.readFile).toHaveBeenCalledTimes(1);
    panel.fireDispose();
    expect((provider as any).lastRendered.has(uri.toString())).toBe(false);
    provider.dispose();
  });

  it('refreshes a hidden sibling panel on reveal after a visible sibling updates (#849)', async () => {
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    const visible = createPanel();
    const hidden = createPanel();
    const uri = vscode.Uri.file(tempFile);
    await provider.resolveCustomEditor(
      { uri } as vscode.CustomDocument,
      visible as unknown as vscode.WebviewPanel
    );
    await provider.resolveCustomEditor(
      { uri } as vscode.CustomDocument,
      hidden as unknown as vscode.WebviewPanel
    );
    hidden.visible = false;
    hidden.fireViewState();
    const changed = sourceText.replace('R1', 'R9');
    (workspace.fs.stat as jest.Mock).mockResolvedValue({
      size: Buffer.byteLength(changed),
      mtime: 211,
      ctime: 0,
      type: 1
    });
    (workspace.fs.readFile as jest.Mock).mockResolvedValue(
      Buffer.from(changed)
    );
    (provider as any).externalFileChanged(uri);
    await jest.advanceTimersByTimeAsync(1000);
    expect(visible.webview.postMessage).toHaveBeenCalledTimes(1);
    expect(hidden.webview.postMessage).not.toHaveBeenCalled();
    expect((provider as any).panelInfo.get(hidden).pendingRefresh).toBe(true);
    hidden.visible = true;
    hidden.fireViewState();
    await jest.advanceTimersByTimeAsync(200);
    expect(hidden.webview.postMessage).toHaveBeenCalledTimes(1);
    expect(visible.webview.postMessage).toHaveBeenCalledTimes(2);
    provider.dispose();
  });

  it('bounds retry work for a writer that never stabilizes (#849)', async () => {
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    const panel = createPanel();
    const uri = vscode.Uri.file(tempFile);
    await provider.resolveCustomEditor(
      { uri } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel
    );
    let statCalls = 0;
    (workspace.fs.stat as jest.Mock).mockImplementation(async () => ({
      size: 300,
      mtime: ++statCalls,
      ctime: 0,
      type: 1
    }));
    (provider as any).externalFileChanged(uri);
    await jest.advanceTimersByTimeAsync(5000);
    expect(statCalls).toBe(8);
    expect(panel.webview.postMessage).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    provider.dispose();
  });

  it('refreshes via postMessage without replacing HTML', async () => {
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    const panel = createPanel();
    const document = {
      uri: vscode.Uri.file(tempFile)
    } as vscode.CustomDocument;

    await provider.resolveCustomEditor(
      document,
      panel as unknown as vscode.WebviewPanel
    );
    const initialHtml = panel.webview.html;

    await (provider as any).refreshDocument(document.uri);

    expect(panel.webview.html).toBe(initialHtml);
    expect(panel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'refresh',
        payload: expect.objectContaining({
          fileName: path.basename(tempFile)
        })
      })
    );
  });

  it('notifies diagnostics when a visible viewer reloads', async () => {
    const onViewerReload = jest.fn();
    const provider = new (
      ContextProvider as never as {
        new (
          context: vscode.ExtensionContext,
          svgFallbackProvider: undefined,
          viewerState: ViewerStateStore,
          resolveProject: undefined,
          onViewerReload: (uri: vscode.Uri) => void
        ): InstanceType<typeof ContextProvider>;
      }
    )(
      {
        extensionUri: vscode.Uri.file('/extension')
      } as vscode.ExtensionContext,
      undefined,
      new ViewerStateStore(),
      undefined,
      onViewerReload
    );
    const panel = createPanel();
    const document = {
      uri: vscode.Uri.file(tempFile)
    } as vscode.CustomDocument;

    await provider.resolveCustomEditor(
      document,
      panel as unknown as vscode.WebviewPanel
    );

    await (provider as any).refreshDocument(document.uri);

    expect(onViewerReload).toHaveBeenCalledWith(document.uri, undefined);
  });

  it('keeps hidden viewers out of loading state until refresh becomes visible', async () => {
    const viewerState = new ViewerStateStore();
    const provider = new (
      ContextProvider as never as {
        new (
          context: vscode.ExtensionContext,
          svgFallbackProvider: undefined,
          viewerState: ViewerStateStore
        ): InstanceType<typeof ContextProvider>;
      }
    )(
      {
        extensionUri: vscode.Uri.file('/extension')
      } as vscode.ExtensionContext,
      undefined,
      viewerState
    );
    const panel = createPanel();
    const document = {
      uri: vscode.Uri.file(tempFile)
    } as vscode.CustomDocument;

    await provider.resolveCustomEditor(
      document,
      panel as unknown as vscode.WebviewPanel
    );
    panel.visible = false;

    await (provider as any).refreshDocument(document.uri);

    expect(viewerState.getSnapshot()).toEqual({ viewers: [] });
  });

  it('uses file metadata before full reads for oversized KiCad files', async () => {
    __setConfiguration({
      'kicadstudio.viewer.autoRefresh': true,
      'kicadstudio.viewer.largeFileThresholdBytes': 1024 * 1024
    });
    (workspace.fs.stat as jest.Mock).mockResolvedValue({
      size: 2 * 1024 * 1024,
      ctime: 0,
      mtime: 0,
      type: 1
    });
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    const panel = createPanel();
    const document = {
      uri: vscode.Uri.file(tempFile)
    } as vscode.CustomDocument;

    await provider.resolveCustomEditor(
      document,
      panel as unknown as vscode.WebviewPanel
    );

    expect(workspace.fs.readFile).not.toHaveBeenCalled();
    expect(panel.webview.html).toContain('Interactive render is disabled');
  });

  it('skips oversized non-file URI metadata instead of doing a full read', async () => {
    __setConfiguration({
      'kicadstudio.viewer.autoRefresh': true,
      'kicadstudio.viewer.largeFileThresholdBytes': 1024 * 1024
    });
    const remoteUri = Object.assign(vscode.Uri.parse('vscode-remote://board'), {
      scheme: 'vscode-remote',
      fsPath: '/remote/board.kicad_pcb',
      toString: () => 'vscode-remote://board'
    }) as vscode.Uri;
    (workspace.fs.stat as jest.Mock).mockResolvedValue({
      size: 2 * 1024 * 1024,
      ctime: 0,
      mtime: 0,
      type: 1
    });
    (workspace.fs.readFile as jest.Mock).mockResolvedValue(
      Buffer.from(sourceText, 'utf8')
    );
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    const panel = createPanel();
    const document = {
      uri: remoteUri
    } as vscode.CustomDocument;

    await provider.resolveCustomEditor(
      document,
      panel as unknown as vscode.WebviewPanel
    );

    expect(workspace.fs.readFile).not.toHaveBeenCalled();
    expect(panel.webview.html).toContain('Interactive render is disabled');
  });

  it('uses VS Code workspace reads for bounded non-file URI metadata', async () => {
    __setConfiguration({
      'kicadstudio.viewer.autoRefresh': true,
      'kicadstudio.viewer.largeFileThresholdBytes':
        Buffer.byteLength(sourceText) + 1
    });
    const remoteUri = Object.assign(vscode.Uri.parse('vscode-remote://board'), {
      scheme: 'vscode-remote',
      fsPath: '/remote/board.kicad_pcb',
      toString: () => 'vscode-remote://board'
    }) as vscode.Uri;
    (workspace.fs.stat as jest.Mock).mockResolvedValue({
      size: Buffer.byteLength(sourceText),
      ctime: 0,
      mtime: 0,
      type: 1
    });
    (workspace.fs.readFile as jest.Mock).mockResolvedValue(
      Buffer.from(sourceText, 'utf8')
    );
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    const panel = createPanel();
    const document = {
      uri: remoteUri
    } as vscode.CustomDocument;

    await provider.resolveCustomEditor(
      document,
      panel as unknown as vscode.WebviewPanel
    );

    expect(workspace.fs.readFile).toHaveBeenCalledWith(remoteUri);
    expect(panel.webview.html).not.toContain('Interactive render is disabled');
  });

  it('rejects invalid PNG export payloads from the webview bridge', async () => {
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    const panel = createPanel();
    const document = {
      uri: vscode.Uri.file(tempFile)
    } as vscode.CustomDocument;
    (window.showSaveDialog as jest.Mock).mockResolvedValue(
      vscode.Uri.file(path.join(os.tmpdir(), 'invalid-snapshot.png'))
    );

    await provider.resolveCustomEditor(
      document,
      panel as unknown as vscode.WebviewPanel
    );
    await panel.fireMessage({
      type: 'exportPng',
      payload: {
        dataUrl: 'data:text/plain;base64,ZmFrZQ=='
      }
    });

    expect(workspace.fs.writeFile).not.toHaveBeenCalled();
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'Only PNG data URLs can be saved from the viewer.'
    );
  });

  it('serves SVG fallback requests through the provider bridge', async () => {
    const provider = new ContextProvider(
      {
        extensionUri: vscode.Uri.file('/extension')
      } as vscode.ExtensionContext,
      async () => '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
    );
    const panel = createPanel();
    const document = {
      uri: vscode.Uri.file(tempFile)
    } as vscode.CustomDocument;

    await provider.resolveCustomEditor(
      document,
      panel as unknown as vscode.WebviewPanel
    );
    await panel.fireMessage({
      type: 'requestSvgFallback',
      payload: {
        requestId: 'req-1'
      }
    });

    expect(panel.webview.postMessage).toHaveBeenCalledWith({
      type: 'svgFallback',
      payload: {
        requestId: 'req-1',
        svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
      }
    });
  });

  it('persists viewer engine diagnostics from viewer state messages', async () => {
    const viewerState = new ViewerStateStore();
    const provider = new (
      ContextProvider as never as {
        new (
          context: vscode.ExtensionContext,
          svgFallbackProvider: undefined,
          viewerState: ViewerStateStore
        ): InstanceType<typeof ContextProvider>;
      }
    )(
      {
        extensionUri: vscode.Uri.file('/extension')
      } as vscode.ExtensionContext,
      undefined,
      viewerState
    );
    const panel = createPanel();
    const document = {
      uri: vscode.Uri.file(tempFile)
    } as vscode.CustomDocument;

    await provider.resolveCustomEditor(
      document,
      panel as unknown as vscode.WebviewPanel
    );
    await panel.fireMessage({
      type: 'viewerState',
      payload: {
        zoom: 1,
        grid: false,
        theme: 'kicad',
        engine: {
          kind: 'cli-svg-fallback',
          label: 'CLI SVG fallback',
          reason: 'KiCanvas created a blank render surface for this file.',
          capabilities: {
            interactive: false,
            fit: true,
            zoom: true,
            exportPng: true,
            exportSvg: true,
            selection: false,
            layers: false
          }
        }
      }
    });

    expect(viewerState.getState(document.uri)).toEqual(
      expect.objectContaining({
        engine: expect.objectContaining({
          kind: 'cli-svg-fallback',
          label: 'CLI SVG fallback',
          reason: expect.stringContaining('blank render surface'),
          capabilities: expect.objectContaining({
            fit: true,
            zoom: true,
            exportPng: true,
            layers: false
          })
        })
      })
    );
  });

  it('untracks panels when the webview is disposed', async () => {
    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext);
    const panel = createPanel();
    const document = {
      uri: vscode.Uri.file(tempFile)
    } as vscode.CustomDocument;

    await provider.resolveCustomEditor(
      document,
      panel as unknown as vscode.WebviewPanel
    );

    const panels = (provider as any).panels.get(document.uri.toString());
    expect(panels.size).toBe(1);

    panel.fireDispose();

    expect((provider as any).panels.has(document.uri.toString())).toBe(false);
  });

  it('extracts PCB metadata for layers and tuning profiles', () => {
    if (extension !== '.kicad_pcb') {
      return;
    }

    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext) as unknown as PcbEditorProvider;
    const metadata = (provider as any).buildViewerMetadata(
      vscode.Uri.file(tempFile),
      `(kicad_pcb
        (layers
          (0 "F.Cu" signal)
          (31 "B.Cu" signal)
        )
        (tuning_profile
          (name "DDR4")
          (layer "F.Cu")
          (impedance "50")
          (propagation_speed "150")
        )
      )`
    ) as {
      layers?: Array<{ name: string }>;
      tuningProfiles?: Array<{ name: string; layer?: string }>;
    };

    expect(metadata.layers?.map((layer) => layer.name)).toEqual([
      'F.Cu',
      'B.Cu'
    ]);
    expect(metadata.tuningProfiles?.[0]).toEqual(
      expect.objectContaining({ name: 'DDR4', layer: 'F.Cu' })
    );
  });

  it('adds schematic hop-over metadata notes for KiCad 10 fixtures', () => {
    if (extension !== '.kicad_sch') {
      return;
    }

    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext) as unknown as SchematicEditorProvider;
    // KiCad 10 hop-overs are top-level (arc ...) elements, NOT (junction ...).
    // The arc line must be indented with exactly 2 spaces to match the regex.
    const metadata = (provider as any).buildViewerMetadata(
      vscode.Uri.file(tempFile),
      '(kicad_sch\n  (version 20260301)\n  (arc (start 45 50) (mid 50 55) (end 55 50))\n)'
    ) as { hopOvers?: Array<{ x: number; y: number }>; notes?: string[] };

    expect(metadata.hopOvers).toEqual([{ x: 45, y: 50 }]);
    expect(metadata.notes).toEqual([
      '1 KiCad 10 hop-over arc detected. Overlay hint shown until KiCanvas renders them natively.'
    ]);
  });

  it('extracts hierarchical schematic sheets into viewer metadata', () => {
    if (extension !== '.kicad_sch') {
      return;
    }

    const provider = new ContextProvider({
      extensionUri: vscode.Uri.file('/extension')
    } as vscode.ExtensionContext) as unknown as SchematicEditorProvider;
    const metadata = (provider as any).buildViewerMetadata(
      vscode.Uri.file(tempFile),
      `(kicad_sch
        (version 20250316)
        (sheet
          (at 40.64 50.8)
          (size 20.32 15.24)
          (uuid "60000000-0000-0000-0000-000000000002")
          (property "Sheetname" "Power" (at 40.64 48.26 0))
          (property "Sheetfile" "power.kicad_sch" (at 40.64 66.04 0))
        )
      )`
    ) as {
      sheets?: Array<{ id: string; name: string; file?: string | undefined }>;
    };

    expect(metadata.sheets).toEqual([
      {
        id: 'power.kicad_sch',
        name: 'Power',
        file: 'power.kicad_sch'
      }
    ]);
  });

  it('passes the active KiCad board background color into the fallback payload', async () => {
    if (extension !== '.kicad_pcb') {
      return;
    }

    const originalAppData = process.env['APPDATA'];
    const originalHome = process.env['HOME'];
    const originalXdgConfigHome = process.env['XDG_CONFIG_HOME'];
    const fakeAppData = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kicadstudio-appdata-')
    );
    let kicadConfigDir: string;

    if (process.platform === 'win32') {
      process.env['APPDATA'] = fakeAppData;
      kicadConfigDir = path.join(fakeAppData, 'kicad', '10.0');
    } else if (process.platform === 'darwin') {
      process.env['HOME'] = fakeAppData;
      kicadConfigDir = path.join(
        fakeAppData,
        'Library',
        'Preferences',
        'kicad',
        '10.0'
      );
    } else {
      process.env['XDG_CONFIG_HOME'] = fakeAppData;
      kicadConfigDir = path.join(fakeAppData, 'kicad', '10.0');
    }

    fs.mkdirSync(path.join(kicadConfigDir, 'colors'), { recursive: true });
    fs.writeFileSync(
      path.join(kicadConfigDir, 'pcbnew.json'),
      JSON.stringify({
        appearance: {
          color_theme: 'user'
        }
      }),
      'utf8'
    );
    fs.writeFileSync(
      path.join(kicadConfigDir, 'colors', 'user.json'),
      JSON.stringify({
        board: {
          background: 'rgb(1, 2, 3)'
        }
      }),
      'utf8'
    );

    try {
      const provider = new ContextProvider({
        extensionUri: vscode.Uri.file('/extension')
      } as vscode.ExtensionContext);
      const panel = createPanel();
      const document = {
        uri: vscode.Uri.file(tempFile)
      } as vscode.CustomDocument;

      await provider.resolveCustomEditor(
        document,
        panel as unknown as vscode.WebviewPanel
      );

      expect(panel.webview.html).toContain('rgb(1, 2, 3)');
    } finally {
      process.env['APPDATA'] = originalAppData;
      process.env['HOME'] = originalHome;
      process.env['XDG_CONFIG_HOME'] = originalXdgConfigHome;
      fs.rmSync(fakeAppData, { recursive: true, force: true });
    }
  });

  it('persists the OASLANA-18 tools panel collapsed state in workspace state', async () => {
    const context = createExtensionContextMock();
    const viewerState = new ViewerStateStore();
    const provider = new (
      ContextProvider as never as {
        new (
          context: vscode.ExtensionContext,
          svgFallbackProvider: undefined,
          viewerState: ViewerStateStore
        ): InstanceType<typeof ContextProvider>;
      }
    )(context as unknown as vscode.ExtensionContext, undefined, viewerState);
    const panel = createPanel();
    const document = {
      uri: vscode.Uri.file(tempFile)
    } as vscode.CustomDocument;

    await provider.resolveCustomEditor(
      document,
      panel as unknown as vscode.WebviewPanel
    );
    await panel.fireMessage({
      type: 'viewerState',
      payload: {
        zoom: 1.25,
        grid: true,
        theme: 'light',
        toolsPanelCollapsed: false
      }
    });

    expect(context.workspaceState.update).toHaveBeenCalledWith(
      'kicadstudio.viewer.toolsPanelCollapsed',
      false
    );
    expect(viewerState.getState(document.uri)).toEqual(
      expect.objectContaining({
        toolsPanelCollapsed: false
      })
    );
  });

  it('skips redundant OASLANA-18 workspace preference writes when collapsed state is unchanged', async () => {
    const context = createExtensionContextMock();
    await context.workspaceState.update(
      'kicadstudio.viewer.toolsPanelCollapsed',
      false
    );
    (context.workspaceState.update as jest.Mock).mockClear();
    const viewerState = new ViewerStateStore();
    const provider = new (
      ContextProvider as never as {
        new (
          context: vscode.ExtensionContext,
          svgFallbackProvider: undefined,
          viewerState: ViewerStateStore
        ): InstanceType<typeof ContextProvider>;
      }
    )(context as unknown as vscode.ExtensionContext, undefined, viewerState);
    const panel = createPanel();
    const document = {
      uri: vscode.Uri.file(tempFile)
    } as vscode.CustomDocument;

    await provider.resolveCustomEditor(
      document,
      panel as unknown as vscode.WebviewPanel
    );
    await panel.fireMessage({
      type: 'viewerState',
      payload: {
        zoom: 1.25,
        grid: true,
        theme: 'light',
        toolsPanelCollapsed: false
      }
    });

    expect(context.workspaceState.update).not.toHaveBeenCalled();
    expect(viewerState.getState(document.uri)).toEqual(
      expect.objectContaining({
        toolsPanelCollapsed: false
      })
    );
  });

  it('restores the OASLANA-18 workspace tools panel preference into new viewer payloads', async () => {
    const context = createExtensionContextMock();
    await context.workspaceState.update(
      'kicadstudio.viewer.toolsPanelCollapsed',
      false
    );
    const provider = new ContextProvider(
      context as unknown as vscode.ExtensionContext
    );
    const panel = createPanel();
    const document = {
      uri: vscode.Uri.file(tempFile)
    } as vscode.CustomDocument;

    await provider.resolveCustomEditor(
      document,
      panel as unknown as vscode.WebviewPanel
    );

    expect(panel.webview.html).toContain('"toolsPanelCollapsed":false');
  });
});
