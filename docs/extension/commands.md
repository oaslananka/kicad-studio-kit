# Extension Commands

Machine-maintained from `apps/vscode-extension/package.json` and `package.nls.json`.
Refresh with `corepack pnpm run docs:generate`.

Total contributed commands: 108.

| Command ID | Title | Category |
| --- | --- | --- |
| `kicadstudio.openSchematic` | KiCad: Open as Schematic Viewer | KiCad |
| `kicadstudio.openPCB` | KiCad: Open as PCB Viewer | KiCad |
| `kicadstudio.openInKiCad` | KiCad: Open in KiCad Application | KiCad |
| `kicadstudio.showStatusMenu` | KiCad: Show Status Menu | KiCad |
| `kicadstudio.detectCli` | KiCad: Detect kicad-cli | KiCad |
| `kicadstudio.exportGerbers` | KiCad: Export Gerber Files | KiCad Export |
| `kicadstudio.exportGerbersWithDrill` | KiCad: Export Gerbers + Drill Files | KiCad Export |
| `kicadstudio.exportPDF` | KiCad: Export PDF (Schematic) | KiCad Export |
| `kicadstudio.exportPCBPDF` | KiCad: Export PDF (PCB) | KiCad Export |
| `kicadstudio.exportSVG` | KiCad: Export SVG | KiCad Export |
| `kicadstudio.exportIPC2581` | KiCad: Export IPC-2581 | KiCad Export |
| `kicadstudio.exportODB` | KiCad: Export ODB++ | KiCad Export |
| `kicadstudio.export3DGLB` | KiCad: Export 3D Model (GLB) | KiCad Export |
| `kicadstudio.export3DBREP` | KiCad: Export 3D Model (BREP) | KiCad Export |
| `kicadstudio.export3DPLY` | KiCad: Export 3D Model (PLY) | KiCad Export |
| `kicadstudio.exportGenCAD` | KiCad: Export GenCAD | KiCad Export |
| `kicadstudio.exportIPCD356` | KiCad: Export IPC-D-356 Netlist | KiCad Export |
| `kicadstudio.exportDXF` | KiCad: Export DXF | KiCad Export |
| `kicadstudio.exportPickAndPlace` | KiCad: Export Pick and Place | KiCad Export |
| `kicadstudio.exportFootprintSVG` | KiCad: Export Footprint SVG | KiCad Export |
| `kicadstudio.exportSymbolSVG` | KiCad: Export Symbol SVG | KiCad Export |
| `kicadstudio.exportManufacturingPackage` | KiCad: Export Manufacturing Package | KiCad Export |
| `kicadstudio.exportBOMCSV` | KiCad: Export Bill of Materials (CSV) | KiCad Export |
| `kicadstudio.exportBOMXLSX` | KiCad: Export Bill of Materials (XLSX) | KiCad Export |
| `kicadstudio.exportNetlist` | KiCad: Export Netlist | KiCad Export |
| `kicadstudio.runJobset` | KiCad: Run Jobset | KiCad |
| `kicadstudio.exportInteractiveBOM` | KiCad: Export Interactive HTML BOM | KiCad Export |
| `kicadstudio.runDRC` | KiCad: Run Design Rule Check (DRC) | KiCad Check |
| `kicadstudio.runERC` | KiCad: Run Electrical Rule Check (ERC) | KiCad Check |
| `kicadstudio.searchComponent` | KiCad: Search Component (Octopart/Nexar, LCSC) | KiCad |
| `kicadstudio.showDiff` | KiCad: Show Visual Diff (Git) | KiCad |
| `kicadstudio.aiAnalyzeError` | KiCad: AI Analyze Selected Error | KiCad AI |
| `kicadstudio.aiProactiveDRC` | KiCad: AI Analyze Latest DRC Results | KiCad AI |
| `kicadstudio.aiExplainCircuit` | KiCad: AI Explain Selected Block | KiCad AI |
| `kicadstudio.openAiChat` | KiCad: Open AI Chat | KiCad AI |
| `kicadstudio.openSettings` | KiCad: Open Settings Panel | KiCad |
| `kicadstudio.testAiConnection` | KiCad: Test AI Connection | KiCad AI |
| `kicadstudio.searchLibrarySymbol` | KiCad: Search Symbol Library | KiCad Library |
| `kicadstudio.searchLibraryFootprint` | KiCad: Search Footprint Library | KiCad Library |
| `kicadstudio.reindexLibraries` | KiCad: Reindex Libraries | KiCad Library |
| `kicadstudio.refreshProjectTree` | KiCad: Refresh Project Tree | KiCad |
| `kicadstudio.saveExportPreset` | KiCad: Save Export Preset | KiCad |
| `kicadstudio.runExportPreset` | KiCad: Run Export Preset | KiCad |
| `kicadstudio.setOctopartApiKey` | KiCad: Set Octopart/Nexar API Key | KiCad Setup |
| `kicadstudio.setAiApiKey` | KiCad: Set AI API Key | KiCad Setup |
| `kicadstudio.clearAiKey` | KiCad: Clear AI Provider Key | KiCad Setup |
| `kicadstudio.clearSecrets` | KiCad: Clear Stored Secrets | KiCad Setup |
| `kicadstudio.showStoredSecrets` | KiCad: Show Stored Secret Keys | KiCad Setup |
| `kicadstudio.manageChatProvider` | KiCad: Manage Chat Provider | KiCad AI |
| `kicadstudio.export3DPdf` | KiCad: Export 3D PDF | KiCad Export |
| `kicadstudio.setupMcpIntegration` | KiCad: Setup MCP Integration | KiCad Setup |
| `kicadstudio.mcp.install` | KiCad: Install kicad-mcp-pro | KiCad |
| `kicadstudio.mcp.retry` | KiCad: Retry MCP Connection | KiCad |
| `kicadstudio.mcp.launchHttp` | KiCad: Launch kicad-mcp-pro (HTTP mode) | KiCad Setup |
| `kicadstudio.mcp.openUpgradeGuide` | KiCad: Open MCP Upgrade Guide | KiCad |
| `kicadstudio.mcp.pickProfile` | KiCad: Pick MCP Profile | KiCad |
| `kicadstudio.mcp.openLog` | KiCad: Open MCP Log | KiCad |
| `kicadstudio.mcp.saveLog` | KiCad: Save MCP Log | KiCad |
| `kicadstudio.mcp.clearLog` | KiCad: Clear MCP Log | KiCad |
| `kicadstudio.openDesignIntent` | KiCad: Open Design Intent | KiCad MCP |
| `kicadstudio.refreshFixQueue` | KiCad: Refresh AI Fix Queue | KiCad MCP |
| `kicadstudio.applyFixQueueItem` | KiCad: Apply AI Fix | KiCad MCP |
| `kicadstudio.fixQueue.apply` | KiCad: Apply Fix Queue Item | KiCad |
| `kicadstudio.fixQueue.applyAll` | KiCad: Apply All Fix Queue Items | KiCad |
| `kicadstudio.qualityGate.runAll` | KiCad: Run All Quality Gates | KiCad |
| `kicadstudio.qualityGate.runThis` | KiCad: Run This Quality Gate | KiCad |
| `kicadstudio.qualityGate.showRaw` | KiCad: Show Quality Gate Raw Output | KiCad |
| `kicadstudio.qualityGate.openDocs` | KiCad: Open Quality Gate Documentation | KiCad |
| `kicadstudio.manufacturing.release` | KiCad: Manufacturing Release Wizard | KiCad |
| `kicadstudio.variant.create` | KiCad: New Variant | KiCad Variants |
| `kicadstudio.variant.setActive` | KiCad: Set Active Variant | KiCad Variants |
| `kicadstudio.variant.diffBom` | KiCad: Compare Variant BOMs | KiCad Variants |
| `kicadstudio.variant.refresh` | KiCad: Refresh Variants | KiCad Variants |
| `kicadstudio.drcRule.reveal` | KiCad: Reveal DRC Rule | KiCad DRC |
| `kicadstudio.drcRule.createDefault` | KiCad: Create .kicad_dru File | KiCad DRC |
| `kicadstudio.drcRule.importTemplate` | KiCad: Import .kicad_dru Starter Template | KiCad DRC |
| `kicadstudio.drcRule.addWithMcp` | KiCad: Add DRC Rule with MCP | KiCad DRC |
| `kicadstudio.exportViewerSvg` | KiCad: Export Viewer SVG | KiCad Viewer |
| `kicadstudio.importPads` | KiCad: Import PADS Board | KiCad Import |
| `kicadstudio.importAltium` | KiCad: Import Altium Board | KiCad Import |
| `kicadstudio.importEagle` | KiCad: Import Eagle Board | KiCad Import |
| `kicadstudio.importCadstar` | KiCad: Import CADSTAR Board | KiCad Import |
| `kicadstudio.importFabmaster` | KiCad: Import Fabmaster Board | KiCad Import |
| `kicadstudio.importPcad` | KiCad: Import P-CAD Board | KiCad Import |
| `kicadstudio.importSolidworks` | KiCad: Import SolidWorks PCB | KiCad Import |
| `kicadstudio.importGeda` | KiCad: Import gEDA/Lepton PCB | KiCad Import |
| `kicadstudio.pcm.refresh` | KiCad: Refresh PCM Repositories | KiCad Library |
| `kicadstudio.pcm.filter` | KiCad: Filter PCM Packages | KiCad Library |
| `kicadstudio.pcm.install` | KiCad: Install PCM Package | KiCad Library |
| `kicadstudio.pcm.update` | KiCad: Update PCM Package | KiCad Library |
| `kicadstudio.pcm.updateAll` | KiCad: Update All PCM Packages | KiCad Library |
| `kicadstudio.pcm.uninstall` | KiCad: Uninstall PCM Package | KiCad Library |
| `kicadstudio.sendFeedback` | KiCad Studio: Send Feedback | KiCad Studio |
| `kicadstudio.importAllegro` | KiCad: Import Allegro Board | KiCad Import |
| `kicadstudio.boardReadyOps.check` | BoardReadyOps: Check Board Readiness | KiCad BoardReadyOps |
| `kicadstudio.boardReadyOps.configure` | BoardReadyOps: Configure Checks | KiCad BoardReadyOps |
| `kicadstudio.boardReadyOps.showReport` | BoardReadyOps: Show Readiness Report | KiCad BoardReadyOps |
| `kicadstudio.boardReadyOps.openDocs` | BoardReadyOps: Open Documentation | KiCad BoardReadyOps |
| `kicadstudio.export3DStep` | KiCad: Export 3D Model (STEP) | KiCad Export |
| `kicadstudio.export3DStpz` | KiCad: Export 3D Model (STEPZ) | KiCad Export |
| `kicadstudio.export3DXao` | KiCad: Export 3D Model (XAO) | KiCad Export |
| `kicadstudio.export3DStl` | KiCad: Export 3D Model (STL) | KiCad Export |
| `kicadstudio.export3DU3d` | KiCad: Export 3D Model (U3D) | KiCad Export |
| `kicadstudio.export3DVrml` | KiCad: Export 3D Model (VRML) | KiCad Export |
| `kicadstudio.exportPcbPs` | KiCad: Export PCB PostScript | KiCad Export |
| `kicadstudio.exportSchPs` | KiCad: Export Schematic PostScript | KiCad Export |
| `kicadstudio.exportStats` | KiCad: Export Board Statistics | KiCad Export |
| `kicadstudio.generateKicadDiffReport` | KiCad: Generate Diff Report | KiCad |
