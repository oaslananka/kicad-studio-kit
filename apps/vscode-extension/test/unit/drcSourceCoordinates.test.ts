import * as fs from 'node:fs';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import { DrcSourceCoordinates } from '../../src/cli/drcSourceCoordinates';

describe('bounded genuine KiCad DRC source locator', () => {
  it('selects the exact KiCad item UUID instead of a nearby unrelated coordinate', () => {
    const padUuid = '22222222-2222-4222-8222-222222222222';
    const duplicateUuid = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const source = [
      '(kicad_pcb',
      '  (segment (at 10 10) (uuid "11111111-1111-4111-8111-111111111111"))',
      '  (pad "A" (at 0 0) (uuid "' + padUuid + '"))',
      '  (gr_text "quoted (uuid \\"33333333-3333-4333-8333-333333333333\\")")',
      '  ; (uuid "44444444-4444-4444-8444-444444444444")',
      '  (pad "B" (at 10 10) (uuid "' + duplicateUuid + '"))',
      '  (pad "C" (at 20 20) (uuid "' + duplicateUuid + '"))',
      ')'
    ].join('\n');
    const locator = new DrcSourceCoordinates(source);
    expect(locator.closest({ x: 10, y: 10 }).start.line).toBe(1);
    expect(
      locator.exactUuid([{ uuid: padUuid.toUpperCase() }])?.start.line
    ).toBe(2);
    expect(locator.exactUuid([{ uuid: duplicateUuid }])).toBeUndefined();
    expect(
      locator.exactUuid([{ uuid: '33333333-3333-4333-8333-333333333333' }])
    ).toBeUndefined();
    expect(
      locator.exactUuid([{ uuid: '44444444-4444-4444-8444-444444444444' }])
    ).toBeUndefined();
    expect(locator.exactUuid([{ uuid: 'not-a-uuid' }])).toBeUndefined();
    expect(locator.exactUuid(undefined)).toBeUndefined();
    expect(locator.exactUuid([null, {}, { uuid: 17 }])).toBeUndefined();
    expect(
      locator.exactUuid([
        { uuid: '99999999-9999-4999-8999-999999999999' },
        { uuid: padUuid }
      ])?.start.line
    ).toBe(2);
  });

  it('ignores string literals/comments, preserves source rows and nearest-distance ties', () => {
    const source = [
      '(kicad_pcb',
      '  (gr_text "literal (at 999 999)")',
      '  ; (at 700 700)',
      '  (at 12 34)',
      '  (at 212 234)',
      '  (at 12 36)',
      '  (at -2.5 3.4e+1 90)',
      ')'
    ].join('\n');
    const locator = new DrcSourceCoordinates(source);
    expect(locator.length).toBe(4);
    expect(locator.closest({ x: 12, y: 35 }).start.line).toBe(3);
    expect(locator.closest({ x: 212, y: 234 }).start.line).toBe(4);
    expect(locator.closest({ x: -2.5, y: 34 }).start.line).toBe(6);
    expect(locator.closest({ x: 999, y: 999 }).start.line).not.toBe(1);
    expect(locator.closest(undefined).start.line).toBe(0);
  });

  it('handles CRLF and an escaped quote without indexing artificial coordinates', () => {
    const source =
      '(kicad_pcb\r\n' +
      ' (gr_text "quote \\" and fake (at 999 999)")\r\n' +
      ' (at 1 2)\r\n' +
      ' (at 3 4)\r\n)';
    const locator = new DrcSourceCoordinates(source);
    expect(locator.length).toBe(2);
    expect(locator.closest({ x: 1, y: 2 }).start.line).toBe(2);
    expect(locator.closest({ x: 3, y: 4 }).start.line).toBe(3);
  });

  it('does not index coordinates embedded in a multi-megabyte quoted property', () => {
    const source =
      '(kicad_pcb\n (gr_text "' +
      'x'.repeat(5 * 1024 * 1024) +
      '(at 900 900)")\n (at 12 34)\n)';
    const locator = new DrcSourceCoordinates(source);
    expect(locator.length).toBe(1);
    expect(locator.closest({ x: 12, y: 34 }).start.line).toBe(2);
  });

  const demo = path.join(
    process.env['ProgramFiles'] ?? 'C:\\Program Files',
    'KiCad',
    '10.0',
    'share',
    'kicad',
    'demos',
    'vme-wren',
    'vme-wren.kicad_pcb'
  );
  (process.platform === 'win32' &&
    process.env['KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE'] === '1' &&
    fs.existsSync(demo)
    ? it
    : it.skip)(
    'indexes the real 71.6 MB / 12-layer VME Wren without building the full AST',
    () => {
      const source = fs.readFileSync(demo, 'utf8');
      const start = performance.now();
      const locator = new DrcSourceCoordinates(source);
      const elapsed = performance.now() - start;
      console.log(
        'REAL_VME_DRC_SOURCE_INDEX=' +
          JSON.stringify({
            sourceBytes: Buffer.byteLength(source, 'utf8'),
            candidates: locator.length,
            elapsedMs: Math.round(elapsed),
            heapMiB: Math.round(process.memoryUsage().heapUsed / 1048576)
          })
      );
      expect(locator.length).toBeGreaterThan(10000);
      expect(
        locator.exactUuid([{ uuid: '01217475-45bb-43de-ab6e-f2ff4d02c085' }])
          ?.start.line
      ).toBe(2086);
      expect(
        locator.closest({ x: 150.2, y: 84.25 }).start.line
      ).toBeGreaterThan(0);
    },
    45_000
  );
});
