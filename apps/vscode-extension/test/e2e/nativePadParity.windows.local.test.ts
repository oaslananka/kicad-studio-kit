import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import { selectBoundedPcbPreview } from '../../src/providers/viewer/densePcbPreview';

const kicadRoot = path.join(
  process.env.ProgramFiles ?? String.raw`C:\Program Files`,
  'KiCad',
  '10.0'
);
const vendorBoard = path.join(
  kicadRoot,
  'share',
  'kicad',
  'demos',
  'vme-wren',
  'vme-wren.kicad_pcb'
);
const python = path.join(kicadRoot, 'bin', 'python.exe');
const parityScript = path.join(
  __dirname,
  '..',
  'acceptance',
  'verifyNativePadSubsetParity.py'
);

// Real KiCad 10 read-only parity, distinct from KiCanvas screenshot acceptance.
test('Windows bounded preview retains genuine KiCad pad placement, layers and nets', () => {
  test.skip(
    process.platform !== 'win32' ||
      process.env.KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE !== '1' ||
      !fs.existsSync(vendorBoard) ||
      !fs.existsSync(python),
    'Opt-in installed KiCad 10 Windows native pcbnew acceptance'
  );
  test.setTimeout(110_000);

  const sha = () =>
    createHash('sha256').update(fs.readFileSync(vendorBoard)).digest('hex');
  const originalHash = sha();
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-pad-parity-'));
  const viewport = { minX: 125, minY: 195, maxX: 215, maxY: 290 };
  const selections: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['unfiltered', []],
    ['inner', ['In2.Cu']],
    ['back', ['B.Cu']]
  ];

  try {
    const source = fs.readFileSync(vendorBoard, 'utf8');
    const paths: string[] = [];
    for (const [label, layers] of selections) {
      const preview = selectBoundedPcbPreview(source, {
        viewport,
        layers,
        maxBytes: 2 * 1024 * 1024
      });
      expect(preview.complete).toBe(false);
      expect(preview.warning).toContain('PARTIAL PREVIEW');
      expect(preview.includedFootprintPads).toBeGreaterThan(0);
      const file = path.join(stage, label + '.kicad_pcb');
      fs.writeFileSync(file, preview.text, 'utf8');
      paths.push(file);
    }

    const run = spawnSync(python, [parityScript, vendorBoard, ...paths], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 55_000,
      maxBuffer: 1024 * 1024
    });
    if (run.error) throw run.error;
    expect(run.status, run.stderr.slice(-1200)).toBe(0);
    const result = JSON.parse(run.stdout.trim()) as {
      original_pads: number;
      previews: Record<
        string,
        {
          pads: number;
          mismatches: number;
          rotated: number;
          back_side: number;
          in2_copper: number;
        }
      >;
    };
    expect(result.original_pads).toBe(6883);
    expect(result.previews['unfiltered']).toMatchObject({
      pads: 1043,
      mismatches: 0
    });
    expect(result.previews['inner']).toMatchObject({
      pads: 5,
      mismatches: 0,
      in2_copper: 5
    });
    expect(result.previews['back']).toMatchObject({
      pads: 97,
      mismatches: 0
    });
    expect(result.previews['unfiltered']?.rotated).toBeGreaterThan(0);
    expect(result.previews['back']?.back_side).toBeGreaterThan(0);
    expect(sha()).toBe(originalHash);
    console.log('VME_GENUINE_KICAD_PAD_PARITY=' + JSON.stringify(result));
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
});
