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
    // Opening a PCB tab can precede extension-host command registration.
    // Wait for Studio's own status contribution before testing its palette.
    await expect(session.page.locator('.statusbar')).toContainText('MCP', {
      timeout: 60000
    });
    const isolated = path.join(session.workspacePath, pcbName);
    expect(sha256(isolated)).toBe(sourceHash);
    const projectName = 'RoyalBlue54L-Feather';
    const projectFile = path.join(
      session.workspacePath,
      projectName + '.kicad_pro'
    );
    const originalProject = path.join(demoDir, projectName + '.kicad_pro');
    const expectedProjectHash = sha256(projectFile);
    expect(expectedProjectHash).toBe(sha256(originalProject));
    const sidecar = path.join(
      session.workspacePath,
      projectName + '.kicad_prl'
    );
    // If a user's existing KiCad project-local settings are present,
    // preserve their content; otherwise DRC must not create new sidecars.
    const sidecarBefore = fs.existsSync(sidecar) ? sha256(sidecar) : undefined;
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
    // VS Code can rank its built-in Debug: Run to Cursor above DRC for >DRC.
    // Select the KiCad command explicitly instead of relying on fuzzy ranking.
    await palette
      .getByText('Run Design Rule Check (DRC)', { exact: false })
      .click();

    const problems = session.page.locator('.markers-panel');
    await expect(problems).toBeVisible({ timeout: 120_000 });
    await expect(problems).toContainText('kicad-cli:drc', {
      timeout: 120_000
    });
    console.log('NATIVE_DRC_PROBLEMS=PASS');
    expect(sha256(isolated)).toBe(sourceHash);
    expect(sha256(original)).toBe(sourceHash);
    expect(sha256(projectFile)).toBe(expectedProjectHash);
    expect(sha256(originalProject)).toBe(expectedProjectHash);
    expect(fs.existsSync(sidecar)).toBe(sidecarBefore !== undefined);
    if (sidecarBefore !== undefined) {
      expect(sha256(sidecar)).toBe(sidecarBefore);
    }
    console.log('NATIVE_DRC_USER_PROJECT_SIDECAR_UNCHANGED=PASS');
  } finally {
    await session.close();
  }
});
