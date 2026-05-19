import * as path from 'node:path';
import * as vscode from 'vscode';
import { DrcRulesProvider } from '../../src/drc/drcRulesProvider';
import { SExpressionParser } from '../../src/language/sExpressionParser';
import { window, workspace } from './vscodeMock';

describe('DrcRulesProvider', () => {
  const fixturePath = path.join(
    process.cwd(),
    'test',
    'fixtures',
    'kicad10',
    'custom_drc.kicad_dru'
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (workspace.findFiles as jest.Mock).mockResolvedValue([
      vscode.Uri.file(fixturePath)
    ]);
  });

  it('loads rule names, conditions, and constraints from a .kicad_dru file', async () => {
    const provider = new DrcRulesProvider(new SExpressionParser());

    await (provider as any).load();

    const items = provider.getChildren();
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.name)).toEqual([
      'min_usb_clearance',
      'rf_keepout'
    ]);
    expect(items[0]?.constraint).toContain('clearance min 0.20mm');
    expect(items[1]?.condition).toContain("A.Footprint == 'RF_ANT'");
  });

  it('renders tree items with readable metadata', async () => {
    const provider = new DrcRulesProvider(new SExpressionParser());

    await (provider as any).load();

    const [item] = provider.getChildren();
    if (!item) {
      throw new Error('Expected at least one DRC rule item.');
    }
    const treeItem = provider.getTreeItem(item);
    expect(treeItem.label).toBe('min_usb_clearance');
    expect(treeItem.description).toContain('clearance');
    expect(String(treeItem.tooltip)).toContain("A.NetClass == 'USB'");
  });

  it('reveals the rule location in the editor', async () => {
    const provider = new DrcRulesProvider(new SExpressionParser());
    const revealRange = jest.fn();
    const editor = { selection: undefined, revealRange };
    (workspace.openTextDocument as jest.Mock).mockResolvedValue({
      uri: vscode.Uri.file(fixturePath)
    });
    (window.showTextDocument as jest.Mock).mockResolvedValue(editor);

    await provider.reveal({
      file: fixturePath,
      name: 'min_usb_clearance',
      range: new vscode.Range(0, 0, 2, 1)
    });

    expect(workspace.openTextDocument).toHaveBeenCalledWith(fixturePath);
    expect(window.showTextDocument).toHaveBeenCalled();
    expect(editor.selection).toBeInstanceOf(vscode.Selection);
    expect(revealRange).toHaveBeenCalled();
  });

  it('returns an empty list when no DRC rules file exists', async () => {
    const provider = new DrcRulesProvider(new SExpressionParser());
    (workspace.findFiles as jest.Mock).mockResolvedValue([]);

    await (provider as any).load();

    expect(provider.getChildren()).toEqual([]);
  });

  it('loads and merges rules from every .kicad_dru file in the workspace', async () => {
    const extraFile = path.join(
      process.cwd(),
      'test',
      'fixtures',
      'kicad10',
      'extra_rules.kicad_dru'
    );
    (workspace.findFiles as jest.Mock).mockResolvedValue([
      vscode.Uri.file(fixturePath),
      vscode.Uri.file(extraFile)
    ]);
    const provider = new DrcRulesProvider(new SExpressionParser());

    await (provider as any).load();

    expect(
      provider
        .getChildren()
        .map((item) => `${path.basename(item.file)}:${item.name}`)
    ).toEqual([
      'custom_drc.kicad_dru:min_usb_clearance',
      'custom_drc.kicad_dru:rf_keepout',
      'extra_rules.kicad_dru:power_clearance'
    ]);
  });

  it('keeps KiCad 10 multi-constraint rule syntax readable', async () => {
    const advancedFile = path.join(
      process.cwd(),
      'test',
      'fixtures',
      'kicad10',
      'advanced_rules.kicad_dru'
    );
    (workspace.findFiles as jest.Mock).mockResolvedValue([
      vscode.Uri.file(advancedFile)
    ]);
    const provider = new DrcRulesProvider(new SExpressionParser());

    await (provider as any).load();

    const [item] = provider.getChildren();
    expect(item?.name).toBe('kicad10_diff_pair_inner_layer');
    expect(item?.condition).toContain("A.Layer == 'In1.Cu'");
    expect(item?.constraint).toContain(
      'diff_pair_gap min 0.12mm opt 0.15mm max 0.20mm'
    );
  });
});
