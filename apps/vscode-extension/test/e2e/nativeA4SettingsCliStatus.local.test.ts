import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchVsCodeWithFixtures } from './vscodeHarness';

const demo = '/usr/share/kicad/demos/royalblue54L_feather';
const cli = '/usr/bin/kicad-cli';
const project = 'RoyalBlue54L-Feather';
const schematic = project + '.kicad_sch';
const sourceFiles = [schematic, project + '.kicad_pcb', project + '.kicad_pro'];
const digest = (file: string) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('native A4: Settings UI CLI correction refreshes status bar and BOM in the same session', async () => {
  test.skip(
    process.platform !== 'linux' ||
      process.env.KICADSTUDIO_LOCAL_LINUX_ACCEPTANCE !== '1' ||
      !fs.existsSync(cli) ||
      !sourceFiles.every((file) => fs.existsSync(path.join(demo, file))),
    'Only opt-in real VS Code and installed KiCad; SKIP is NOT acceptance'
  );
  test.setTimeout(170000);
  const before = sourceFiles.map((file) => digest(path.join(demo, file)));
  const session = await launchVsCodeWithFixtures({
    workspaceSourcePath: demo,
    mockKiCadCli: true,
    settings: { 'kicadstudio.defaultOutputDir': 'fab' }
  });
  try {
    const { page, workspacePath } = session;
    await expect(page.locator('.statusbar')).toContainText('MCP', {
      timeout: 60000
    });
    await expect(page.locator('.statusbar')).toContainText('KiCad 9.0.0', {
      timeout: 45000
    });
    const entry = page
      .locator('.explorer-folders-view')
      .getByText(schematic, { exact: true });
    await expect(entry).toBeVisible({ timeout: 60000 });
    await entry.dblclick();
    await expect(page.locator('.tab.active')).toContainText(schematic);

    const exportBom = async () => {
      await page.keyboard.press('Control+Shift+P');
      const picker = page.locator('.quick-input-widget');
      await expect(picker).toBeVisible();
      await picker.locator('input').fill('>Bill of Materials');
      await picker.getByText('Export Bill of Materials (CSV)').first().click();
    };
    await exportBom();
    const error = page.locator('.notification-toast').filter({
      hasText: 'BOM export failed'
    });
    await expect(error).toContainText('compatible KiCad CLI', {
      timeout: 45000
    });

    // Real VS Code Settings modal: keyboard search is a Monaco input, not
    // a normal HTML input element. Enter commits the new user-level value.
    await page.keyboard.press('Control+,');
    await expect(page.locator('.settings-editor')).toBeVisible({
      timeout: 30000
    });
    await page.keyboard.type('@id:kicadstudio.kicadCliPath');
    const pathInput = page.getByRole('textbox', {
      name: 'kicadstudio.kicadCliPath'
    });
    await expect(pathInput).toBeVisible({ timeout: 15000 });
    await pathInput.fill(cli);
    await pathInput.press('Enter');
    await pathInput.press('Tab');
    await expect(pathInput).toHaveValue(cli);

    await expect(page.locator('.statusbar')).toContainText('KiCad 10.0.8', {
      timeout: 30000
    });
    await expect(page.locator('.statusbar')).not.toContainText('KiCad 9.0.0');
    await page
      .getByRole('button', {
        name: 'Close Modal Editor (Escape)'
      })
      .click();
    await expect(page.locator('.tab.active')).toContainText(schematic);
    await exportBom();
    const csv = path.join(workspacePath, 'fab', project + '-bom.csv');
    await expect
      .poll(() => fs.existsSync(csv) && fs.statSync(csv).size > 40, {
        timeout: 90000
      })
      .toBe(true);
    expect(fs.readFileSync(csv, 'utf8')).toContain('Reference');
    for (const [index, name] of sourceFiles.entries()) {
      expect(digest(path.join(demo, name))).toBe(before[index]);
      expect(digest(path.join(workspacePath, name))).toBe(before[index]);
    }
    console.log('A4_NATIVE_SETTINGS_UI_CLI_INDICATOR_AND_BOM=PASS');
    await test.info().attach('native-a4-cli-settings-repair', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
  } finally {
    await session.close();
  }
});
