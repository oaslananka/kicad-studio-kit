import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { KiCadProjectTreeProvider } from '../../src/providers/projectTreeProvider';
import { KiCadStatusBar } from '../../src/statusbar/kicadStatusBar';
import type { ProjectTreeNode } from '../../src/types';

type CommandContribution = {
  command?: string;
};

type CommandPaletteContribution = {
  command?: string;
  when?: string;
};

type ViewContribution = {
  id?: string;
  when?: string;
};

type ViewWelcomeContribution = {
  view?: string;
  when?: string;
};

suite('Extension Integration', () => {
  let extension: vscode.Extension<unknown>;
  let workspaceRoot: string;

  suiteSetup(() => {
    const loadedExtension = vscode.extensions.getExtension(
      'oaslananka.kicadstudio'
    );
    assert.ok(loadedExtension, 'Expected KiCad Studio extension to load.');
    extension = loadedExtension;

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    assert.ok(root, 'Expected test workspace root to be available.');
    workspaceRoot = root;
  });

  test('activates when .kicad_pro workspace opened', async () => {
    await extension.activate();
    assert.strictEqual(extension.isActive, true);
  });

  test('registers every package.json command at runtime', async () => {
    await extension.activate();
    const commands = await vscode.commands.getCommands(true);
    const contributedCommands = getContributedCommands(extension);
    const missing = contributedCommands.filter(
      (command) => !commands.includes(command)
    );

    assert.deepStrictEqual(missing, []);
  });

  test('declares activation, empty-workspace welcome, and Workspace Trust contracts', () => {
    const activationEvents = new Set(
      extension.packageJSON?.activationEvents ?? []
    );
    for (const extensionGlob of [
      '.kicad_pro',
      '.kicad_sch',
      '.kicad_pcb',
      '.kicad_dru',
      '.kicad_jobset'
    ]) {
      assert.ok(
        activationEvents.has(`workspaceContains:**/*${extensionGlob}`),
        `Missing activation event for ${extensionGlob}`
      );
    }

    const trust =
      extension.packageJSON?.capabilities?.untrustedWorkspaces ?? {};
    assert.strictEqual(trust.supported, 'limited');
    for (const restrictedConfiguration of [
      'kicadstudio.kicadCliPath',
      'kicadstudio.kicadPath',
      'kicadstudio.defaultOutputDir',
      'kicadstudio.cli.defineVars',
      'kicadstudio.mcp.endpoint',
      'kicadstudio.mcp.pushContext'
    ]) {
      assert.ok(
        trust.restrictedConfigurations?.includes(restrictedConfiguration),
        `Missing restricted Workspace Trust configuration ${restrictedConfiguration}`
      );
    }

    const welcome =
      (extension.packageJSON?.contributes
        ?.viewsWelcome as ViewWelcomeContribution[]) ?? [];
    for (const view of [
      'kicadstudio.validation',
      'kicadstudio.bomView',
      'kicadstudio.netlistView',
      'kicadstudio.drcRules'
    ]) {
      assert.ok(
        welcome.some(
          (item) =>
            item.view === view && String(item.when ?? '').includes('!kicadstudio.hasProject')
        ),
        `Missing empty-workspace welcome contribution for ${view}`
      );
    }
  });

  test('gates command palette commands by file state and Workspace Trust', () => {
    const commandPalette = getCommandPalettePolicies(extension);
    const commandsMissingPolicy = getContributedCommands(extension).filter(
      (command) => !commandPalette.has(command)
    );

    assert.deepStrictEqual(commandsMissingPolicy, []);

    for (const [command, expectedContexts] of [
      ['kicadstudio.openSchematic', ['kicadstudio.schematicOpen']],
      ['kicadstudio.openPCB', ['kicadstudio.pcbOpen']],
      [
        'kicadstudio.openInKiCad',
        ['kicadstudio.workspaceTrusted', 'resourceExtname']
      ],
      ['kicadstudio.detectCli', ['kicadstudio.workspaceTrusted']],
      [
        'kicadstudio.exportGerbers',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.pcbOpen']
      ],
      [
        'kicadstudio.exportGerbersWithDrill',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.pcbOpen']
      ],
      [
        'kicadstudio.exportPCBPDF',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.pcbOpen']
      ],
      [
        'kicadstudio.exportIPC2581',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.pcbOpen']
      ],
      [
        'kicadstudio.exportODB',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.pcbOpen']
      ],
      [
        'kicadstudio.export3DGLB',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.pcbOpen']
      ],
      [
        'kicadstudio.export3DBREP',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.pcbOpen']
      ],
      [
        'kicadstudio.export3DPLY',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.pcbOpen']
      ],
      [
        'kicadstudio.export3DPdf',
        [
          'kicadstudio.workspaceTrusted',
          'kicadstudio.pcbOpen',
          'kicadstudio.kicad10Plus'
        ]
      ],
      [
        'kicadstudio.exportGenCAD',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.pcbOpen']
      ],
      [
        'kicadstudio.exportIPCD356',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.pcbOpen']
      ],
      [
        'kicadstudio.exportPickAndPlace',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.pcbOpen']
      ],
      [
        'kicadstudio.exportManufacturingPackage',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.pcbOpen']
      ],
      [
        'kicadstudio.exportSVG',
        [
          'kicadstudio.workspaceTrusted',
          'kicadstudio.schematicOpen',
          'kicadstudio.pcbOpen'
        ]
      ],
      [
        'kicadstudio.exportDXF',
        [
          'kicadstudio.workspaceTrusted',
          'kicadstudio.schematicOpen',
          'kicadstudio.pcbOpen'
        ]
      ],
      [
        'kicadstudio.exportPDF',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.schematicOpen']
      ],
      [
        'kicadstudio.exportBOMCSV',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.schematicOpen']
      ],
      [
        'kicadstudio.exportBOMXLSX',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.schematicOpen']
      ],
      [
        'kicadstudio.exportNetlist',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.schematicOpen']
      ],
      [
        'kicadstudio.exportInteractiveBOM',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.schematicOpen']
      ],
      [
        'kicadstudio.runDRC',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.pcbOpen']
      ],
      [
        'kicadstudio.runERC',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.schematicOpen']
      ],
      [
        'kicadstudio.exportViewerSvg',
        ['kicadstudio.workspaceTrusted', 'activeCustomEditorId']
      ],
      [
        'kicadstudio.exportFootprintSVG',
        ['kicadstudio.workspaceTrusted', 'resourceExtname == .kicad_mod']
      ],
      [
        'kicadstudio.exportSymbolSVG',
        ['kicadstudio.workspaceTrusted', 'resourceExtname == .kicad_sym']
      ],
      [
        'kicadstudio.runJobset',
        ['kicadstudio.workspaceTrusted', 'resourceExtname == .kicad_jobset']
      ],
      [
        'kicadstudio.saveExportPreset',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.hasProject']
      ],
      [
        'kicadstudio.runExportPreset',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.hasProject']
      ],
      [
        'kicadstudio.setupMcpIntegration',
        ['kicadstudio.workspaceTrusted']
      ],
      [
        'kicadstudio.qualityGate.runAll',
        [
          'kicadstudio.workspaceTrusted',
          'kicadstudio.mcpConnected',
          'kicadstudio.hasProject'
        ]
      ],
      [
        'kicadstudio.openDesignIntent',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.mcpConnected']
      ],
      [
        'kicadstudio.variant.create',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.kicad10Plus']
      ],
      [
        'kicadstudio.variant.setActive',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.hasVariants']
      ],
      [
        'kicadstudio.variant.diffBom',
        ['kicadstudio.hasVariants']
      ],
      [
        'kicadstudio.importPads',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.hasProject']
      ],
      [
        'kicadstudio.importAltium',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.hasProject']
      ],
      [
        'kicadstudio.importEagle',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.hasProject']
      ],
      [
        'kicadstudio.importCadstar',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.hasProject']
      ],
      [
        'kicadstudio.importFabmaster',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.hasProject']
      ],
      [
        'kicadstudio.importPcad',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.hasProject']
      ],
      [
        'kicadstudio.importSolidworks',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.hasProject']
      ],
      [
        'kicadstudio.importGeda',
        ['kicadstudio.workspaceTrusted', 'kicadstudio.hasProject']
      ],
      [
        'kicadstudio.importAllegro',
        [
          'kicadstudio.workspaceTrusted',
          'kicadstudio.hasProject',
          'kicadstudio.allegroImportSupported'
        ]
      ]
    ] as Array<[string, string[]]>) {
      assertCommandPaletteWhen(commandPalette, command, expectedContexts);
    }

    for (const command of [
      'kicadstudio.applyFixQueueItem',
      'kicadstudio.fixQueue.apply',
      'kicadstudio.qualityGate.runThis',
      'kicadstudio.qualityGate.showRaw',
      'kicadstudio.drcRule.reveal'
    ]) {
      assert.strictEqual(
        commandPalette.get(command),
        'false',
        `${command} should be hidden from the Command Palette because it requires a tree item argument.`
      );
    }
  });

  test('registers all custom editors', async () => {
    const customEditors =
      extension.packageJSON?.contributes?.customEditors ?? [];
    assert.ok(
      customEditors.some(
        (item: any) => item.viewType === 'kicadstudio.schematicViewer'
      )
    );
    assert.ok(
      customEditors.some(
        (item: any) => item.viewType === 'kicadstudio.pcbViewer'
      )
    );
  });

  test('creates status bar command entry', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('kicadstudio.showStatusMenu'));
  });

  test('renders project tree fixture files with unique rows and role tooltips', async () => {
    const provider = new KiCadProjectTreeProvider();
    const [root] = await provider.getChildren();
    assert.ok(root, 'Expected project tree root to load from fixture workspace.');
    assert.strictEqual(root.label, path.basename(workspaceRoot));

    assertUniqueTreeRow(root, 'Project Files', 'sample.kicad_pro');
    const schematic = assertUniqueTreeRow(
      root,
      'Schematic Sheets',
      'sample.kicad_sch'
    );
    assertUniqueTreeRow(root, 'PCB', 'sample.kicad_pcb');

    const collection = vscode.languages.createDiagnosticCollection(
      'kicadstudio-integration-tree'
    );
    try {
      assert.ok(schematic.uri, 'Expected sample schematic URI.');
      collection.set(schematic.uri, [
        new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 1),
          'Fixture warning',
          vscode.DiagnosticSeverity.Warning
        )
      ]);

      const treeItem = provider.getTreeItem(schematic);
      assert.ok(
        String(treeItem.description ?? '').includes('Schematic sheet'),
        'Expected schematic tree row to describe its file role.'
      );
      assert.ok(
        String(treeItem.tooltip ?? '').includes('Schematic sheet'),
        'Expected schematic tree tooltip to explain its file role.'
      );
      assert.ok(
        String(treeItem.tooltip ?? '').includes('1 warning'),
        'Expected schematic tree tooltip to summarize diagnostics.'
      );
    } finally {
      collection.dispose();
    }
  });

  test('renders status bar validation counters and stale validation state', () => {
    const statusBar = new KiCadStatusBar({
      subscriptions: []
    } as unknown as vscode.ExtensionContext);

    try {
      statusBar.update({
        drc: {
          file: 'sample.kicad_pcb',
          errors: 2,
          warnings: 0,
          infos: 0,
          source: 'drc',
          freshness: 'stale',
          origin: 'kicad-cli',
          capturedAt: '2026-05-26T00:00:00.000Z',
          staleReason: 'Fixture board changed after validation.'
        },
        erc: {
          file: 'sample.kicad_sch',
          errors: 0,
          warnings: 0,
          infos: 0,
          source: 'erc',
          freshness: 'fresh-clean',
          origin: 'kicad-cli',
          capturedAt: '2026-05-26T00:00:00.000Z'
        }
      });

      const items = statusBar as unknown as {
        drcItem: vscode.StatusBarItem;
        ercItem: vscode.StatusBarItem;
      };
      assert.ok(
        items.drcItem.text.includes('stale'),
        'Expected stale DRC results to be marked stale instead of current failures.'
      );
      assert.ok(
        String(items.drcItem.tooltip ?? '').includes('Fixture board changed'),
        'Expected stale DRC tooltip to explain the stale reason.'
      );
      assert.ok(
        items.ercItem.text.includes('pass'),
        'Expected clean ERC results to render as a passing counter.'
      );
    } finally {
      statusBar.dispose();
    }
  });

  test('keeps #21 #22 #29 #33 regression surfaces wired in the Extension Development Host', () => {
    const sidebarViews =
      (extension.packageJSON?.contributes?.views?.[
        'kicadstudio-sidebar'
      ] as ViewContribution[] | undefined) ?? [];
    for (const viewId of [
      'kicadstudio.projectTree',
      'kicadstudio.netlistView',
      'kicadstudio.validation'
    ]) {
      assert.ok(
        sidebarViews.some((view) => view.id === viewId),
        `Missing sidebar view ${viewId}`
      );
    }

    const commandPalette = getCommandPalettePolicies(extension);
    assertCommandPaletteWhen(commandPalette, 'kicadstudio.showStatusMenu', []);
    assertCommandPaletteWhen(commandPalette, 'kicadstudio.runDRC', [
      'kicadstudio.pcbOpen'
    ]);
    assertCommandPaletteWhen(commandPalette, 'kicadstudio.runERC', [
      'kicadstudio.schematicOpen'
    ]);
  });

  test('scopes Problems diagnostics to exact URIs and clears stale diagnostics after a clean save', async () => {
    await extension.activate();
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kicadstudio-diagnostics-')
    );
    const dirtyUri = vscode.Uri.file(path.join(tempDir, 'dirty.kicad_sch'));
    const cleanUri = vscode.Uri.file(path.join(tempDir, 'clean.kicad_sch'));

    try {
      fs.writeFileSync(dirtyUri.fsPath, '(kicad_sch (unknown_node))', 'utf8');
      fs.writeFileSync(cleanUri.fsPath, '(kicad_sch)', 'utf8');

      const dirtyDocument = await vscode.workspace.openTextDocument(dirtyUri);
      await vscode.window.showTextDocument(dirtyDocument);

      const dirtyDiagnostics = await waitForDiagnostics(
        dirtyUri,
        (diagnostics) => diagnostics.length > 0
      );
      assert.ok(
        dirtyDiagnostics.some((diagnostic) =>
          diagnostic.message.includes('unknown_node')
        ),
        'Expected dirty schematic diagnostics to mention the unknown node.'
      );
      assert.deepStrictEqual(vscode.languages.getDiagnostics(cleanUri), []);

      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        dirtyUri,
        new vscode.Range(
          dirtyDocument.positionAt(0),
          dirtyDocument.positionAt(dirtyDocument.getText().length)
        ),
        '(kicad_sch)'
      );
      assert.strictEqual(await vscode.workspace.applyEdit(edit), true);
      assert.strictEqual(await dirtyDocument.save(), true);

      await waitForDiagnostics(
        dirtyUri,
        (diagnostics) => diagnostics.length === 0
      );
      assert.deepStrictEqual(vscode.languages.getDiagnostics(cleanUri), []);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

function getContributedCommands(
  extension: vscode.Extension<unknown>
): string[] {
  const commands =
    (extension.packageJSON?.contributes
      ?.commands as CommandContribution[]) ?? [];
  return commands
    .map((item) => item.command)
    .filter((command): command is string => Boolean(command));
}

function getCommandPalettePolicies(
  extension: vscode.Extension<unknown>
): Map<string, string> {
  const entries =
    (extension.packageJSON?.contributes?.menus
      ?.commandPalette as CommandPaletteContribution[]) ?? [];
  return new Map(
    entries
      .filter((item) => item.command)
      .map((item) => [item.command as string, item.when ?? ''])
  );
}

function assertCommandPaletteWhen(
  commandPalette: ReadonlyMap<string, string>,
  command: string,
  expectedContexts: readonly string[]
): void {
  assert.ok(
    commandPalette.has(command),
    `${command} is missing an explicit commandPalette visibility policy.`
  );
  const when = commandPalette.get(command) ?? '';
  for (const context of expectedContexts) {
    assert.ok(
      when.includes(context),
      `${command} commandPalette when-clause "${when}" must include "${context}".`
    );
  }
}

function childrenFor(
  root: ProjectTreeNode | undefined,
  label: string
): ProjectTreeNode[] {
  return root?.children?.find((node) => node.label === label)?.children ?? [];
}

function assertUniqueTreeRow(
  root: ProjectTreeNode,
  groupLabel: string,
  rowLabel: string
): ProjectTreeNode {
  const matches = childrenFor(root, groupLabel).filter(
    (node) => node.label === rowLabel
  );
  assert.strictEqual(
    matches.length,
    1,
    `Expected exactly one ${rowLabel} row under ${groupLabel}.`
  );
  return matches[0]!;
}

async function waitForDiagnostics(
  uri: vscode.Uri,
  predicate: (diagnostics: vscode.Diagnostic[]) => boolean
): Promise<vscode.Diagnostic[]> {
  const timeoutAt = Date.now() + 10000;
  let latest: vscode.Diagnostic[] = [];

  while (Date.now() < timeoutAt) {
    latest = vscode.languages.getDiagnostics(uri);
    if (predicate(latest)) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(
    `Timed out waiting for diagnostics for ${uri.toString()}: ${latest.map((diagnostic) => diagnostic.message).join('; ')}`
  );
}
