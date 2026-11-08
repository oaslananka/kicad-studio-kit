import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Frame } from '@playwright/test';
import { launchVsCodeWithFixtures } from './vscodeHarness';

const schematic = 'RoyalBlue54L-Feather.kicad_sch';
const demoDir = path.join(
  process.env.ProgramFiles ?? String.raw`C:\Program Files`,
  'KiCad',
  '10.0',
  'share',
  'kicad',
  'demos',
  'royalblue54L_feather'
);

function sha256(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('native schematic reference lookup verifies placed source before announcing success', async () => {
  test.skip(
    process.platform !== 'win32' ||
      process.env.KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE !== '1' ||
      !fs.existsSync(path.join(demoDir, schematic)),
    'Explicitly opted-in genuine KiCad 10 Windows schematic acceptance'
  );
  test.setTimeout(160_000);
  const original = path.join(demoDir, schematic);
  const sourceHash = sha256(original);
  const session = await launchVsCodeWithFixtures({
    workspaceSourcePath: demoDir
  });
  try {
    await expect(session.page.locator('.statusbar')).toContainText('MCP', {
      timeout: 60_000
    });
    const source = session.page
      .locator('.explorer-folders-view')
      .getByText(schematic, { exact: true });
    await expect(source).toBeVisible();
    await source.dblclick();
    await expect(session.page.locator('.tab.active')).toContainText(schematic);

    let frame: Frame | undefined;
    await expect
      .poll(
        async () => {
          for (const item of session.page.frames()) {
            if (await item.locator('#reference-search').count()) {
              frame = item;
              return true;
            }
          }
          return false;
        },
        { timeout: 50_000 }
      )
      .toBe(true);
    if (!frame)
      throw new Error('Schematic custom editor webview did not mount.');
    await expect
      .poll(
        async () => (await frame!.locator('#viewer-status').innerText()).trim(),
        {
          timeout: 80_000
        }
      )
      .toMatch(/Interactive renderer loaded|CLI SVG fallback loaded/);
    const fallback = (
      await frame.locator('#viewer-status').innerText()
    ).includes('CLI SVG fallback loaded');
    console.log(
      'NATIVE_SCHEMATIC_RENDER_MODE=' + (fallback ? 'SVG_FALLBACK' : 'KICANVAS')
    );
    const input = frame.locator('#reference-search');
    const status = frame.locator('#viewer-status');
    await input.fill('NONEXISTENT999');
    await frame.locator('#reference-search-btn').click();
    await expect(status).toContainText(
      'Reference NONEXISTENT999 was not found in this schematic.'
    );
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    if (fallback) {
      expect(await frame.locator('kicanvas-embed').count()).toBe(0);
    } else {
      expect(
        await frame.locator('kicanvas-embed').getAttribute('selected-reference')
      ).not.toBe('NONEXISTENT999');
    }
    console.log('NATIVE_SCHEMATIC_UNKNOWN_REFERENCE_REJECTED=PASS');

    // H2 is a real source-placed component in the official KiCad 10 fixture.
    await input.fill('h2');
    await frame.locator('#reference-search-btn').click();
    await expect(input).not.toHaveAttribute('aria-invalid', 'true');
    if (fallback) {
      await expect(status).toContainText(
        'Reference H2 found in source; visual focus is unavailable in SVG fallback.'
      );
      expect(await frame.locator('kicanvas-embed').count()).toBe(0);
      console.log('NATIVE_SCHEMATIC_FALLBACK_VISUAL_FOCUS_NOT_CLAIMED=PASS');
    } else {
      await expect(status).toContainText('Reference H2');
      const result = await status.innerText();
      if (result.includes('Focused schematic reference: H2')) {
        await expect(frame.locator('kicanvas-embed')).toHaveAttribute(
          'selected-reference',
          'H2'
        );
        const focused = await frame.evaluate(() => {
          const embed = document.querySelector('kicanvas-embed') as any;
          const renderer =
            embed?.shadowRoot?.querySelector('kc-schematic-app')?.viewer;
          const selected = renderer?.selected;
          const bounds = renderer?.viewport?.camera?.bbox;
          return {
            selected: Boolean(selected),
            cameraContainsSelection:
              Boolean(bounds) &&
              bounds.x <= selected?.x &&
              bounds.y <= selected?.y &&
              bounds.x + bounds.w >= selected.x + selected.w &&
              bounds.y + bounds.h >= selected.y + selected.h
          };
        });
        expect(focused.selected).toBe(true);
        expect(focused.cameraContainsSelection).toBe(true);
        console.log('NATIVE_SCHEMATIC_GRAPHICAL_OBJECT_FOCUS=PASS');
      } else {
        expect(result).toMatch(
          /Reference H2 found in source; graphical focus (is unavailable|failed) in this renderer/
        );
        console.log(
          'NATIVE_SCHEMATIC_GRAPHICAL_FOCUS_UNAVAILABLE_TRUTHFUL=PASS'
        );
      }
    }
    console.log('NATIVE_SCHEMATIC_SOURCE_REFERENCE_MATCH=PASS');

    const copied = path.join(session.workspacePath, schematic);
    expect(sha256(copied)).toBe(sourceHash);
    expect(sha256(original)).toBe(sourceHash);
    console.log('NATIVE_SCHEMATIC_SOURCE_UNCHANGED=PASS');
  } finally {
    await session.close();
  }
});
