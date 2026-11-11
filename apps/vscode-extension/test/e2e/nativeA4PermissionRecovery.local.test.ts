import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchVsCodeWithFixtures } from './vscodeHarness';

const demo = '/usr/share/kicad/demos/royalblue54L_feather';
const schematic = 'RoyalBlue54L-Feather.kicad_sch';
const project = 'RoyalBlue54L-Feather';
const names = [schematic, project + '.kicad_pcb', project + '.kicad_pro'];
const cli = '/usr/bin/kicad-cli';
const hash = (file: string) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function exportBom(page: import('@playwright/test').Page): Promise<void> {
  await page.keyboard.press('Control+Shift+P');
  const picker = page.locator('.quick-input-widget');
  await expect(picker).toBeVisible();
  await picker.locator('input').fill('>Bill of Materials');
  await expect(picker).toContainText('Export Bill of Materials (CSV)', {
    timeout: 7000
  });
  await picker
    .getByText('Export Bill of Materials (CSV)', { exact: false })
    .first()
    .click();
}

test('native A4: actual filesystem EACCES → error → chmod repair → BOM export', async () => {
  // This is opt-in physical acceptance, not a simulated permission mock.
  // SKIP outside the real installed KiCad 10/VS Code native environment is NOT PASS.
  test.skip(
    process.platform !== 'linux' ||
      process.env.KICADSTUDIO_LOCAL_LINUX_ACCEPTANCE !== '1' ||
      !fs.existsSync(cli) ||
      !names.every((name) => fs.existsSync(path.join(demo, name))),
    'Requires a real native Linux KiCad 10 demo and explicit opt-in'
  );
  test.setTimeout(300000);
  const originals = names.map((name) => hash(path.join(demo, name)));
  const session = await launchVsCodeWithFixtures({
    workspaceSourcePath: demo,
    settings: {
      'kicadstudio.kicadCliPath': cli,
      'kicadstudio.defaultOutputDir': 'fab'
    }
  });
  const outputDir = path.join(session.workspacePath, 'fab');
  const bomPath = path.join(outputDir, project + '-bom.csv');
  try {
    fs.mkdirSync(outputDir, { mode: 0o700 });
    fs.chmodSync(outputDir, 0o500);
    // Guard that this real test host actually enforces the configured denial.
    expect(() => fs.accessSync(outputDir, fs.constants.W_OK)).toThrow();

    await expect(session.page.locator('.statusbar')).toContainText('MCP', {
      timeout: 60000
    });
    const fileEntry = session.page
      .locator('.explorer-folders-view')
      .getByText(schematic, { exact: true });
    await expect(fileEntry).toBeVisible({ timeout: 60000 });
    await fileEntry.dblclick();
    await expect(session.page.locator('.tab.active')).toContainText(schematic, {
      timeout: 30000
    });

    await exportBom(session.page);
    const errorToast = session.page
      .locator('.notification-toast')
      .filter({ hasText: 'BOM export failed' });
    await expect(errorToast).toBeVisible({ timeout: 75000 });
    await expect(errorToast).toContainText('choose a writable', {
      timeout: 3000
    });
    await expect(errorToast).not.toContainText(session.workspacePath);
    expect(fs.existsSync(bomPath)).toBe(false);
    await expect(
      session.page
        .locator('.notification-toast')
        .filter({ hasText: 'Export completed successfully.' })
    ).toHaveCount(0);
    await test.info().attach('native-a4-true-permission-denied', {
      body: await session.page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
    console.log('A4_REAL_EACCES_BLOCKED=PASS');

    fs.chmodSync(outputDir, 0o700);
    await exportBom(session.page);
    await expect
      .poll(() => fs.existsSync(bomPath) && fs.statSync(bomPath).size > 40, {
        timeout: 75000
      })
      .toBe(true);
    await expect(
      session.page
        .locator('.notification-toast')
        .filter({ hasText: 'Export completed successfully.' })
    ).toBeVisible({ timeout: 15000 });
    expect(fs.readFileSync(bomPath, 'utf8')).toContain('Reference');

    for (const [i, name] of names.entries()) {
      expect(hash(path.join(demo, name))).toBe(originals[i]);
      expect(hash(path.join(session.workspacePath, name))).toBe(originals[i]);
    }
    console.log('A4_REAL_EACCES_RETRY=PASS');
    await test.info().attach('native-a4-permissions-recovered', {
      body: await session.page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
  } finally {
    if (fs.existsSync(outputDir)) fs.chmodSync(outputDir, 0o700);
    await session.close();
  }
});
