import { expect, test } from '@playwright/test';
import { VISUAL_FIXTURES } from './visualFixtures';
import {
  applyThemeTokens,
  prepareVisualPage,
  snapshotPath,
  VISUAL_CASES,
  VISUAL_MAX_DIFF_PIXEL_RATIO,
  VISUAL_PIXELMATCH_THRESHOLD,
  VISUAL_SETTLE_MS
} from './visualThemeMatrix';

test.describe('KiCad Studio visual regression matrix', () => {
  for (const fixture of VISUAL_FIXTURES) {
    for (const visualCase of VISUAL_CASES) {
      test(`${fixture.id} in ${visualCase.id}`, async ({ page }, testInfo) => {
        await prepareVisualPage(page, visualCase);
        await fixture.prepare(page, visualCase.theme);
        await applyThemeTokens(page, visualCase.theme);
        await page.waitForTimeout(VISUAL_SETTLE_MS);
        await fixture.verify?.(page, visualCase.viewport);
        await expect(page).toHaveScreenshot(
          snapshotPath(fixture, visualCase, testInfo),
          {
            maxDiffPixelRatio: VISUAL_MAX_DIFF_PIXEL_RATIO,
            threshold: VISUAL_PIXELMATCH_THRESHOLD
          }
        );
      });
    }
  }
});
