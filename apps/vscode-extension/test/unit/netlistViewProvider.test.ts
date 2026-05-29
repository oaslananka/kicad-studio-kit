jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SExpressionParser } from '../../src/language/sExpressionParser';
import { NetlistViewProvider } from '../../src/providers/netlistViewProvider';
import { CliExitError, KiCadCliNotFoundError } from '../../src/errors';

// ── mock helpers ─────────────────────────────────────────────────────────────

function makeWebview() {
  const messages: unknown[] = [];
  return {
    options: {} as Record<string, unknown>,
    html: '',
    postMessage: jest.fn((msg: unknown) => {
      messages.push(msg);
      return Promise.resolve(true);
    }),
    cspSource: 'vscode-webview:',
    asWebviewUri: jest.fn((uri: { fsPath: string }) => ({
      toString: () => `webview://${uri.fsPath}`
    })),
    messages
  };
}

function makeRunner(
  result: 'success' | 'notFound' | 'exitError' | 'throws',
  outputContent?: string
) {
  return {
    runWithProgress: jest.fn(async (options: { command: string[] }) => {
      if (result === 'notFound') throw new KiCadCliNotFoundError();
      if (result === 'exitError') {
        throw new CliExitError({
          command: options.command.join(' '),
          code: 1,
          stdout: '',
          stderr: 'netlist export failed'
        });
      }
      if (result === 'throws') throw new Error('unexpected spawn failure');
      const outIdx = options.command.indexOf('--output');
      if (outIdx !== -1 && options.command[outIdx + 1]) {
        fs.writeFileSync(options.command[outIdx + 1]!, outputContent ?? '');
      }
      return '';
    })
  };
}

// Inject a view into a provider without going through resolveWebviewView
function injectView(
  provider: NetlistViewProvider,
  webview: ReturnType<typeof makeWebview>
): void {
  (provider as any).view = { webview };
}

const MINIMAL_NETLIST = `(export
  (version "E")
  (design (source "demo.kicad_sch"))
  (components)
  (nets
    (net (code "1") (name "/VCC")
      (node (ref "R1") (pin "1") (pinfunction "Pad1") (pintype "unspecified"))
    )
    (net (code "2") (name "/GND")
      (node (ref "R1") (pin "2") (pinfunction "Pad2") (pintype "unspecified"))
      (node (ref "C1") (pin "1") (pinfunction "Pad1") (pintype "unspecified"))
    )
  )
)`;

const EMPTY_NETLIST = `(export
  (version "E")
  (design (source "empty.kicad_sch"))
  (components)
  (nets)
)`;

// ── tests ────────────────────────────────────────────────────────────────────

