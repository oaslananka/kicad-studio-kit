import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Frame } from '@playwright/test';
import { launchVsCodeWithFixtures } from './vscodeHarness';

const vendorBoard = path.join(
  process.env.ProgramFiles ?? String.raw`C:\Program Files`,
  'KiCad',
  '10.0',
  'share',
  'kicad',
  'demos',
  'vme-wren',
  'vme-wren.kicad_pcb'
);

// An evidence-only experiment: use exact unchanged S-expressions from a
// genuine KiCad PCB to measure what a progressively loaded subset costs.
// Never present the subset as a complete or fabrication-safe board.
function sourceBoundedSample(source: string): {
  text: string;
  included: Record<string, number>;
} {
  const counts: Record<string, number> = {};
  const parts: string[] = [];
  const limits: Record<string, number> = {
    footprint: 48,
    segment: 400,
    arc: 30,
    via: 100,
    gr_line: 60,
    gr_arc: 30
  };
  const essential = new Set([
    'version',
    'generator',
    'generator_version',
    'general',
    'paper',
    'title_block',
    'layers',
    'setup',
    'net',
    'embedded_fonts'
  ]);

  let depth = 0;
  let quoted = false;
  let escaped = false;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const ch = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === '(') {
      if (depth === 1) start = index;
      depth += 1;
      continue;
    }
    if (ch !== ')') continue;
    depth -= 1;
    if (depth !== 1) continue;
    const key = /^\(\s*([a-zA-Z0-9_]+)/.exec(
      source.slice(start, start + 60)
    )?.[1];
    if (!key) continue;
    const count = counts[key] ?? 0;
    const limit = limits[key] ?? 0;
    if (essential.has(key) || count < limit) {
      parts.push(source.slice(start, index + 1));
      counts[key] = count + 1;
    }
  }
  if (depth !== 0 || quoted)
    throw new Error('Malformed KiCad source parenthesization.');
  if ((counts.layers ?? 0) !== 1 || (counts.footprint ?? 0) !== 48) {
    throw new Error(
      'Bounded genuine KiCad preview did not preserve expected source objects.'
    );
  }
  return {
    text: '(kicad_pcb\n' + parts.join('\n') + '\n)\n',
    included: counts
  };
}

test('Windows genuine 12-layer PCB bounded source subset reaches interactive KiCanvas', async () => {
  test.skip(
    process.platform !== 'win32' ||
      process.env.KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE !== '1' ||
      !fs.existsSync(vendorBoard),
    'Opt-in local Windows with the installed KiCad 10 VME Wren source'
  );
  test.setTimeout(110_000);

  const originalHash = createHash('sha256')
    .update(fs.readFileSync(vendorBoard))
    .digest('hex');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-vme-subset-'));
  const generated = path.join(base, 'VME-source-subset.kicad_pcb');
  const started = Date.now();
  let session: Awaited<ReturnType<typeof launchVsCodeWithFixtures>> | undefined;

  try {
    const source = fs.readFileSync(vendorBoard, 'utf8');
    const sample = sourceBoundedSample(source);
    fs.writeFileSync(generated, sample.text, 'utf8');
    console.log(
      'VME_EXACT_SOURCE_SUBSET_PREP_MS=' +
        (Date.now() - started) +
        ' ORIGINAL_BYTES=' +
        fs.statSync(vendorBoard).size +
        ' SUBSET_BYTES=' +
        fs.statSync(generated).size +
        ' OBJECTS=' +
        JSON.stringify(sample.included)
    );
    expect(fs.statSync(generated).size).toBeLessThan(6 * 1024 * 1024);
    session = await launchVsCodeWithFixtures({ workspaceSourcePath: base });
    await expect(session.page.locator('.statusbar')).toContainText('MCP', {
      timeout: 30000
    });
    const picker = session.page.locator('.quick-input-widget');
    await session.page.keyboard.press('Control+P');
    await expect(picker).toBeVisible();
    await picker.locator('input').fill(path.basename(generated));
    await expect(picker).toContainText(path.basename(generated), {
      timeout: 30000
    });
    await session.page.keyboard.press('Enter');
    await expect(session.page.locator('.tab.active')).toContainText(
      path.basename(generated)
    );

    let viewer: Frame | undefined;
    await expect
      .poll(
        async () => {
          for (const frame of session!.page.frames()) {
            if (await frame.locator('#viewer-engine-badge').count()) {
              viewer = frame;
              return true;
            }
          }
          return false;
        },
        { timeout: 35_000 }
      )
      .toBe(true);
    if (!viewer) throw new Error('Partial KiCad viewer never mounted.');
    await expect(viewer.locator('#viewer-engine-badge')).toHaveText(
      'KiCanvas',
      {
        timeout: 35000
      }
    );
    await expect(viewer.locator('#viewer-status')).toContainText(
      'Interactive renderer loaded',
      { timeout: 35000 }
    );
    console.log('VME_BOUNDED_SUBSET_RENDER_MS=' + (Date.now() - started));
    console.log('VME_BOUNDED_SUBSET_INTERACTIVE=PASS_PARTIAL_NOT_FULL_BOARD');
    expect(
      createHash('sha256').update(fs.readFileSync(vendorBoard)).digest('hex')
    ).toBe(originalHash);
    await test.info().attach('vme-bounded-subset', {
      body: await session.page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
  } finally {
    await session?.close();
    fs.rmSync(base, { recursive: true, force: true });
  }
});
