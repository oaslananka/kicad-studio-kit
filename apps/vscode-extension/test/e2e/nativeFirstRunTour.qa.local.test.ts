import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchVsCodeWithFixtures } from './vscodeHarness';

const source = '/usr/share/kicad/demos/royalblue54L_feather';
test('A4 fresh-profile real user guided tour and truthful progress', async () => {
  test.skip(
    !fs.existsSync(path.join(source, 'RoyalBlue54L-Feather.kicad_pro')),
    'Official native KiCad demo missing'
  );
  test.setTimeout(190000);
  const session = await launchVsCodeWithFixtures({
    workspaceSourcePath: source,
    settings: { 'kicadstudio.kicadCliPath': '/usr/bin/kicad-cli' }
  });
  const page = session.page;
  try {
    await expect(page.locator('.statusbar')).toContainText('MCP', {
      timeout: 55000
    });
    console.log(
      'TOUR_WELCOME_ACTIONS=',
      JSON.stringify((await page.locator('body').innerText()).slice(-3400))
    );
    const guide = page.getByText('Guided Tour', { exact: true }).first();
    await expect(guide).toBeVisible({ timeout: 18000 });
    await guide.click();
    await expect(
      page.getByText('Review: Open a KiCad Project', { exact: true })
    ).toBeVisible({ timeout: 30000 });
    const initial = await page.locator('body').innerText();
    console.log('TOUR_FIRST_OPEN=', JSON.stringify(initial.slice(0, 4200)));
    const steps = [
      'Review: Open a KiCad Project',
      'Review: Inspect your Schematic',
      'Maintain: Detect kicad-cli',
      'Validate: Run DRC or ERC',
      'Fabrication Release: Create Manufacturing Outputs',
      'Optional: Create a Design Variant',
      'Optional: Connect kicad-mcp-pro',
      'Optional: Configure AI',
      'Optional: Open AI Chat'
    ];
    for (const title of steps) {
      await expect(page.getByText(title, { exact: true })).toBeVisible({
        timeout: 10000
      });
    }
    console.log('TOUR_VISIBLE_STEPS=9');
    const nodes = await page
      .locator('[class*="getting-started"]')
      .evaluateAll((els) =>
        els
          .filter((el) => el.textContent?.includes('Optional: Configure AI'))
          .slice(0, 9)
          .map((el) => ({
            tag: el.tagName,
            cls: el.className,
            aria: el.getAttribute('aria-label'),
            text: el.textContent?.slice(0, 190)
          }))
      );
    console.log('TOUR_AI_NODE_BEFORE=', JSON.stringify(nodes));

    const aiStep = page
      .locator('.getting-started-step')
      .filter({ hasText: 'Optional: Configure AI' });
    const stateBefore = await aiStep.evaluate((el) => ({
      html: el.outerHTML.slice(0, 1300),
      cls: el.className
    }));
    console.log('TOUR_AI_STATE_BEFORE=', JSON.stringify(stateBefore));
    await aiStep.click();
    const settingsLink = page
      .getByText('Open Settings Panel', { exact: true })
      .first();
    await expect(settingsLink).toBeVisible();
    await settingsLink.click();
    await expect(page.locator('body')).not.toContainText(
      'Step Optional: Configure AI completed',
      { timeout: 1500 }
    );
    await expect(page.locator('.tab.active')).toContainText(
      'KiCad Studio Health',
      { timeout: 15000 }
    );
    await expect(
      page.getByRole('button', { name: /AI provider not configured/ })
    ).toBeVisible({ timeout: 5000 });
    console.log('TOUR_FALSE_AI_COMPLETION_PREVENTED=PASS');
    console.log('TOUR_HEALTH_RENDERED=PASS');
  } finally {
    await session.close();
  }
});

test('A4 manufacturing walkthrough does not complete when export is cancelled', async () => {
  test.skip(
    !fs.existsSync(path.join(source, 'RoyalBlue54L-Feather.kicad_pro')),
    'Official native KiCad demo missing'
  );
  test.setTimeout(135000);
  const session = await launchVsCodeWithFixtures({
    workspaceSourcePath: source,
    settings: { 'kicadstudio.kicadCliPath': '/usr/bin/kicad-cli' }
  });
  const page = session.page;
  try {
    await expect(page.locator('.statusbar')).toContainText('KiCad 10.0.8', {
      timeout: 50000
    });
    const pcb = page
      .locator('.explorer-folders-view')
      .getByText('RoyalBlue54L-Feather.kicad_pcb', { exact: true });
    await expect(pcb).toBeVisible({ timeout: 30000 });
    await pcb.dblclick();
    await expect(page.locator('.tab.active')).toContainText('.kicad_pcb', {
      timeout: 15000
    });
    await page.getByText('Guided Tour', { exact: true }).first().click();
    const step = page.locator('.getting-started-step').filter({
      hasText: 'Fabrication Release: Create Manufacturing Outputs'
    });
    await expect(step).toBeVisible({ timeout: 20000 });
    await step.click();
    await page
      .getByText('Export manufacturing package', { exact: true })
      .click();
    const picker = page.locator('.quick-input-widget');
    await expect(picker).toBeVisible({ timeout: 20000 });
    // A workspace may contain nested PCB files. Select the root board before
    // the profile dialog appears; do not silently count a file selection.
    await expect(picker).toContainText('Choose .kicad_pcb file');
    await picker
      .getByText('RoyalBlue54L-Feather.kicad_pcb', { exact: true })
      .click();
    await expect(picker).toContainText('Manufacturing package profile', {
      timeout: 20000
    });
    await page.keyboard.press('Escape');
    await expect(picker).toBeHidden();
    await page.getByRole('tab', { name: 'Welcome' }).click();
    await expect(
      page.locator(
        '[data-step-id*="kicadstudio.step.exports"] [role="checkbox"]'
      )
    ).toHaveAttribute('aria-checked', 'false', { timeout: 10000 });
    await expect(page.locator('body')).not.toContainText(
      'Step Fabrication Release: Create Manufacturing Outputs completed'
    );
    console.log('TOUR_CANCELLED_MANUFACTURING_NOT_COMPLETED=PASS');
  } finally {
    await session.close();
  }
});
