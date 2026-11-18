import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { collectDiffSchematicSheets } from '../../src/providers/diffSchematicSources';

describe('multi-sheet versioned visual diff sources', () => {
  let dir: string;
  let main: string;
  let child: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-diff-sheets-'));
    main = path.join(dir, 'main.kicad_sch');
    fs.mkdirSync(path.join(dir, 'sch'));
    fs.writeFileSync(main, '(kicad_sch (version 20250114))');
    child = path.join(dir, 'sch', 'part.kicad_sch');
    fs.writeFileSync(child, '(kicad_sch (version 20250114))');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const mainText = (sheet: string) =>
    '(kicad_sch (version 20250114) (sheet (property "Sheetfile" "' +
    sheet +
    '")))';

  it('includes correctly named child sources from separate Git versions', () => {
    fs.writeFileSync(main, mainText('sch/part.kicad_sch'));
    const selected = collectDiffSchematicSheets(
      main,
      mainText('sch/part.kicad_sch'),
      'beforeText',
      (file) => {
        expect(file).toBe(child);
        return {
          beforeText: '(kicad_sch (version 20250114) (text "HEAD"))',
          afterText: '(kicad_sch (version 20250114) (text "WORKING"))'
        };
      }
    );
    expect(selected).toEqual([
      {
        name: 'sch/part.kicad_sch',
        text: '(kicad_sch (version 20250114) (text "HEAD"))'
      }
    ]);
    const working = collectDiffSchematicSheets(
      main,
      mainText('sch/part.kicad_sch'),
      'afterText',
      () => ({
        beforeText: '(kicad_sch (version 20250114) (text "HEAD"))',
        afterText: '(kicad_sch (version 20250114) (text "WORKING"))'
      })
    );
    expect(working[0]?.text).toContain('WORKING');
  });

  it('blocks escaping its design folder and symlinked out-of-project sheets', () => {
    const outside = path.join(os.tmpdir(), 'outside-diff-sheet.kicad_sch');
    expect(() =>
      collectDiffSchematicSheets(
        main,
        mainText('../outside-diff-sheet.kicad_sch'),
        'afterText',
        () => ({ beforeText: '', afterText: '' })
      )
    ).toThrow();
    const outsideDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'studio-diff-outside-')
    );
    const external = path.join(outsideDir, 'external.kicad_sch');
    fs.writeFileSync(external, '(kicad_sch (version 20250114))');
    fs.rmSync(child);
    fs.symlinkSync(external, child);
    try {
      expect(() =>
        collectDiffSchematicSheets(
          main,
          mainText('sch/part.kicad_sch'),
          'afterText',
          () => ({ beforeText: '', afterText: '' })
        )
      ).toThrow('outside its design folder');
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
    expect(outside).toContain('outside-diff-sheet');
  });

  it('avoids infinite loops and handles no-child schematics', () => {
    fs.writeFileSync(main, '(kicad_sch (version 20250114))');
    expect(
      collectDiffSchematicSheets(
        main,
        '(kicad_sch (version 20250114))',
        'beforeText',
        () => {
          throw new Error('should never load any child');
        }
      )
    ).toEqual([]);
  });
});
