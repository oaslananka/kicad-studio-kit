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
      // These items exist after activation whether kicad-cli is installed or
      // not. A missing CLI intentionally renders only "KiCad" with a warning
      // icon; numeric version text is shown only when detection succeeded.
      // DRC/ERC items are hidden until reports have actually been collected.
      await expect(statusBar).toContainText(/\bKiCad\b/);
      await expect(statusBar).toContainText(/\bAI\b/);
      await expect(statusBar).toContainText(/\bMCP\b/);
    } finally {
      await session.close();
    }
  });

  test('recovers the PCB viewer when KiCanvas cannot mount its source', async () => {
    const session = await launchVsCodeWithFixtures({ mockKiCadCli: true });

    try {
      // This is a fresh VS Code session. Ensure the extension has activated
      // and registered its custom editors before opening the PCB; otherwise a
      // slow runner can race file opening against provider registration.
      await expectCommandPaletteEntry(
        session.page,
        'KiCad Studio: Open Task Hub'
      );
      await openWorkspaceFile(session.page, 'sample.kicad_pcb');
      // Electron may still render with KiCanvas when WebGL is disabled.
      // Induce a real KiCanvas mount failure in the loaded extension webview
      // instead of relying on browser GPU flags or timing-sensitive init scripts.
      let viewerFrame: import('@playwright/test').Frame | undefined;
      await expect
        .poll(
          async () => {
            for (const frame of session.page.frames()) {
              if ((await frame.locator('#viewer-engine-badge').count()) > 0) {
                viewerFrame = frame;
                return true;
              }
            }
            return false;
          },
          { timeout: 30000 }
        )
        .toBe(true);
      if (!viewerFrame) {
        throw new Error('PCB viewer iframe did not load.');
      }

      await viewerFrame.evaluate(() => {
        const originalAppendChild = Element.prototype.appendChild;
        const testState = window as Window & { __kicadBlockedMounts?: number };
        testState.__kicadBlockedMounts = 0;
        Element.prototype.appendChild = function <T extends Node>(child: T): T {
          if (
            this.localName === 'kicanvas-embed' &&
            child instanceof Element &&
            child.localName === 'kicanvas-source'
          ) {
            testState.__kicadBlockedMounts =
              (testState.__kicadBlockedMounts ?? 0) + 1;
            throw new Error('Simulated KiCanvas source-mount failure');
          }
          return originalAppendChild.call(this, child);
        };
      });

      // User-facing Reload Viewer starts a new KiCanvas mount, whose failure
      // must recover to the actual CLI-rendered SVG instead of showing a blank
      // or misleadingly successful KiCanvas surface.
      await viewerFrame.locator('#reload-btn').click();
      await expect(viewerFrame.locator('#viewer-engine-badge')).toHaveText(
        'CLI SVG fallback',
        { timeout: 60000 }
      );
      const blockedMounts = await viewerFrame.evaluate(
        () =>
          (window as Window & { __kicadBlockedMounts?: number })
            .__kicadBlockedMounts
      );
      expect(blockedMounts).toBeGreaterThan(0);
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
