import * as assert from 'node:assert';
import * as path from 'node:path';
import * as vscode from 'vscode';

type ViewContribution = {
  id?: string;
  when?: string;
};

suite('VS Code Canary Compatibility', () => {
  let extension: vscode.Extension<unknown>;
  let workspaceRoot: string;

  suiteSetup(() => {
    const canaryExtension = vscode.extensions.getExtension(
      'oaslananka.kicadstudiokit'
    );
    assert.ok(canaryExtension, 'Expected KiCad Studio extension to load.');
    extension = canaryExtension;

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    assert.ok(root, 'Expected test workspace root to be available.');
    workspaceRoot = root;
  });

  setup(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  test('activates command, context-key, tree, and MCP Tools surfaces', async () => {
    await extension.activate();

    const commands = await vscode.commands.getCommands(true);
    for (const command of [
      'kicadstudio.openSchematic',
      'kicadstudio.openPCB',
      'kicadstudio.runDRC',
      'kicadstudio.runERC',
      'kicadstudio.setupMcpIntegration',
      'kicadstudio.mcp.retry',
      'kicadstudio.mcp.launchHttp',
      'kicadstudio.mcp.openUpgradeGuide',
      'kicadstudio.mcp.pickProfile',
      'kicadstudio.mcp.openLog',
      'kicadstudio.mcp.saveLog'
    ]) {
      assert.ok(commands.includes(command), `Missing command ${command}`);
    }

    const sidebarViews =
      (extension.packageJSON?.contributes?.views?.[
        'kicadstudio-sidebar'
      ] as ViewContribution[] | undefined) ?? [];
    assert.ok(
      sidebarViews.some((view) => view.id === 'kicadstudio.projectTree'),
      'Missing projectTree view contribution.'
    );
    assert.ok(
      sidebarViews.some((view) => view.id === 'kicadstudio.mcpTools'),
      'Missing mcpTools view contribution.'
    );

    const qualityGateView = sidebarViews.find(
      (view) => view.id === 'kicadstudio.qualityGate'
    );
    const qualityGateWhen = qualityGateView?.when ?? '';
    assert.ok(
      qualityGateWhen.includes('kicadstudio.hasProject'),
      'Expected project-gated quality gate contribution.'
    );
    assert.ok(
      !qualityGateWhen.includes('kicadstudio.mcpConnected'),
      'Expected quality gate to remain available before MCP connects.'
    );
  });

  test('registers custom editors and bootstraps the schematic webview host', async () => {
    const customEditors = extension.packageJSON?.contributes?.customEditors ?? [];
    assert.ok(
      customEditors.some(
        (item: { viewType?: string }) =>
          item.viewType === 'kicadstudio.schematicViewer'
      )
    );
    assert.ok(
      customEditors.some(
        (item: { viewType?: string }) =>
          item.viewType === 'kicadstudio.pcbViewer'
      )
    );

    const resource = vscode.Uri.file(
      path.join(workspaceRoot, 'sample.kicad_sch')
    );
    await vscode.commands.executeCommand(
      'vscode.openWith',
      resource,
      'kicadstudio.schematicViewer'
    );

    const tab = await waitForCustomTab(resource, 'kicadstudio.schematicViewer');
    assert.ok(tab.isActive, 'Expected the canary custom editor tab to activate.');
  });

  test('opens a KiCad document through the diagnostics lifecycle smoke path', async () => {
    const resource = vscode.Uri.file(
      path.join(workspaceRoot, 'sample.kicad_sch')
    );
    const document = await vscode.workspace.openTextDocument(resource);

    assert.strictEqual(document.languageId, 'kicad-schematic');
    assert.ok(Array.isArray(vscode.languages.getDiagnostics(resource)));
  });
});

async function waitForCustomTab(
  resource: vscode.Uri,
  viewType: string
): Promise<vscode.Tab> {
  const timeoutAt = Date.now() + 20000;

  while (Date.now() < timeoutAt) {
    const tab = vscode.window.tabGroups.all
      .flatMap((group) => group.tabs)
      .find(
        (candidate) =>
          candidate.input instanceof vscode.TabInputCustom &&
          candidate.input.viewType === viewType &&
          candidate.input.uri.fsPath === resource.fsPath
      );
    if (tab) {
      return tab;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(
    `Timed out waiting for custom editor ${viewType} (${resource.fsPath}).`
  );
}
