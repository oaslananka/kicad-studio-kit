import * as assert from 'node:assert';
import * as vscode from 'vscode';

suite('Quality Gate Integration', () => {
  test('contributes quality gate view and commands', async () => {
    const extension = vscode.extensions.getExtension('oaslananka.kicadstudio');
    assert.ok(extension);
    const packageJson = extension.packageJSON as {
      contributes?: {
        views?: Record<string, Array<{ id?: string; when?: string }>>;
        commands?: Array<{ command?: string; category?: string }>;
      };
    };
    const sidebarViews =
      packageJson.contributes?.views?.['kicadstudio-sidebar'] ?? [];
    assert.ok(
      sidebarViews.some(
        (view) =>
          view.id === 'kicadstudio.qualityGate' &&
          view.when === 'kicadstudio.mcpConnected && kicadstudio.hasProject'
      )
    );

    const commands = await vscode.commands.getCommands(true);
    for (const command of [
      'kicadstudio.qualityGate.runAll',
      'kicadstudio.qualityGate.runThis',
      'kicadstudio.qualityGate.showRaw',
      'kicadstudio.qualityGate.openDocs'
    ]) {
      assert.ok(commands.includes(command), `Missing command ${command}`);
    }
  });
});
