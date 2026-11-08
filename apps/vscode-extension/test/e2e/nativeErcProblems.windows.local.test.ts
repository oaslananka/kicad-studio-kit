import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchVsCodeWithFixtures } from './vscodeHarness';

const rootName = 'RoyalBlue54L-Feather.kicad_sch';
const kicadRoot = path.join(
  process.env.ProgramFiles ?? String.raw`C:\Program Files`,
  'KiCad',
  '10.0'
);
const cliPath = path.join(kicadRoot, 'bin', 'kicad-cli.exe');
const demoDir = path.join(
  kicadRoot,
  'share',
  'kicad',
  'demos',
  'royalblue54L_feather'
);

function fingerprint(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('native Windows ERC command is visible from a real schematic custom tab and opens Problems', async () => {
  test.skip(
    process.platform !== 'win32' ||
      process.env.KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE !== '1' ||
      !fs.existsSync(cliPath) ||
      !fs.existsSync(path.join(demoDir, rootName)),
    'Explicitly opted-in Windows KiCad 10 local acceptance'
  );
  test.setTimeout(180_000);
  const original = path.join(demoDir, rootName);
  const originalHash = fingerprint(original);
  const session = await launchVsCodeWithFixtures({
    workspaceSourcePath: demoDir,
    settings: { 'kicadstudio.kicadCliPath': cliPath }
  });

  try {
    const isolated = path.join(session.workspacePath, rootName);
    expect(fingerprint(isolated)).toBe(originalHash);
    await expect(session.page.locator('.statusbar')).toContainText('MCP', {
      timeout: 60000
    });
    const file = session.page
      .locator('.explorer-folders-view')
      .getByText(rootName, { exact: true });
    await expect(file).toBeVisible();
    await file.dblclick();
    await expect(session.page.locator('.tab.active')).toContainText(rootName);

    const palette = session.page.locator('.quick-input-widget');
    await expect(async () => {
      await session.page.keyboard.press('Control+Shift+P');
      await expect(palette).toBeVisible();
      await palette.locator('input').fill('>ERC');
      await expect(palette).toContainText('Run Electrical Rule Check (ERC)', {
        timeout: 3500
      });
    }).toPass({ timeout: 30000 });
    console.log('NATIVE_ERC_COMMAND_VISIBLE=PASS');
    await session.page.keyboard.press('Enter');

    const problems = session.page.locator('.markers-panel');
    await expect(problems).toBeVisible({ timeout: 120000 });
    await expect
      .poll(async () => (await problems.innerText()).trim().length, {
        timeout: 120000
      })
      .toBeGreaterThan(25);
    console.log(
      'NATIVE_ERC_PROBLEMS_PREVIEW=' +
        JSON.stringify((await problems.innerText()).slice(0, 2000))
    );
    // Problems' primary diagnostic row must open the real child schematic,
    // not just expose its URI through relatedInformation.
    await expect(problems).toContainText('Connectors.kicad_sch');
    const primaryRow = problems
      .locator('.monaco-list-row')
      .filter({
        hasText: 'Input Power pin not driven by any Output Power pins'
      })
      .first();
    await expect(primaryRow).toBeVisible();
    await primaryRow.dblclick();
    await expect(session.page.locator('.tab.active')).toContainText(
      'Connectors.kicad_sch',
      { timeout: 15000 }
    );
    console.log('NATIVE_ERC_PRIMARY_CHILD_TAB_OPENED=PASS');
    // Source URI navigation is proven here; exact text cursor/range is not.
    expect(fingerprint(isolated)).toBe(originalHash);
    expect(fingerprint(original)).toBe(originalHash);
    await test.info().attach('native-erc-problems', {
      body: await session.page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
    console.log('NATIVE_ERC_PROBLEMS_PANEL_VISIBLE=PASS');
  } finally {
    await session.close();
  }
});
