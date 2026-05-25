import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DrcRulesProvider } from '../../src/drc/drcRulesProvider';
import { FixQueueProvider } from '../../src/mcp/fixQueueProvider';
import { QualityGateProvider } from '../../src/providers/qualityGateProvider';
import { ValidationViewProvider } from '../../src/providers/validationViewProvider';
import { PcmLibraryProvider } from '../../src/library/pcmLibraryProvider';
import { VariantProvider } from '../../src/variants/variantProvider';
import {
  DiagnosticStateStore,
  McpStateStore
} from '../../src/state/stateStores';
import { SExpressionParser } from '../../src/language/sExpressionParser';
import { createExtensionContextMock, workspace } from './vscodeMock';

jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});

describe('sidebar workflow states', () => {
  let tempDir: string;
  let projectFile: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kicad-sidebar-state-'));
    projectFile = path.join(tempDir, 'demo.kicad_pro');
    fs.writeFileSync(projectFile, JSON.stringify({ name: 'Demo' }), 'utf8');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('keeps sidebar empty/loading/error/populated state copy stable', async () => {
    (workspace.findFiles as jest.Mock).mockImplementation((glob: string) => {
      if (glob === '**/*.kicad_pro') {
        return Promise.resolve([vscode.Uri.file(projectFile)]);
      }
      return Promise.resolve([]);
    });

    const validation = new ValidationViewProvider(
      new DiagnosticStateStore(createDiagnosticsCollection())
    );
    const qualityGates = new QualityGateProvider(
      createExtensionContextMock() as never,
      {} as never
    );
    const variants = new VariantProvider();
    const library = new PcmLibraryProvider({
      onDidChange: jest.fn(() => ({ dispose: jest.fn() })),
      refreshRepositories: jest.fn().mockResolvedValue([]),
      getPackages: jest.fn().mockReturnValue([])
    } as never);
    const drcRules = new DrcRulesProvider(new SExpressionParser());
    const mcpState = new McpStateStore();
    mcpState.update({
      kind: 'Connected',
      available: true,
      connected: true
    });
    const fixQueue = new FixQueueProvider(
      {
        fetchFixQueue: jest.fn().mockResolvedValue([])
      } as never,
      mcpState
    );

    await (drcRules as any).load();
    await fixQueue.refresh();

    expect({
      validation: flattenSyncTree(validation),
      qualityGates: flattenSyncTree(qualityGates),
      variants: flattenTree(variants, await variants.getChildren()),
      library: flattenTree(library, await library.getChildren()),
      drcRules: flattenSyncTree(drcRules),
      fixQueue: flattenSyncTree(fixQueue)
    }).toMatchInlineSnapshot(`
      {
        "drcRules": [
          "No DRC rules file :: Create or open a .kicad_dru file",
        ],
        "fixQueue": [
          "No pending AI fixes :: Run DRC/ERC or refresh MCP",
        ],
        "library": [
          "No PCM libraries indexed :: Refresh PCM repositories",
        ],
        "qualityGates": [
          "Schematic :: Ready - Run schematic checks",
          "Connectivity :: Ready - Run connectivity checks",
          "Placement :: Ready - Run placement checks",
          "PCB Transfer :: Ready - Run PCB transfer checks",
          "Manufacturing :: Ready - Run manufacturing checks",
        ],
        "validation": [
          "DRC :: Not run - Run DRC",
          "ERC :: Not run - Run ERC",
        ],
        "variants": [
          "No variants configured :: Create assembly variant",
        ],
      }
    `);
  });
});

function flattenSyncTree(provider: {
  getChildren(element?: never): unknown[];
  getTreeItem(element: never): vscode.TreeItem;
}): string[] {
  return flattenTree(provider, provider.getChildren());
}

function flattenTree(
  provider: { getTreeItem(element: never): vscode.TreeItem },
  nodes: readonly unknown[]
): string[] {
  return nodes.map((node) => {
    const item = provider.getTreeItem(node as never);
    return `${String(item.label)} :: ${String(item.description ?? '')}`;
  });
}

function createDiagnosticsCollection(): vscode.DiagnosticCollection {
  return {
    name: 'kicad',
    set: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
    forEach: jest.fn(),
    get: jest.fn(),
    has: jest.fn(),
    dispose: jest.fn(),
    [Symbol.iterator]: jest.fn(() => [][Symbol.iterator]())
  } as unknown as vscode.DiagnosticCollection;
}
