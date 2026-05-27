import { expect, test } from '@playwright/test';
import {
  countMessages,
  createBomHtml,
  hasMessageType,
  installVsCodeApiMock,
  readFixtureBase64,
  readLastMessageType,
  setViewerContent,
  setWebviewContent,
  viewerBounds
} from './webviewTestHarness';

test.describe('KiCad Studio webview DOM', () => {
  test('boots a schematic fixture into a full-size interactive viewer', async ({
    page
  }) => {
    await installVsCodeApiMock(page);
    await setViewerContent(page, {
      fileName: 'sample.kicad_sch',
      fileType: 'schematic',
      base64: readFixtureBase64('sample.kicad_sch'),
      metadata: {
        sheets: [{ id: 'power', name: 'Power Sheet', file: 'power.kicad_sch' }]
      }
    });

    await expect(page.locator('#viewer-status')).toHaveText(
      'Interactive renderer loaded: sample.kicad_sch'
    );
    await expect(page.locator('#viewer-mount')).not.toHaveClass(/is-hidden/);
    await expect(page.locator('kicanvas-embed')).toHaveCount(1);
    await expect(page.locator('body')).toHaveClass(/tools-collapsed/);
    await expect(page.locator('#side-panel-toggle')).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    await expect(page.locator('#sheet-select option')).toHaveText([
      'Root sheet',
      'Power Sheet'
    ]);

    const beforeResize = await viewerBounds(page);
    expect(beforeResize.embed.width).toBeGreaterThan(
      beforeResize.mount.width * 0.95
    );
    expect(beforeResize.embed.height).toBeGreaterThan(
      beforeResize.mount.height * 0.95
    );

    await page.setViewportSize({ width: 1024, height: 640 });
    const afterResize = await viewerBounds(page);
    expect(afterResize.mount.width).toBeLessThan(beforeResize.mount.width);
    expect(afterResize.embed.width).toBeGreaterThan(
      afterResize.mount.width * 0.95
    );
  });

  test('applies toolbar, sheet, reference, layer, lasso, and focus interactions to the embed', async ({
    page
  }) => {
    await installVsCodeApiMock(page);
    await setViewerContent(page, {
      fileName: 'sample.kicad_pcb',
      fileType: 'board',
      base64: readFixtureBase64('sample.kicad_pcb'),
      metadata: {
        sheets: [{ id: 'assembly', name: 'Assembly View' }],
        layers: [
          { name: 'F.Cu', kind: 'signal', visible: true },
          { name: 'B.Cu', kind: 'signal', visible: true },
          { name: 'Edge.Cuts', kind: 'user', visible: true }
        ]
      }
    });

    await expect(page.locator('#viewer-status')).toHaveText(
      'Interactive renderer loaded: sample.kicad_pcb'
    );

    await page.locator('#side-panel-toggle').click();
    await expect(page.locator('body')).not.toHaveClass(/tools-collapsed/);
    await expect(page.locator('#side-panel-toggle')).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    await expect(page.locator('#layers-section')).toBeVisible();

    await page.locator('#none-layers-btn').click();
    await expect(page.locator('kicanvas-embed')).toHaveAttribute('layers', '');
    await page.locator('#copper-layers-btn').click();
    await expect(page.locator('kicanvas-embed')).toHaveAttribute(
      'layers',
      'F.Cu,B.Cu'
    );
    await page.locator('#all-layers-btn').click();
    await expect(page.locator('kicanvas-embed')).toHaveAttribute(
      'layers',
      'F.Cu,B.Cu,Edge.Cuts'
    );

    await page.locator('#sheet-select').selectOption('assembly');
    await expect(page.locator('kicanvas-embed')).toHaveAttribute(
      'sheet',
      'assembly'
    );

    await page.locator('#grid-toggle').click();
    await expect(page.locator('#grid-toggle')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(page.locator('kicanvas-embed')).toHaveAttribute(
      'show-grid',
      'true'
    );

    await page.locator('#zoom-in-btn').click();
    await expect(page.locator('#zoom-level')).toHaveText('110%');
    await page.locator('#fit-btn').click();
    await expect(page.locator('#zoom-level')).toHaveText('100%');

    await page.locator('#reference-search').fill('U12');
    await page.locator('#reference-search').press('Enter');
    await expect(page.locator('kicanvas-embed')).toHaveAttribute(
      'selected-reference',
      'U12'
    );
    await expect
      .poll(() => readLastMessageType(page))
      .toBe('componentSelected');

    const embedBox = await page.locator('kicanvas-embed').boundingBox();
    expect(embedBox).not.toBeNull();
    await page.mouse.move(embedBox!.x + 40, embedBox!.y + 40);
    await page.mouse.down();
    await page.mouse.move(embedBox!.x + 180, embedBox!.y + 150);
    await page.mouse.up();
    await expect(page.locator('#selection-summary')).toContainText(
      'Selected area:'
    );
    await expect
      .poll(() => hasMessageType(page, 'selectionChanged'))
      .toBe(true);

    await page.locator('#reference-search').focus();
    await page.keyboard.press('r');
    await expect(await countMessages(page, 'requestRefresh')).toBe(0);

    await page.locator('#reload-btn').focus();
    await expect(page.locator('#reload-btn')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#open-kicad-btn')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#fit-btn')).toBeFocused();
  });

  test('falls back to CLI SVG rendering when KiCanvas has no drawable surface', async ({
    page
  }) => {
    await installVsCodeApiMock(
      page,
      '<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1200" viewBox="0 0 2000 1200"><rect width="2000" height="1200" fill="#ffffff"/><path d="M100 100 H1900 V1100 H100 Z" fill="none" stroke="#2563eb" stroke-width="20"/></svg>'
    );
    await setViewerContent(
      page,
      {
        fileName: 'sample.kicad_sch',
        fileType: 'schematic',
        base64: readFixtureBase64('sample.kicad_sch')
      },
      { surface: 'none' }
    );

    await expect(page.locator('#viewer-engine-badge')).toHaveText(
      'CLI SVG fallback',
      { timeout: 12000 }
    );
    await expect(page.locator('#svg-fallback-view')).toBeVisible();
    await expect(page.locator('#viewer-status')).toHaveText(
      'CLI SVG fallback loaded: sample.kicad_sch'
    );

    await page.locator('#zoom-in-btn').click();
    await expect(page.locator('#zoom-level')).not.toHaveText('100%');

    const beforeTheme = await page
      .locator('#svg-fallback-view')
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    await page.locator('#theme-toggle').click();
    const afterTheme = await page
      .locator('#svg-fallback-view')
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(afterTheme).not.toBe(beforeTheme);

    await page.locator('#export-menu-toggle').click();
    await expect(page.locator('#export-menu')).toHaveAttribute('open', '');
    await page.locator('#export-svg-btn').click();
    await expect(page.locator('#export-menu')).not.toHaveAttribute('open', '');
    await expect.poll(() => hasMessageType(page, 'exportSvg')).toBe(true);
  });

  test('keeps unsupported and malformed viewer states from exposing unusable controls', async ({
    page
  }) => {
    await installVsCodeApiMock(page);
    await setViewerContent(page, {
      fileName: 'oversized.kicad_pcb',
      fileType: 'board',
      base64: '',
      disabledReason:
        'Interactive render is disabled for files larger than 100 MB.'
    });

    await expect(page.locator('#viewer-engine-badge')).toHaveText(
      'Metadata only'
    );
    await expect(page.locator('#empty-overlay')).toBeVisible();
    await expect(page.locator('#fit-btn')).toBeDisabled();
    await expect(page.locator('#zoom-in-btn')).toBeDisabled();
    await expect(page.locator('#zoom-out-btn')).toBeDisabled();
    await expect(page.locator('#export-png-btn')).toBeDisabled();
    await expect(page.locator('#export-svg-btn')).toBeEnabled();

    await installVsCodeApiMock(page);
    await setViewerContent(page, {
      fileName: 'broken.kicad_sch',
      fileType: 'schematic',
      base64: '!!!!'
    });

    await expect(page.locator('#error-overlay')).toBeVisible();
    await expect(page.locator('#error-title')).toHaveText('Decode error');
    await expect(page.locator('#viewer-mount')).toHaveClass(/is-hidden/);
  });

  test('keeps BOM loading and empty states distinct from an unusable table', async ({
    page
  }) => {
    await installVsCodeApiMock(page);
    await setWebviewContent(page, createBomHtml());

    await page.evaluate(() => {
      window.postMessage(
        { type: 'setStatus', payload: { status: 'loading' } },
        '*'
      );
    });
    await expect(page.locator('#loading-row')).toHaveClass(/visible/);
    await expect(page.locator('#loading-row')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    await expect(page.locator('#table-wrapper')).toHaveClass(/hidden/);
    await expect(page.locator('#btn-export-csv')).toBeDisabled();
    await expect(page.locator('#btn-export-xlsx')).toBeDisabled();

    await page.evaluate(() => {
      window.postMessage(
        {
          type: 'setData',
          payload: {
            entries: [],
            summary: { totalComponents: 0, uniqueValues: 0 }
          }
        },
        '*'
      );
    });
    await expect(page.locator('#loading-row')).not.toHaveClass(/visible/);
    await expect(page.locator('#bom-empty')).toHaveClass(/visible/);
    await expect(page.locator('#bom-empty')).toContainText(
      'No components found'
    );
    await expect(page.locator('#table-wrapper')).toHaveClass(/hidden/);

    await page.evaluate(() => {
      window.postMessage(
        {
          type: 'setData',
          payload: {
            summary: { totalComponents: 1, uniqueValues: 1 },
            entries: [
              {
                references: ['R1'],
                quantity: 1,
                value: '10k',
                footprint: 'Resistor_SMD:R_0603',
                mpn: '',
                manufacturer: '',
                lcsc: 'C25804',
                description: 'Pull-up resistor',
                dnp: false
              }
            ]
          }
        },
        '*'
      );
    });
    await expect(page.locator('#bom-empty')).not.toHaveClass(/visible/);
    await expect(page.locator('#table-wrapper')).not.toHaveClass(/hidden/);
    await expect(page.locator('#bom-rows tr')).toHaveCount(1);
    await expect(page.locator('#btn-export-csv')).toBeEnabled();
  });
});
