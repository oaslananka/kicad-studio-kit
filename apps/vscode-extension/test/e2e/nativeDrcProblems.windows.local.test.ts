import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchVsCodeWithFixtures } from './vscodeHarness';

const pcbName = 'RoyalBlue54L-Feather.kicad_pcb';
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

function sha256(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('native Windows DRC palette runs on an authentic KiCad 10 PCB custom editor', async () => {
  test.skip(
    process.platform !== 'win32' ||
      process.env.KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE !== '1' ||
      !fs.existsSync(cliPath) ||
      !fs.existsSync(path.join(demoDir, pcbName)),
    'Explicitly opted-in native KiCad 10 PCB acceptance'
  );
  test.setTimeout(210_000);
  const original = path.join(demoDir, pcbName);
  const sourceHash = sha256(original);
  const session = await launchVsCodeWithFixtures({
    workspaceSourcePath: demoDir,
    settings: { 'kicadstudio.kicadCliPath': cliPath }
  });

  try {
    const isolated = path.join(session.workspacePath, pcbName);
    expect(sha256(isolated)).toBe(sourceHash);
    const board = session.page
      .locator('.explorer-folders-view')
      .getByText(pcbName, { exact: true });
    await expect(board).toBeVisible({ timeout: 60_000 });
    await board.dblclick();
    await expect(session.page.locator('.tab.active')).toContainText(pcbName, {
      timeout: 60_000
    });

    const palette = session.page.locator('.quick-input-widget');
    await expect(async () => {
      await session.page.keyboard.press('Control+Shift+P');
      await expect(palette).toBeVisible();
      await palette.locator('input').fill('>DRC');
      await expect(palette).toContainText('Run Design Rule Check (DRC)', {
        timeout: 3500
      });
    }).toPass({ timeout: 30_000 });
    console.log('NATIVE_DRC_COMMAND_VISIBLE=PASS');
    await session.page.keyboard.press('Enter');

    const problems = session.page.locator('.markers-panel');
    await expect(problems).toBeVisible({ timeout: 120_000 });
    await expect(problems).toContainText('kicad-cli:drc', {
      timeout: 120_000
    });
    console.log('NATIVE_DRC_PROBLEMS=PASS');
    expect(sha256(isolated)).toBe(sourceHash);
    expect(sha256(original)).toBe(sourceHash);
  } finally {
    await session.close();
  }
});
