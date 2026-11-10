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
  test.setTimeout(240_000);
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
    await session.page.getByRole('tab', { name: 'KiCad Studio' }).click();
    console.log(
      'NATIVE_ERC_KICAD_SIDEBAR=' +
        JSON.stringify(
          (
            await session.page.locator('.sidebar').innerText({ timeout: 5000 })
          ).slice(0, 1300)
        )
    );
    await expect
      .poll(async () => await session.page.locator('.sidebar').innerText(), {
        timeout: 12000,
        intervals: [300, 1000, 2000]
      })
      .toContain('KICAD STUDIO');
    const sidebar = session.page.locator('.sidebar');
    await expect
      .poll(async () => await sidebar.innerText(), {
        timeout: 25000,
        intervals: [300, 1000, 2000]
      })
      .toContain('Project Files');
    console.log(
      'NATIVE_ERC_SIDEBAR_READY=' +
        JSON.stringify((await sidebar.innerText()).slice(-800))
    );
    await expect(sidebar).toContainText('ERCFAIL - 5 errors, 39 warnings');
    const ercRow = sidebar
      .locator('.monaco-list-row')
      .filter({ hasText: /^ERCFAIL/ })
      .first();
    await expect(ercRow).toBeVisible();
    await ercRow.locator('.monaco-tl-twistie').click();
    // The native VS Code tree virtualizes long results. Use its visible
    // verified UUID finding instead of assuming every source row is mounted.
    const sourceRow = sidebar
      .getByRole('tree', { name: 'Validation' })
      .getByRole('treeitem', { name: /Debugger\.kicad_sch:8892:2/ })
      .first();
    await expect(sourceRow).toBeVisible({ timeout: 15000 });
    console.log(
      'NATIVE_ERC_SOURCE_ROW=' + (await sourceRow.innerText()).slice(0, 300)
    );
    await sourceRow.click();
    await expect(session.page.locator('.tab.active')).toContainText(
      'Debugger.kicad_sch'
    );
    console.log(
      'NATIVE_ERC_CURSOR_STATUS=' +
        JSON.stringify(
          (await session.page.locator('.statusbar').innerText()).slice(-500)
        )
    );
    // UUID source range starts at text offset 1, immediately after a tab.
    // VS Code's status bar uses visual columns: one tab (tabSize 4) => Col 5.
    const sourceText = fs.readFileSync(
      path.join(session.workspacePath, 'sch', 'Debugger.kicad_sch'),
      'utf8'
    );
    expect(sourceText.split(/\r?\n/)[8891]).toMatch(/^\t\(symbol/);
    await expect
      .poll(async () => await session.page.locator('.statusbar').innerText(), {
        timeout: 15000
      })
      .toMatch(/Ln\s+8892,\s+Col\s+5/);
    console.log('NATIVE_ERC_EXACT_TEXT_CURSOR_8892_OFFSET_1=PASS');
    console.log('NATIVE_ERC_PROBLEMS_PANEL_VISIBLE=PASS');
  } finally {
    await session.close();
  }
});
