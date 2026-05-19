import * as assert from 'node:assert';
import * as path from 'node:path';
import * as vscode from 'vscode';

suite('Editor Flows Integration', () => {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  setup(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  test('opens schematic files with the custom schematic viewer', async () => {
    assert.ok(workspaceRoot, 'Expected test workspace root to be available.');
    const resource = vscode.Uri.file(
      path.join(workspaceRoot, 'sample.kicad_sch')
    );

    await vscode.commands.executeCommand(
      'vscode.openWith',
      resource,
      'kicadstudio.schematicViewer'
    );

    const tab = await waitForCustomTab(resource, 'kicadstudio.schematicViewer');
    assert.ok(
      tab.isActive,
      'Expected the schematic custom editor tab to become active.'
    );
  });

  test('opens PCB files with the custom PCB viewer', async () => {
    assert.ok(workspaceRoot, 'Expected test workspace root to be available.');
    const resource = vscode.Uri.file(
      path.join(workspaceRoot, 'sample.kicad_pcb')
    );

    await vscode.commands.executeCommand(
      'vscode.openWith',
      resource,
      'kicadstudio.pcbViewer'
    );

    const tab = await waitForCustomTab(resource, 'kicadstudio.pcbViewer');
    assert.ok(
      tab.isActive,
      'Expected the PCB custom editor tab to become active.'
    );
  });

  test('assigns the KiCad DRC language to .kicad_dru files', async () => {
    assert.ok(workspaceRoot, 'Expected test workspace root to be available.');
    const resource = vscode.Uri.file(
      path.join(workspaceRoot, 'kicad10', 'custom_drc.kicad_dru')
    );

    const document = await vscode.workspace.openTextDocument(resource);

    assert.strictEqual(document.languageId, 'kicad-drc');
  });
});

async function waitForCustomTab(
  resource: vscode.Uri,
  viewType: string
): Promise<vscode.Tab> {
  const timeoutAt = Date.now() + 10000;

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
