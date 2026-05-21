import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { KiCadProjectTreeProvider } from '../../src/providers/projectTreeProvider';
import type { ProjectTreeNode } from '../../src/types';
import {
  __setConfiguration,
  Diagnostic,
  DiagnosticSeverity,
  languages,
  Range,
  Uri,
  workspace
} from './vscodeMock';

jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});

function childrenFor(
  root: ProjectTreeNode | undefined,
  label: string
): ProjectTreeNode[] {
  return root?.children?.find((node) => node.label === label)?.children ?? [];
}

function labelsFor(root: ProjectTreeNode | undefined, label: string): string[] {
  return childrenFor(root, label).map((node) => node.label);
}

function isCaseSensitiveDirectory(rootPath: string): boolean {
  const marker = path.join(rootPath, 'case-check');
  fs.writeFileSync(marker, '', 'utf8');
  return !fs.existsSync(path.join(rootPath, 'CASE-CHECK'));
}

describe('KiCadProjectTreeProvider', () => {
  const originalWorkspaceFolders = workspace.workspaceFolders;
  let tempDir: string | undefined;

  beforeEach(() => {
    __setConfiguration({});
    tempDir = undefined;
    workspace.workspaceFolders = originalWorkspaceFolders;
  });

  afterEach(() => {
    workspace.workspaceFolders = originalWorkspaceFolders;
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('groups core KiCad files by semantic project role', async () => {
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kicadstudio-project-tree-')
    );
    fs.writeFileSync(path.join(tempDir, 'demo.kicad_pro'), '{}', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'demo.kicad_sch'), '', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'upper.KICAD_SCH'), '', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'demo.kicad_pcb'), '', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'demo.kicad_dru'), '', 'utf8');

    const provider = new KiCadProjectTreeProvider();
    const project = await (
      provider as unknown as {
        buildWorkspaceNode(path: string): Promise<ProjectTreeNode>;
      }
    ).buildWorkspaceNode(tempDir);

    expect(project.children?.map((node) => node.label)).toEqual([
      'Project Files',
      'Schematic Sheets',
      'PCB',
      'Design Rules'
    ]);
    expect(labelsFor(project, 'Project Files')).toEqual(['demo.kicad_pro']);
    expect(childrenFor(project, 'Schematic Sheets')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'upper.KICAD_SCH',
          type: 'schematic'
        })
      ])
    );
  });

  it('uses distinct icons and open commands for KiCad file types', () => {
    const provider = new KiCadProjectTreeProvider();

    const schematic = provider.getTreeItem({
      label: 'demo.kicad_sch',
      type: 'schematic',
      uri: Uri.file('/project/demo.kicad_sch') as never
    });
    const pcb = provider.getTreeItem({
      label: 'demo.kicad_pcb',
      type: 'pcb',
      uri: Uri.file('/project/demo.kicad_pcb') as never
    });
    const rules = provider.getTreeItem({
      label: 'demo.kicad_dru',
      type: 'drc-rule',
      uri: Uri.file('/project/demo.kicad_dru') as never
    });

    expect(schematic.iconPath).toEqual(
      expect.objectContaining({ id: 'symbol-class' })
    );
    expect(schematic.command).toEqual(
      expect.objectContaining({ command: 'kicadstudio.openSchematic' })
    );
    expect(pcb.iconPath).toEqual(
      expect.objectContaining({ id: 'circuit-board' })
    );
    expect(pcb.command).toEqual(
      expect.objectContaining({ command: 'kicadstudio.openPCB' })
    );
    expect(rules.iconPath).toEqual(expect.objectContaining({ id: 'law' }));
    expect(rules.command).toEqual(
      expect.objectContaining({ command: 'vscode.open' })
    );
  });

  it('discovers KiCad project files deterministically without backup or generated noise', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kicadstudio-tree-'));
    workspace.workspaceFolders = [{ uri: Uri.file(tempDir) }] as never;
    __setConfiguration({ 'kicadstudio.defaultOutputDir': 'fab' });

    for (const file of [
      'board.kicad_pcb',
      'board.kicad_pro',
      'board.kicad_sch',
      'jobs/a-release.kicad_jobset',
      'jobs/z-release.kicad_jobset',
      'rules.kicad_dru',
      '.code-backups/board.kicad_pcb',
      '.history/board.kicad_sch',
      'board-backups/board.kicad_sch',
      'fab/board.kicad_pcb',
      'fab/report.pdf',
      'generated/board.kicad_pro',
      'temp/scratch.kicad_sch'
    ]) {
      const absolute = path.join(tempDir, file);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, '', 'utf8');
    }

    const provider = new KiCadProjectTreeProvider();
    const [root] = await provider.getChildren();

    expect(root?.label).toBe(path.basename(tempDir));
    expect(root?.children?.map((node) => node.label)).toEqual([
      'Project Files',
      'Schematic Sheets',
      'PCB',
      'Design Rules',
      'Jobsets',
      'Fabrication Outputs'
    ]);
    expect(labelsFor(root, 'Project Files')).toEqual(['board.kicad_pro']);
    expect(labelsFor(root, 'Schematic Sheets')).toEqual(['board.kicad_sch']);
    expect(labelsFor(root, 'PCB')).toEqual(['board.kicad_pcb']);
    expect(labelsFor(root, 'Design Rules')).toEqual(['rules.kicad_dru']);
    expect(labelsFor(root, 'Jobsets')).toEqual([
      'a-release.kicad_jobset',
      'z-release.kicad_jobset'
    ]);
    expect(labelsFor(root, 'Fabrication Outputs')).toEqual(['report.pdf']);
  });

  it('honors absolute output directories for source ignores and fabrication outputs', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kicadstudio-tree-'));
    const outputDir = path.join(tempDir, 'absolute-fab');
    workspace.workspaceFolders = [{ uri: Uri.file(tempDir) }] as never;
    __setConfiguration({ 'kicadstudio.defaultOutputDir': outputDir });

    for (const file of [
      'board.kicad_pcb',
      'absolute-fab/board.kicad_pcb',
      'absolute-fab/report.pdf'
    ]) {
      const absolute = path.join(tempDir, file);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, '', 'utf8');
    }

    const provider = new KiCadProjectTreeProvider();
    const [root] = await provider.getChildren();

    expect(labelsFor(root, 'PCB')).toEqual(['board.kicad_pcb']);
    expect(labelsFor(root, 'Fabrication Outputs')).toEqual(['report.pdf']);
  });

  it('keeps case-distinct source files and output directories separate on case-sensitive workspaces', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kicadstudio-tree-'));
    if (!isCaseSensitiveDirectory(tempDir)) {
      return;
    }
    workspace.workspaceFolders = [{ uri: Uri.file(tempDir) }] as never;
    __setConfiguration({ 'kicadstudio.defaultOutputDir': 'fab' });

    for (const file of [
      'Board.kicad_pcb',
      'board.kicad_pcb',
      'Fab/board.kicad_sch',
      'fab/board.kicad_pcb',
      'fab/report.pdf'
    ]) {
      const absolute = path.join(tempDir, file);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, '', 'utf8');
    }

    const provider = new KiCadProjectTreeProvider();
    const [root] = await provider.getChildren();

    expect(labelsFor(root, 'PCB')).toEqual([
      'Board.kicad_pcb',
      'board.kicad_pcb'
    ]);
    expect(labelsFor(root, 'Schematic Sheets')).toEqual(['board.kicad_sch']);
    expect(labelsFor(root, 'Fabrication Outputs')).toEqual(['report.pdf']);
  });

  it('explains file roles and diagnostic state with tooltips and ThemeIcons', () => {
    const provider = new KiCadProjectTreeProvider();
    (languages.getDiagnostics as jest.Mock).mockReturnValueOnce([
      new Diagnostic(
        new Range(0, 0, 0, 1),
        'Unconnected pin',
        DiagnosticSeverity.Error
      )
    ]);

    const schematic = provider.getTreeItem({
      label: 'demo.kicad_sch',
      type: 'schematic',
      uri: Uri.file('/project/demo.kicad_sch') as never
    });

    expect(schematic.description).toContain('Schematic sheet');
    expect(schematic.tooltip).toContain('Schematic sheet');
    expect(schematic.tooltip).toContain('1 error');
    expect(schematic.iconPath).toEqual(expect.objectContaining({ id: 'error' }));
  });

  it('aggregates diagnostics into project groups', () => {
    const provider = new KiCadProjectTreeProvider();
    (languages.getDiagnostics as jest.Mock).mockReturnValueOnce([
      new Diagnostic(
        new Range(0, 0, 0, 1),
        'Unconnected net',
        DiagnosticSeverity.Warning
      )
    ]);

    const schematicGroup = provider.getTreeItem({
      label: 'Schematic Sheets',
      type: 'folder',
      children: [
        {
          label: 'demo.kicad_sch',
          type: 'schematic',
          uri: Uri.file('/project/demo.kicad_sch') as never
        }
      ]
    });

    expect(schematicGroup.description).toContain('1 warning');
    expect(schematicGroup.tooltip).toContain('1 visible item');
    expect(schematicGroup.tooltip).toContain('1 warning');
    expect(schematicGroup.iconPath).toEqual(
      expect.objectContaining({ id: 'warning' })
    );
  });
});
