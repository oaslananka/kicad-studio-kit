import { KiCadProjectTreeProvider } from '../../src/providers/projectTreeProvider';
import { Uri } from './vscodeMock';

jest.mock('vscode', () => jest.requireActual('./vscodeMock'), {
  virtual: true
});

describe('KiCadProjectTreeProvider', () => {
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
});
