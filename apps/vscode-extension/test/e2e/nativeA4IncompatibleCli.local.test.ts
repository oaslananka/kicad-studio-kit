import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchVsCodeWithFixtures } from './vscodeHarness';

const sourceDir = '/usr/share/kicad/demos/royalblue54L_feather';
const schematic = 'RoyalBlue54L-Feather.kicad_sch';
const pcb = 'RoyalBlue54L-Feather.kicad_pcb';
const projectFile = 'RoyalBlue54L-Feather.kicad_pro';

const fingerprint = (file: string) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('native A4: incompatible BOM CLI fails with actionable install/config guidance', async () => {
  // Deliberately emulate only the incompatible CLI boundary while preserving
  // real VS Code and authentic KiCad files. Not a missing-installation test.
  test.skip(
    process.platform !== 'linux' ||
      process.env.KICADSTUDIO_LOCAL_LINUX_ACCEPTANCE !== '1' ||
      !fs.existsSync(path.join(sourceDir, schematic)),
    'Requires the opt-in native VS Code and real installed KiCad demo'
  );
  test.setTimeout(180000);
  const files = [schematic, pcb, projectFile];
  const baseline = files.map((file) => fingerprint(path.join(sourceDir, file)));
  const session = await launchVsCodeWithFixtures({
    workspaceSourcePath: sourceDir,
    mockKiCadCli: true,
    settings: { 'kicadstudio.defaultOutputDir': 'fab' }
  });
  try {
    await expect(session.page.locator('.statusbar')).toContainText('MCP', {
      timeout: 60000
    });
    const entry = session.page
      .locator('.explorer-folders-view')
      .getByText(schematic, { exact: true });
    await expect(entry).toBeVisible({ timeout: 60000 });
    await entry.dblclick();
    await expect(session.page.locator('.tab.active')).toContainText(schematic, {
      timeout: 30000
    });
    await session.page.keyboard.press('Control+Shift+P');
    const picker = session.page.locator('.quick-input-widget');
    await expect(picker).toBeVisible();
    await picker.locator('input').fill('>Bill of Materials');
    await expect(picker).toContainText('Export Bill of Materials (CSV)', {
      timeout: 6000
    });
    await picker.getByText('Export Bill of Materials (CSV)').first().click();
    const error = session.page
      .locator('.notification-toast')
      .filter({ hasText: 'BOM export failed' });
    await expect(error).toBeVisible({ timeout: 30000 });
    await expect(error).toContainText('compatible KiCad CLI');
    await expect(error).toContainText('Configure KiCad');
    const csv = path.join(
      session.workspacePath,
      'fab',
      'RoyalBlue54L-Feather-bom.csv'
    );
    expect(fs.existsSync(csv)).toBe(false);
    await expect(
      session.page
        .locator('.notification-toast')
        .filter({ hasText: 'Export completed successfully.' })
    ).toHaveCount(0);
    for (const [i, file] of files.entries()) {
      expect(fingerprint(path.join(sourceDir, file))).toBe(baseline[i]);
      expect(fingerprint(path.join(session.workspacePath, file))).toBe(
        baseline[i]
      );
    }
    console.log('A4_NATIVE_INCOMPATIBLE_CLI_NO_FALSE_SUCCESS=PASS');
    await test.info().attach('native-incompatible-bom-cli-error', {
      body: await session.page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
  } finally {
    await session.close();
  }
});
