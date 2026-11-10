import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import { selectBoundedPcbPreview } from '../../src/providers/viewer/densePcbPreview';

const root = path.join(
  process.env.ProgramFiles ?? 'C:\\Program Files',
  'KiCad',
  '10.0'
);
const original = path.join(
  root,
  'share',
  'kicad',
  'demos',
  'vme-wren',
  'vme-wren.kicad_pcb'
);
const python = path.join(root, 'bin', 'python.exe');
const kicadCli = path.join(root, 'bin', 'kicad-cli.exe');
const oracle = path.join(
  __dirname,
  '..',
  'acceptance',
  'verifyNativeZoneFillParity.py'
);

test('native KiCad proves cached filled-zone truth excluded by PARTIAL preview', () => {
  test.skip(
    process.platform !== 'win32' ||
      process.env.KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE !== '1' ||
      !fs.existsSync(original) ||
      !fs.existsSync(python) ||
      !fs.existsSync(kicadCli),
    'Opt-in real installed KiCad 10 cached-fill acceptance'
  );
  test.setTimeout(120_000);
  const hash = () =>
    createHash('sha256').update(fs.readFileSync(original)).digest('hex');
  const before = hash();
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-zone-parity-'));
  try {
    const source = fs.readFileSync(original, 'utf8');
    const selected = selectBoundedPcbPreview(source, {
      viewport: { minX: 125, maxX: 215, minY: 195, maxY: 290 },
      layers: ['In2.Cu'],
      maxBytes: 2 * 1024 * 1024
    });
    expect(selected.complete).toBe(false);
    expect(selected.sourceObjects['zone']).toBe(128);
    expect(selected.omitted['zone']).toBe(128);
    expect(selected.omittedZonesByLayer['In2.Cu']).toBe(8);
    expect(selected.omittedZoneOutlinesInViewportByLayer['In2.Cu']).toBe(6);
    expect(selected.text).not.toContain('(zone ');
    const partial = path.join(stage, 'bounded.kicad_pcb');
    fs.writeFileSync(partial, selected.text, 'utf8');

    const svgPath = path.join(stage, 'in2.svg');
    const cliResult = spawnSync(
      kicadCli,
      [
        'pcb',
        'export',
        'svg',
        '--output',
        svgPath,
        '--layers',
        'In2.Cu',
        '--mode-single',
        '--exclude-drawing-sheet',
        '--page-size-mode',
        '0',
        '--drill-shape-opt',
        '2',
        original
      ],
      {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 60_000
      }
    );
    if (cliResult.error) throw cliResult.error;
    expect(cliResult.status, cliResult.stderr).toBe(0);
    expect(fs.existsSync(svgPath)).toBe(true);

    const check = spawnSync(python, [oracle, original, partial, svgPath], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 85_000,
      maxBuffer: 512 * 1024
    });
    if (check.error) throw check.error;
    expect(check.status, check.stderr.slice(-1000)).toBe(0);
    const actual = JSON.parse(check.stdout.trim()) as Record<string, unknown>;
    expect(actual).toMatchObject({
      zone_sources: 128,
      layer_zones: 8,
      source_intersections: 6,
      zones_with_cached_fill: 5,
      cached_fill_outline_intersections: 4,
      partial_zones: 0,
      svg_parity: {
        filled_zones_tested: 5,
        exact_path_matches: 5,
        total_source_points: 3980,
        total_svg_points: 3980,
        total_source_unique_vertices: 3092,
        pads_distinguished_from_zones: 55
      }
    });
    const svgParity = actual['svg_parity'] as Record<string, unknown>;
    expect(Number(svgParity['vertex_match_ratio'])).toBeGreaterThanOrEqual(
      0.998
    );
    console.log('NATIVE_KICAD_ZONE_CACHE_VS_PARTIAL=' + JSON.stringify(actual));
    expect(hash()).toBe(before);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
});
