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
      await expectCommandPaletteEntry(session.page, 'KiCad: Setup MCP');

      const statusBar = session.page.locator('.statusbar');
      await expect(statusBar).toContainText(/MCP (Setup|Available|Connected)/);
      await expect(statusBar).toContainText(
        /KiCad(?:: Not found| [0-9][0-9.]+)/
      );
      await expect(statusBar).toContainText(/DRC: ./);
      await expect(statusBar).toContainText(/ERC: ./);
    } finally {
      await session.close();
    }
  });
});

async function expectCommandPaletteEntry(
  page: import('@playwright/test').Page,
  query: string
) {
  await page.keyboard.press('Control+Shift+P');
  const quickInput = page.locator('.quick-input-widget');
  await expect(quickInput).toBeVisible();
  await quickInput.locator('input').fill(`>${query}`);
  await expect(quickInput).toContainText(query);
  await page.keyboard.press('Escape');
  await expect(quickInput).toBeHidden();
}
