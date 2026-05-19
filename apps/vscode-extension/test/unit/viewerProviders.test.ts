import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SchematicEditorProvider } from '../../src/providers/schematicEditorProvider';
import { PcbEditorProvider } from '../../src/providers/pcbEditorProvider';
import { __setConfiguration, window, workspace } from './vscodeMock';

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
    | ((event: { webviewPanel: unknown }) => void)
    | undefined;
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
  });

  afterEach(() => {
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
});
