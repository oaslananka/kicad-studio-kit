import { assessUndefinedImportLayers } from '../../src/cli/importLayerMapping';

describe('undefined KiCad import layer repair safety', () => {
  it('passes through valid imported boards without changes', () => {
    expect(
      assessUndefinedImportLayers(
        '(kicad_pcb (footprint "R" (fp_line (layer "F.SilkS"))))'
      )
    ).toEqual({ count: 0, safeDrawingCount: 0 });
  });

  it('remaps footprint drawings only, retaining original geometry', () => {
    const source = `(kicad_pcb
      (footprint "F" (fp_line (start 1 2) (end 3 4) (layer "UNDEFINED"))
      (fp_arc (start 4 5) (mid 5 6) (end 6 7) (layer "UNDEFINED")))
      (segment (start 1 2) (end 3 4) (layer "F.Cu"))
    )`;
    const analysis = assessUndefinedImportLayers(source);
    expect(analysis.count).toBe(2);
    expect(analysis.safeDrawingCount).toBe(2);
    expect(analysis.repairedText).toBe(
      source.replaceAll('(layer "UNDEFINED")', '(layer "Dwgs.User")')
    );
    expect(analysis.repairedText).toContain('(segment (start 1 2)');
    expect(source).toContain('(layer "UNDEFINED")');
  });

  it('refuses copper track layers rather than repairing them', () => {
    const source = '(kicad_pcb (segment (start 1 2) (layer "UNDEFINED")))';
    expect(assessUndefinedImportLayers(source)).toEqual({
      count: 1,
      safeDrawingCount: 0
    });
  });

  it('refuses mixed drawing and unknown copper layers', () => {
    const source =
      '(kicad_pcb (footprint "F" (fp_line (layer "UNDEFINED"))) (zone (layer "UNDEFINED")))';
    expect(assessUndefinedImportLayers(source)).toEqual({
      count: 2,
      safeDrawingCount: 1
    });
  });

  it('refuses unknown pad layer collections', () => {
    const source =
      '(kicad_pcb (footprint "F" (pad "1" smd rect (layers "UNDEFINED"))))';
    expect(assessUndefinedImportLayers(source)).toEqual({
      count: 1,
      safeDrawingCount: 0
    });
  });

  it('does not remap text that only resembles a layer expression', () => {
    const source = '(kicad_pcb (property "comment" "(layer \\"UNDEFINED\\")"))';
    const result = assessUndefinedImportLayers(source);
    expect(result.count).toBe(0);
    expect(result.repairedText).toBeUndefined();
  });

  it('fails closed on structurally truncated boards', () => {
    const source = '(kicad_pcb (footprint "F" (fp_line (layer "UNDEFINED"))';
    const result = assessUndefinedImportLayers(source);
    expect(result.count).toBe(1);
    expect(result.repairedText).toBeUndefined();
  });
  it('repairs top-level graphics, dimensions and dimension labels without touching copper', () => {
    const source = `(kicad_pcb
      (gr_text "OS" (at 1 2) (layer "UNDEFINED"))
      (dimension (type aligned) (layer "UNDEFINED")
        (gr_text "12mm" (at 5 6) (layer "UNDEFINED")))
      (segment (layer "F.Cu"))
    )`;
    const a = assessUndefinedImportLayers(source);
    expect(a).toMatchObject({ count: 3, safeDrawingCount: 3 });
    expect(a.repairedText).toContain('(layer "Dwgs.User")');
    expect(a.repairedText).toContain('(segment (layer "F.Cu"))');
  });

  it('refuses footprint pad references even when a drawing can be remapped', () => {
    const source =
      '(kicad_pcb (footprint "F" (fp_line (layer "UNDEFINED")) (pad "1" smd rect (layer "UNDEFINED"))))';
    const a = assessUndefinedImportLayers(source);
    expect(a).toMatchObject({ count: 2, safeDrawingCount: 1 });
    expect(a.repairedText).toBeUndefined();
  });
});