describe('NetlistViewProvider', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kicadstudio-netlist-test-')
    );
    jest.clearAllMocks();
    const vscode =
      jest.requireActual<typeof import('./vscodeMock')>('./vscodeMock');
    vscode.window.activeTextEditor = undefined;
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Helper to get the last setNetlist message from the webview
  function lastNetlistMsg(webview: ReturnType<typeof makeWebview>) {
    const msgs = webview.messages.filter(
      (m) => (m as { type: string }).type === 'setNetlist'
    ) as Array<{ payload: { nets: unknown[]; status: string } }>;
    return msgs[msgs.length - 1];
  }

  describe('no runner configured', () => {
    it('posts kicad-cli-not-configured message', async () => {
      const schFile = path.join(tmpDir, 'demo.kicad_sch');
      fs.writeFileSync(schFile, '(kicad_sch)', 'utf8');

      const vscode =
        jest.requireActual<typeof import('./vscodeMock')>('./vscodeMock');
      jest
        .spyOn(vscode.workspace, 'findFiles')
        .mockResolvedValueOnce([{ fsPath: schFile }] as never);

      const provider = new NetlistViewProvider(
        {} as never,
        new SExpressionParser()
      );
      const webview = makeWebview();
      injectView(provider, webview);

      await provider['refresh']();

      const msg = lastNetlistMsg(webview);
      expect(msg).toBeDefined();
      expect(msg!.payload.nets).toHaveLength(0);
      expect(msg!.payload.status).toContain('kicad-cli is not');
      provider.dispose();
    });
  });

  describe('runner available – success', () => {
    it('posts parsed nets from a successful export', async () => {
      const schFile = path.join(tmpDir, 'demo.kicad_sch');
      fs.writeFileSync(schFile, '(kicad_sch)', 'utf8');

      const vscode =
        jest.requireActual<typeof import('./vscodeMock')>('./vscodeMock');
      jest
        .spyOn(vscode.workspace, 'findFiles')
        .mockResolvedValueOnce([{ fsPath: schFile }] as never);

      const runner = makeRunner('success', MINIMAL_NETLIST);
      const provider = new NetlistViewProvider(
        {} as never,
        new SExpressionParser(),
        runner as never
      );
      const webview = makeWebview();
      injectView(provider, webview);

      await provider['refresh']();

      const msg = lastNetlistMsg(webview);
      expect(msg).toBeDefined();
      expect(msg!.payload.nets).toHaveLength(2);
      const first = msg!.payload.nets[0] as { netName: string };
      expect(first.netName).toBe('/VCC');
      provider.dispose();
    });

    it('resolves the schematic beside the active project file', async () => {
      const proFile = path.join(tmpDir, '555.kicad_pro');
      const schFile = path.join(tmpDir, '555.kicad_sch');
      fs.writeFileSync(proFile, '{}', 'utf8');
      fs.writeFileSync(schFile, '(kicad_sch)', 'utf8');

      const vscode =
        jest.requireActual<typeof import('./vscodeMock')>('./vscodeMock');
      vscode.window.activeTextEditor = {
        document: { fileName: proFile }
      } as never;
      jest
        .spyOn(vscode.workspace, 'findFiles')
        .mockResolvedValueOnce([] as never);

      const runner = makeRunner('success', MINIMAL_NETLIST);
      const provider = new NetlistViewProvider(
        {} as never,
        new SExpressionParser(),
        runner as never
      );
      const webview = makeWebview();
      injectView(provider, webview);

      await provider['refresh']();

      expect(runner.runWithProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.arrayContaining([schFile])
        })
      );
      expect(lastNetlistMsg(webview)!.payload.status).toContain(
        '555.kicad_sch'
      );
      provider.dispose();
    });

    it('includes multiple nodes per net', async () => {
      const schFile = path.join(tmpDir, 'demo.kicad_sch');
      fs.writeFileSync(schFile, '(kicad_sch)', 'utf8');

      const vscode =
        jest.requireActual<typeof import('./vscodeMock')>('./vscodeMock');
      jest
        .spyOn(vscode.workspace, 'findFiles')
        .mockResolvedValueOnce([{ fsPath: schFile }] as never);

      const runner = makeRunner('success', MINIMAL_NETLIST);
      const provider = new NetlistViewProvider(
        {} as never,
        new SExpressionParser(),
        runner as never
      );
      const webview = makeWebview();
      injectView(provider, webview);

      await provider['refresh']();

      const msg = lastNetlistMsg(webview);
      const gndNet = msg!.payload.nets[1] as {
        netName: string;
        nodes: unknown[];
      };
      expect(gndNet.netName).toBe('/GND');
      expect(gndNet.nodes).toHaveLength(2);
      provider.dispose();
    });

    it('posts empty nets with filename for a schematic with no nets', async () => {
      const schFile = path.join(tmpDir, 'empty.kicad_sch');
      fs.writeFileSync(schFile, '(kicad_sch)', 'utf8');

      const vscode =
        jest.requireActual<typeof import('./vscodeMock')>('./vscodeMock');
      jest
        .spyOn(vscode.workspace, 'findFiles')
        .mockResolvedValueOnce([{ fsPath: schFile }] as never);

      const runner = makeRunner('success', EMPTY_NETLIST);
      const provider = new NetlistViewProvider(
        {} as never,
        new SExpressionParser(),
        runner as never
      );
      const webview = makeWebview();
      injectView(provider, webview);

      await provider['refresh']();

      const msg = lastNetlistMsg(webview);
      expect(msg!.payload.nets).toHaveLength(0);
      expect(msg!.payload.status).toContain('empty.kicad_sch');
      provider.dispose();
    });

    it('skips re-export when the same file is refreshed twice', async () => {
      const schFile = path.join(tmpDir, 'demo.kicad_sch');
      fs.writeFileSync(schFile, '(kicad_sch)', 'utf8');

      const vscode =
        jest.requireActual<typeof import('./vscodeMock')>('./vscodeMock');
      jest
        .spyOn(vscode.workspace, 'findFiles')
        .mockResolvedValue([{ fsPath: schFile }] as never);

      const runner = makeRunner('success', MINIMAL_NETLIST);
      const provider = new NetlistViewProvider(
        {} as never,
        new SExpressionParser(),
        runner as never
      );
      const webview = makeWebview();
      injectView(provider, webview);

      await provider['refresh']();
      const callsAfterFirst = runner.runWithProgress.mock.calls.length;
      await provider['refresh']();

      expect(runner.runWithProgress.mock.calls.length).toBe(callsAfterFirst);
      provider.dispose();
    });

    it('re-exports the same file when refresh is forced after a save', async () => {
      const schFile = path.join(tmpDir, 'demo.kicad_sch');
      fs.writeFileSync(schFile, '(kicad_sch)', 'utf8');

      const vscode =
        jest.requireActual<typeof import('./vscodeMock')>('./vscodeMock');
      jest
        .spyOn(vscode.workspace, 'findFiles')
        .mockResolvedValue([{ fsPath: schFile }] as never);

      const runner = makeRunner('success', MINIMAL_NETLIST);
      const provider = new NetlistViewProvider(
        {} as never,
        new SExpressionParser(),
        runner as never
      );
      const webview = makeWebview();
      injectView(provider, webview);

      await provider.refresh();
      await provider.refresh(true);

      expect(runner.runWithProgress).toHaveBeenCalledTimes(2);
      provider.dispose();
    });
  });

  describe('runner available – failures', () => {
    it('posts error status when kicad-cli exits non-zero', async () => {
      const schFile = path.join(tmpDir, 'demo.kicad_sch');
      fs.writeFileSync(schFile, '(kicad_sch)', 'utf8');

      const vscode =
        jest.requireActual<typeof import('./vscodeMock')>('./vscodeMock');
      jest
        .spyOn(vscode.workspace, 'findFiles')
        .mockResolvedValueOnce([{ fsPath: schFile }] as never);

      const runner = makeRunner('exitError');
      const provider = new NetlistViewProvider(
        {} as never,
        new SExpressionParser(),
        runner as never
      );
      const webview = makeWebview();
      injectView(provider, webview);

      await provider['refresh']();

      const msg = lastNetlistMsg(webview);
      expect(msg!.payload.nets).toHaveLength(0);
      expect(msg!.payload.status).toMatch(/Could not export netlist/);
      expect(msg!.payload.status).toContain('netlist export failed');
      provider.dispose();
    });

    it('posts error status when kicad-cli binary is not found', async () => {
      const schFile = path.join(tmpDir, 'demo.kicad_sch');
      fs.writeFileSync(schFile, '(kicad_sch)', 'utf8');

      const vscode =
        jest.requireActual<typeof import('./vscodeMock')>('./vscodeMock');
      jest
        .spyOn(vscode.workspace, 'findFiles')
        .mockResolvedValueOnce([{ fsPath: schFile }] as never);

      const runner = makeRunner('notFound');
      const provider = new NetlistViewProvider(
        {} as never,
        new SExpressionParser(),
        runner as never
      );
      const webview = makeWebview();
      injectView(provider, webview);

      await provider['refresh']();

      const msg = lastNetlistMsg(webview);
      expect(msg!.payload.status).toMatch(/Could not export netlist/);
      provider.dispose();
    });

    it('posts error status for unexpected runtime errors', async () => {
      const schFile = path.join(tmpDir, 'demo.kicad_sch');
      fs.writeFileSync(schFile, '(kicad_sch)', 'utf8');

      const vscode =
        jest.requireActual<typeof import('./vscodeMock')>('./vscodeMock');
      jest
        .spyOn(vscode.workspace, 'findFiles')
        .mockResolvedValueOnce([{ fsPath: schFile }] as never);

      const runner = makeRunner('throws');
      const provider = new NetlistViewProvider(
        {} as never,
        new SExpressionParser(),
        runner as never
      );
      const webview = makeWebview();
      injectView(provider, webview);

      await provider['refresh']();

      const msg = lastNetlistMsg(webview);
      expect(msg!.payload.status).toMatch(/Could not export netlist/);
      provider.dispose();
    });
  });

  describe('no schematic in workspace', () => {
    it('posts actionable context when workspace has no .kicad_sch files', async () => {
      const vscode =
        jest.requireActual<typeof import('./vscodeMock')>('./vscodeMock');
      jest
        .spyOn(vscode.workspace, 'findFiles')
        .mockResolvedValueOnce([] as never);

      const runner = makeRunner('success', MINIMAL_NETLIST);
      const provider = new NetlistViewProvider(
        {} as never,
        new SExpressionParser(),
        runner as never
      );
      const webview = makeWebview();
      injectView(provider, webview);

      await provider['refresh']();

      const msg = lastNetlistMsg(webview);
      expect(msg!.payload.status).toContain(
        'No schematic file could be resolved.'
      );
      expect(msg!.payload.status).toContain('Active file: none.');
      expect(msg!.payload.status).toContain(
        'Discovered schematic candidates: none.'
      );
      expect(runner.runWithProgress).not.toHaveBeenCalled();
      provider.dispose();
    });
  });

  describe('S-expression netlist parsing (unit)', () => {
    it('finds all net nodes in a minimal netlist', () => {
      const parser = new SExpressionParser();
      const ast = parser.parse(MINIMAL_NETLIST);
      const nets = parser.findAllNodes(ast, 'net');
      expect(nets).toHaveLength(2);
    });

    it('resolves net names from (name ...) child nodes', () => {
      const parser = new SExpressionParser();
      const ast = parser.parse(MINIMAL_NETLIST);
      const nets = parser.findAllNodes(ast, 'net');
      const vccNet = nets[0]!;
      const nameNode = vccNet.children?.find(
        (c) => c.children?.[0]?.value === 'name'
      );
      expect(nameNode?.children?.[1]?.value).toBe('/VCC');
    });

    it('resolves node references within each net', () => {
      const parser = new SExpressionParser();
      const ast = parser.parse(MINIMAL_NETLIST);
      const nets = parser.findAllNodes(ast, 'net');
      const gndNet = nets[1]!;
      const nodes = gndNet.children?.filter(
        (c) => c.children?.[0]?.value === 'node'
      );
      expect(nodes).toHaveLength(2);
      const refs = nodes?.map((n) => {
        const refNode = n.children?.find(
          (c) => c.children?.[0]?.value === 'ref'
        );
        return refNode?.children?.[1]?.value;
      });
      expect(refs).toEqual(['R1', 'C1']);
    });

    it('returns empty array when (nets) section is empty', () => {
      const parser = new SExpressionParser();
      const ast = parser.parse(EMPTY_NETLIST);
      expect(parser.findAllNodes(ast, 'net')).toHaveLength(0);
    });
  });
});
