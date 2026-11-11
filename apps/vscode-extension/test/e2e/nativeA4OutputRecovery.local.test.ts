import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchVsCodeWithFixtures } from './vscodeHarness';

// Real VS Code 1.122.0 + installed KiCad 10, isolated disposable workspace.
// Missing prerequisites are NOT TESTED, never reported as PASS.
const sourceDir = '/usr/share/kicad/demos/royalblue54L_feather';
const project = 'RoyalBlue54L-Feather';
const schematic = project + '.kicad_sch';
const pcb = project + '.kicad_pcb';
const cli = '/usr/bin/kicad-cli';

function hash(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function invoke(page: Page, query: string, label: string): Promise<void> {
  const picker = page.locator('.quick-input-widget');
  await expect(async () => {
    await page.keyboard.press('Control+Shift+P');
    await expect(picker).toBeVisible();
    await picker.locator('input').fill(query);
    await expect(picker).toContainText(label, { timeout: 4000 });
  }).toPass({ timeout: 30000 });
  await picker.getByText(label, { exact: false }).first().click();
}

test('native A4: blocked local output reports failure, then retry exports safely', async () => {
  // Intentionally opt-in: this verifies real native VS Code/KiCad behavior.
  // A CI skip means the hardware/installed KiCad prerequisites were not tested.
  test.skip(
    process.platform !== 'linux' ||
      process.env.KICADSTUDIO_LOCAL_LINUX_ACCEPTANCE !== '1' ||
      !fs.existsSync(cli) ||
      !fs.existsSync(path.join(sourceDir, pcb)),
    'Requires explicit local native acceptance with authentic KiCad 10 demo'
  );
  test.setTimeout(360000);
  const names = [schematic, pcb, project + '.kicad_pro'];
  const originals = names.map((name) => hash(path.join(sourceDir, name)));
  const session = await launchVsCodeWithFixtures({
    workspaceSourcePath: sourceDir,
    settings: {
      'kicadstudio.kicadCliPath': cli,
      'kicadstudio.defaultOutputDir': 'fab'
    }
  });
  try {
    await expect(session.page.locator('.statusbar')).toContainText('MCP', {
      timeout: 60000
    });
    const outputDir = path.join(session.workspacePath, 'fab');
    const csv = path.join(outputDir, project + '-bom.csv');
    const blocker = 'User file must never be overwritten by an export.\n';
    fs.writeFileSync(outputDir, blocker, { flag: 'wx' });

    const sourceTab = session.page
      .locator('.explorer-folders-view')
      .getByText(schematic, { exact: true });
    await expect(sourceTab).toBeVisible({ timeout: 60000 });
    await sourceTab.dblclick();
    await expect(session.page.locator('.tab.active')).toContainText(schematic, {
      timeout: 30000
    });

    // Match the established native A4 user journey before testing recovery:
    // open both engineering checks and return to the schematic's active tab.
    await invoke(session.page, '>ERC', 'Run Electrical Rule Check (ERC)');
    const problems = session.page.locator('.markers-panel');
    await expect(problems).toContainText('kicad-cli:erc', { timeout: 150000 });
    const pcbEntry = session.page
      .locator('.explorer-folders-view')
      .getByText(pcb, { exact: true });
    await pcbEntry.dblclick();
    await expect(session.page.locator('.tab.active')).toContainText(pcb);
    await invoke(session.page, '>DRC', 'Run Design Rule Check (DRC)');
    await expect(problems).toContainText('kicad-cli:drc', { timeout: 150000 });
    await session.page
      .locator('.tab')
      .filter({ hasText: schematic })
      .first()
      .click();

    await invoke(
      session.page,
      '>Bill of Materials',
      'Export Bill of Materials (CSV)'
    );
    const errorToast = session.page
      .locator('.notification-toast')
      .filter({ hasText: 'output directory validation failed' });
    await expect(errorToast).toBeVisible({ timeout: 30000 });
    await expect(errorToast).toContainText(
      'How to fix: rename or move the blocking file'
    );
    await expect(errorToast).not.toContainText(session.workspacePath);
    expect(fs.readFileSync(outputDir, 'utf8')).toBe(blocker);
    expect(fs.existsSync(csv)).toBe(false);
    await expect(
      session.page
        .locator('.notification-toast')
        .filter({ hasText: 'Export completed successfully.' })
    ).toHaveCount(0);
    console.log('A4_NATIVE_BLOCKED_EXPORT_ERROR=PASS');
    await test.info().attach('native-a4-blocked-output', {
      body: await session.page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });

    // User repairs the *disposable* output path. Retry in the same live GUI,
    // without restarting the extension, editing original design files or
    // calling a direct export API behind the user's back.
    fs.unlinkSync(outputDir);
    await invoke(
      session.page,
      '>Bill of Materials',
      'Export Bill of Materials (CSV)'
    );
    await expect
      .poll(() => fs.existsSync(csv) && fs.statSync(csv).size > 40, {
        timeout: 90000
      })
      .toBe(true);
    await expect(
      session.page
        .locator('.notification-toast')
        .filter({ hasText: 'Export completed successfully.' })
    ).toBeVisible({ timeout: 15000 });
    expect(fs.readFileSync(csv, 'utf8')).toContain('Reference');
    console.log('A4_NATIVE_RETRY_EXPORTED=PASS');

    for (const [i, name] of names.entries()) {
      expect(hash(path.join(sourceDir, name))).toBe(originals[i]);
      expect(hash(path.join(session.workspacePath, name))).toBe(originals[i]);
    }
    console.log('A4_NATIVE_RETRY_SOURCE_SHA256_UNCHANGED=PASS');
    await test.info().attach('native-a4-recovered-output', {
      body: await session.page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
  } finally {
    await session.close();
  }
});
