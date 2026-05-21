import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { KiCadProjectTreeProvider } from '../../src/providers/projectTreeProvider';
import type { ProjectTreeNode } from '../../src/types';
import {
  Diagnostic,
  DiagnosticSeverity,
  languages,
  Range,
  Uri
} from './vscodeMock';

jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});

describe('KiCadProjectTreeProvider', () => {
  it('groups core KiCad files by semantic project role', async () => {
    const rootPath = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kicadstudio-project-tree-')
    );
    fs.writeFileSync(path.join(rootPath, 'demo.kicad_pro'), '{}', 'utf8');
    fs.writeFileSync(path.join(rootPath, 'demo.kicad_sch'), '', 'utf8');
    fs.writeFileSync(path.join(rootPath, 'upper.KICAD_SCH'), '', 'utf8');
    fs.writeFileSync(path.join(rootPath, 'demo.kicad_pcb'), '', 'utf8');
    fs.writeFileSync(path.join(rootPath, 'demo.kicad_dru'), '', 'utf8');

    const provider = new KiCadProjectTreeProvider();
    const project = await (
      provider as unknown as {
        buildWorkspaceNode(path: string): Promise<ProjectTreeNode>;
      }
    ).buildWorkspaceNode(rootPath);

    expect(project.children?.map((node) => node.label)).toEqual([
      'Project Files',
      'Schematic Sheets',
      'PCB',
      'Design Rules'
    ]);
    expect(project.children?.[0]?.children?.map((node) => node.label)).toEqual([
      'demo.kicad_pro'
    ]);
    expect(project.children?.[1]?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'upper.KICAD_SCH',
          type: 'schematic'
        })
      ])
    );

    fs.rmSync(rootPath, { recursive: true, force: true });
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

    expect(schematic.iconPath).toEqual(expect.objectContaining({ id: 'symbol-class' }));
    expect(schematic.command).toEqual(
      expect.objectContaining({ command: 'kicadstudio.openSchematic' })
    );
    expect(pcb.iconPath).toEqual(expect.objectContaining({ id: 'circuit-board' }));
    expect(pcb.command).toEqual(
      expect.objectContaining({ command: 'kicadstudio.openPCB' })
    );
    expect(rules.iconPath).toEqual(expect.objectContaining({ id: 'law' }));
    expect(rules.command).toEqual(expect.objectContaining({ command: 'vscode.open' }));
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
