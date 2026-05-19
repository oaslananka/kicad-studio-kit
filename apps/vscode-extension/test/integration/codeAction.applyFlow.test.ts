import * as assert from 'node:assert';
import * as vscode from 'vscode';

suite('Fix Queue Code Action Integration', () => {
  test('registers fix queue apply commands for code actions', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('kicadstudio.fixQueue.apply'));
    assert.ok(commands.includes('kicadstudio.fixQueue.applyAll'));
  });

  test('contributes kicad command categories for new fix commands', () => {
    const extension = vscode.extensions.getExtension('oaslananka.kicadstudio');
    assert.ok(extension);
    const packageJson = extension.packageJSON as {
      contributes?: {
        commands?: Array<{ command?: string; category?: string }>;
      };
    };
    const commandEntries = packageJson.contributes?.commands ?? [];
    for (const command of [
      'kicadstudio.fixQueue.apply',
      'kicadstudio.fixQueue.applyAll'
    ]) {
      const entry = commandEntries.find(
        (candidate) => candidate.command === command
      );
      assert.strictEqual(entry?.category, 'KiCad');
    }
  });
});
