import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchVsCodeWithFixtures } from './vscodeHarness';

// User acceptance: BOM should be discoverable straight after opening a real
// hierarchical schematic. No ERC/DRC setup, test APIs, or cached editor state.
const sourceDir = '/usr/share/kicad/demos/royalblue54L_feather';
const schematic = 'RoyalBlue54L-Feather.kicad_sch';
const cli = '/usr/bin/kicad-cli';

test('native A1: BOM is discoverable immediately after a schematic opens', async () => {
  test.skip(
    process.platform !== 'linux' ||
      process.env.KICADSTUDIO_LOCAL_LINUX_ACCEPTANCE !== '1' ||
      !fs.existsSync(cli) ||
      !fs.existsSync(path.join(sourceDir, schematic)),
    'Opt-in real VS Code/KiCad acceptance; SKIP is NOT PASS'
  );
  test.setTimeout(240000);
  const session = await launchVsCodeWithFixtures({
    workspaceSourcePath: sourceDir,
    settings: { 'kicadstudio.kicadCliPath': cli }
  });
  try {
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

    // The FIRST Command Palette invocation must work: no ERC/DRC warm-up,
    // tab switching or repeated palette attempts.
    await session.page.keyboard.press('Control+Shift+P');
    const picker = session.page.locator('.quick-input-widget');
    await expect(picker).toBeVisible();
    await picker.locator('input').fill('>Bill of Materials');
    await expect(picker).toContainText('Export Bill of Materials (CSV)', {
      timeout: 2500
    });
    const observed = await picker.innerText();
    console.log('A1_FIRST_OPEN_BOM_COMMAND=' + observed.slice(0, 650));
    await session.page.keyboard.press('Escape');
    await test.info().attach('native-a1-bom-command-discovery', {
      body: await session.page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
    expect(observed).toContain('Export Bill of Materials (CSV)');
  } finally {
    await session.close();
  }
});
