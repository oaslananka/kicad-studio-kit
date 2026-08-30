import { expect, test } from '@playwright/test';
import { launchVsCodeWithFixtures } from './vscodeHarness';

test.describe('KiCad Studio VS Code E2E', () => {
  test('activates the extension and renders KiCad workspace affordances', async () => {
    const session = await launchVsCodeWithFixtures();

    try {
      await expect(session.page.locator('body')).toContainText(
        'sample.kicad_sch'
      );
      await expect(session.page.locator('body')).toContainText(
        'sample.kicad_pcb'
      );
      await expectCommandPaletteEntry(
        session.page,
        'KiCad Studio: Open Task Hub'
      );

      const statusBar = session.page.locator('.statusbar');
      const hasKiCadItem = await statusBar.evaluate((el) =>
        /KiCad/.test(el.textContent ?? '')
      );
      if (hasKiCadItem) {
        await expect(statusBar).toContainText(
          /KiCad(?:: Not found| [0-9][0-9.]+)/
        );
        const hasKiCad = await statusBar.evaluate((el) =>
          /KiCad \d/.test(el.textContent ?? '')
        );
        if (hasKiCad) {
          await expect(statusBar).toContainText(/MCP/);
          await expect(statusBar).toContainText(/DRC: ./);
          await expect(statusBar).toContainText(/ERC: ./);
        }
      }
    } finally {
      await session.close();
    }
  });

  test('recovers the PCB viewer when WebGL is unavailable in the extension host', async () => {
    const session = await launchVsCodeWithFixtures({ disableWebgl: true });

    try {
      // This is a fresh VS Code session. Ensure the extension has activated
      // and registered its custom editors before opening the PCB; otherwise a
      // slow runner can race file opening against provider registration.
      await expectCommandPaletteEntry(
        session.page,
        'KiCad Studio: Open Task Hub'
      );
      await openWorkspaceFile(session.page, 'sample.kicad_pcb');

      await expect
        .poll(
          async () => {
            for (const frame of session.page.frames()) {
              const badge = frame.locator('#viewer-engine-badge');
              if ((await badge.count()) > 0) {
                return (await badge.textContent())?.trim() ?? '';
              }
            }
            return '';
          },
          { timeout: 60000 }
        )
        .toBe('CLI SVG fallback');
    } finally {
      await session.close();
    }
  });
});

async function openWorkspaceFile(
  page: import('@playwright/test').Page,
  fileName: string
) {
  const quickInput = page.locator('.quick-input-widget');
  await page.keyboard.press('Control+P');
  await expect(quickInput).toBeVisible({ timeout: 5000 });
  const input = quickInput.locator('input');
  await input.fill(fileName);
  await expect(quickInput).toContainText(fileName, { timeout: 5000 });
  await page.keyboard.press('Enter');
  await expect(quickInput).toBeHidden({ timeout: 5000 });
}

async function expectCommandPaletteEntry(
  page: import('@playwright/test').Page,
  query: string
) {
  const quickInput = page.locator('.quick-input-widget');
  // The extension registers its commands during activation, which on slow CI
  // runners can lag behind the first palette open. A single fill snapshots the
  // command registry once; if the command is registered a moment later, the
  // quick-open list never re-filters and the assertion times out (the Ubuntu
  // viewer flake). Re-open and re-filter until the entry is present so we await
  // a concrete readiness signal rather than a one-shot pre-activation snapshot.
  await expect(async () => {
    await page.keyboard.press('Control+Shift+P');
    await expect(quickInput).toBeVisible({ timeout: 5000 });
    const input = quickInput.locator('input');
    // Clear before re-filling so VS Code recomputes the picks against the
    // current registry even when the query text is unchanged between attempts.
    await input.fill('');
    await input.fill(`>${query}`);
    await expect(quickInput).toContainText(query, { timeout: 2000 });
  }).toPass({ timeout: 30000 });
  await page.keyboard.press('Escape');
  await expect(quickInput).toBeHidden();
}
