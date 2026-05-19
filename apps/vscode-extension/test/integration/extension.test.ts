import * as assert from 'node:assert';
import * as vscode from 'vscode';

suite('Extension Integration', () => {
  test('activates when .kicad_pro workspace opened', async () => {
    const extension = vscode.extensions.getExtension('oaslananka.kicadstudio');
    assert.ok(extension);
    await extension?.activate();
    assert.strictEqual(extension?.isActive, true);
  });

  test('registers all commands', async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const command of [
      'kicadstudio.openSchematic',
      'kicadstudio.openPCB',
      'kicadstudio.openInKiCad',
      'kicadstudio.showStatusMenu',
      'kicadstudio.detectCli',
      'kicadstudio.exportGerbers',
      'kicadstudio.exportGerbersWithDrill',
      'kicadstudio.exportPDF',
      'kicadstudio.exportPCBPDF',
      'kicadstudio.exportSVG',
      'kicadstudio.exportIPC2581',
      'kicadstudio.exportODB',
      'kicadstudio.export3DGLB',
      'kicadstudio.export3DBREP',
      'kicadstudio.export3DPLY',
      'kicadstudio.exportGenCAD',
      'kicadstudio.exportIPCD356',
      'kicadstudio.exportDXF',
      'kicadstudio.exportPickAndPlace',
      'kicadstudio.exportFootprintSVG',
      'kicadstudio.exportSymbolSVG',
      'kicadstudio.exportManufacturingPackage',
      'kicadstudio.exportBOMCSV',
      'kicadstudio.exportBOMXLSX',
      'kicadstudio.exportNetlist',
      'kicadstudio.runJobset',
      'kicadstudio.exportInteractiveBOM',
      'kicadstudio.runDRC',
      'kicadstudio.runERC',
      'kicadstudio.searchComponent',
      'kicadstudio.showDiff',
      'kicadstudio.openAiChat',
      'kicadstudio.aiAnalyzeError',
      'kicadstudio.aiProactiveDRC',
      'kicadstudio.aiExplainCircuit',
      'kicadstudio.testAiConnection',
      'kicadstudio.searchLibrarySymbol',
      'kicadstudio.searchLibraryFootprint',
      'kicadstudio.reindexLibraries',
      'kicadstudio.saveExportPreset',
      'kicadstudio.runExportPreset',
      'kicadstudio.setOctopartApiKey',
      'kicadstudio.setAiApiKey',
      'kicadstudio.clearSecrets',
      'kicadstudio.showStoredSecrets',
      'kicadstudio.manageChatProvider',
      'kicadstudio.export3DPdf',
      'kicadstudio.setupMcpIntegration',
      'kicadstudio.mcp.install',
      'kicadstudio.mcp.retry',
      'kicadstudio.mcp.openUpgradeGuide',
      'kicadstudio.mcp.pickProfile',
      'kicadstudio.mcp.openLog',
      'kicadstudio.mcp.saveLog',
      'kicadstudio.mcp.clearLog',
      'kicadstudio.openDesignIntent',
      'kicadstudio.refreshFixQueue',
      'kicadstudio.applyFixQueueItem',
      'kicadstudio.fixQueue.apply',
      'kicadstudio.fixQueue.applyAll',
      'kicadstudio.qualityGate.runAll',
      'kicadstudio.qualityGate.runThis',
      'kicadstudio.qualityGate.showRaw',
      'kicadstudio.qualityGate.openDocs',
      'kicadstudio.manufacturing.release',
      'kicadstudio.variant.create',
      'kicadstudio.variant.setActive',
      'kicadstudio.variant.diffBom',
      'kicadstudio.variant.refresh',
      'kicadstudio.drcRule.reveal',
      'kicadstudio.drcRule.addWithMcp',
      'kicadstudio.exportViewerSvg',
      'kicadstudio.importPads',
      'kicadstudio.importAltium',
      'kicadstudio.importEagle',
      'kicadstudio.importCadstar',
      'kicadstudio.importFabmaster',
      'kicadstudio.importPcad',
      'kicadstudio.importSolidworks'
    ]) {
      assert.ok(commands.includes(command), `Missing command ${command}`);
    }
  });

  test('registers all custom editors', async () => {
    const extension = vscode.extensions.getExtension('oaslananka.kicadstudio');
    const customEditors =
      extension?.packageJSON?.contributes?.customEditors ?? [];
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
});
