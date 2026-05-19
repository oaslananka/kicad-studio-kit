import { DesignIntentPanel } from '../../src/mcp/designIntentPanel';
import { createExtensionContextMock, ViewColumn, window } from './vscodeMock';

describe('DesignIntentPanel', () => {
  let disposePanel: (() => void) | undefined;
  let messageHandler: ((message: unknown) => Promise<void>) | undefined;
  let panel: {
    reveal: jest.Mock;
    webview: {
      html: string;
      onDidReceiveMessage: jest.Mock;
      postMessage: jest.Mock;
    };
    onDidDispose: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    disposePanel = undefined;
    messageHandler = undefined;
    panel = {
      reveal: jest.fn(),
      webview: {
        html: '',
        onDidReceiveMessage: jest.fn((handler) => {
          messageHandler = handler;
          return { dispose: jest.fn() };
        }),
        postMessage: jest.fn()
      },
      onDidDispose: jest.fn((handler) => {
        disposePanel = handler;
        return { dispose: jest.fn() };
      })
    };
    (window.createWebviewPanel as jest.Mock).mockReturnValue(panel);
  });

  afterEach(() => {
    disposePanel?.();
  });

  function createPanel(mcpClient = { callTool: jest.fn() }) {
    DesignIntentPanel.createOrShow(
      createExtensionContextMock() as never,
      mcpClient as never
    );
    if (!messageHandler) {
      throw new Error('Design intent message handler was not registered');
    }
    return { mcpClient, messageHandler };
  }

  it('creates a constrained webview with nonce-based CSP and local resources disabled', () => {
    createPanel();

    expect(window.createWebviewPanel).toHaveBeenCalledWith(
      'kicadstudio.designIntent',
      'KiCad Design Intent',
      ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: []
      }
    );
    expect(panel.webview.html).toContain("default-src 'none'");
    expect(panel.webview.html).toContain("style-src 'nonce-");
    expect(panel.webview.html).toContain("script-src 'nonce-");
    expect(panel.webview.html).toContain(
      "vscode.postMessage({ type: 'load' })"
    );
  });

  it('loads design intent from MCP and posts the result back to the webview', async () => {
    const intent = {
      fabricationProfile: 'jlcpcb',
      notes: 'Keep sensors clustered'
    };
    const { mcpClient, messageHandler } = createPanel({
      callTool: jest.fn().mockResolvedValue(intent)
    });

    await messageHandler({ type: 'load' });

    expect(mcpClient.callTool).toHaveBeenCalledWith(
      'project_get_design_intent',
      {}
    );
    expect(panel.webview.postMessage).toHaveBeenCalledWith({
      type: 'loaded',
      data: intent
    });
  });

  it('posts an empty intent object when MCP returns no saved design intent', async () => {
    const { messageHandler } = createPanel({
      callTool: jest.fn().mockResolvedValue(undefined)
    });

    await messageHandler({ type: 'load' });

    expect(panel.webview.postMessage).toHaveBeenCalledWith({
      type: 'loaded',
      data: {}
    });
  });

  it('saves only object-shaped design intent payloads through MCP', async () => {
    const { mcpClient, messageHandler } = createPanel({
      callTool: jest.fn().mockResolvedValue(undefined)
    });
    const data = {
      powerTreeRefs: 'U1,U2',
      fabricationProfile: 'pcbway'
    };

    await messageHandler({ type: 'save', data });

    expect(mcpClient.callTool).toHaveBeenCalledWith(
      'project_set_design_intent',
      data
    );
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Design intent saved. AI can now use your project intent as context.'
    );

    await messageHandler({ type: 'save', data: 'not an object' });

    expect(mcpClient.callTool).toHaveBeenLastCalledWith(
      'project_set_design_intent',
      {}
    );
  });

  it('ignores unknown or malformed webview messages', async () => {
    const { mcpClient, messageHandler } = createPanel({
      callTool: jest.fn()
    });

    await messageHandler({ type: 'delete', data: {} });
    await messageHandler('load');

    expect(mcpClient.callTool).not.toHaveBeenCalled();
    expect(panel.webview.postMessage).not.toHaveBeenCalled();
  });

  it('reveals an existing panel instead of creating duplicate webviews', () => {
    createPanel();

    DesignIntentPanel.createOrShow(
      createExtensionContextMock() as never,
      { callTool: jest.fn() } as never
    );

    expect(window.createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(panel.reveal).toHaveBeenCalledWith(ViewColumn.Beside);
  });

  it('allows a new panel after the previous one is disposed', () => {
    createPanel();
    disposePanel?.();
    const nextPanel = {
      ...panel,
      reveal: jest.fn(),
      webview: {
        html: '',
        onDidReceiveMessage: jest.fn((handler) => {
          messageHandler = handler;
          return { dispose: jest.fn() };
        }),
        postMessage: jest.fn()
      },
      onDidDispose: jest.fn((handler) => {
        disposePanel = handler;
        return { dispose: jest.fn() };
      })
    };
    (window.createWebviewPanel as jest.Mock).mockReturnValue(nextPanel);

    DesignIntentPanel.createOrShow(
      createExtensionContextMock() as never,
      { callTool: jest.fn() } as never
    );

    expect(window.createWebviewPanel).toHaveBeenCalledTimes(2);
  });
});
