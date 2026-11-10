import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchVsCodeWithFixtures } from './vscodeHarness';

const demo = path.join(
  process.env['ProgramFiles'] ?? 'C:/Program Files',
  'KiCad',
  '10.0',
  'share',
  'kicad',
  'demos',
  'vme-wren'
);
const name = 'vme-wren';
const original = path.join(demo, name + '.kicad_pcb');
const cli = path.join(
  process.env['ProgramFiles'] ?? 'C:/Program Files',
  'KiCad',
  '10.0',
  'bin',
  'kicad-cli.exe'
);
const sha = (file: string): string =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('real 71.6 MB Windows VME Wren DRC reaches VS Code Problems without modifying user files', async () => {
  test.skip(
    process.platform !== 'win32' ||
      process.env['KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE'] !== '1' ||
      !fs.existsSync(original) ||
      !fs.existsSync(cli),
    'Opt-in physical Windows VS Code and installed KiCad 10 acceptance only'
  );
  test.setTimeout(280_000);

  const originalSha = sha(original);
  const session = await launchVsCodeWithFixtures({
    workspaceSourcePath: demo,
    settings: { 'kicadstudio.kicadCliPath': cli }
  });
  try {
    const pcb = path.join(session.workspacePath, name + '.kicad_pcb');
    const project = path.join(session.workspacePath, name + '.kicad_pro');
    const pcbSha = sha(pcb);
    const projectSha = sha(project);
    const sidecar = path.join(session.workspacePath, name + '.kicad_prl');
    const sidecarSha = fs.existsSync(sidecar) ? sha(sidecar) : undefined;
    expect(pcbSha).toBe(originalSha);

    const picker = session.page.locator('.quick-input-widget');
    await session.page.keyboard.press('Control+P');
    await expect(picker).toBeVisible();
    await picker.locator('input').fill(name + '.kicad_pcb');
    await expect(picker).toContainText(name + '.kicad_pcb', {
      timeout: 30_000
    });
    await session.page.keyboard.press('Enter');
    await expect(session.page.locator('.tab.active')).toContainText(
      name + '.kicad_pcb',
      { timeout: 45_000 }
    );

    await expect(async () => {
      await session.page.keyboard.press('Control+Shift+P');
      await expect(picker).toBeVisible();
      await picker.locator('input').fill('>DRC');
      await expect(picker).toContainText('Run Design Rule Check (DRC)', {
        timeout: 3500
      });
    }).toPass({ timeout: 30_000 });
    await picker
      .getByText('Run Design Rule Check (DRC)', { exact: false })
      .click();
    const problems = session.page.locator('.markers-panel');
    await expect(problems).toBeVisible({ timeout: 225_000 });
    await expect(problems).toContainText('kicad-cli:drc', {
      timeout: 225_000
    });
    const displayed = (await problems.innerText()).slice(0, 1000);
    console.log(
      'REAL_VME_DRC_WINDOWS_PROBLEMS=' +
        JSON.stringify({ visible: true, prefix: displayed })
    );
    const panelLines = (await problems.innerText()).split(/\r?\n/);
    const markerTotal = Number(
      panelLines.find((line) => /^\d+$/.test(line.trim()))
    );
    expect(markerTotal).toBe(478);
    console.log('REAL_VME_DRC_WINDOWS_UNIQUE_MARKERS=' + markerTotal);

    // A user reviewing a schematic must be able to open the reported PCB
    // again by activating a primary Problems entry.
    await session.page.keyboard.press('Control+P');
    await expect(picker).toBeVisible();
    await picker.locator('input').fill(name + '.kicad_sch');
    // Wait for Quick Open's asynchronous file-search results before Enter;
    // otherwise it may reactivate the previous PCB tab.
    await expect(picker).toContainText(name + '.kicad_sch', {
      timeout: 30000
    });
    await session.page.keyboard.press('Enter');
    await expect(session.page.locator('.tab.active')).toContainText(
      name + '.kicad_sch',
      { timeout: 30000 }
    );
    const primaryProblem = problems
      .locator('.monaco-list-row')
      .filter({ hasText: 'kicad-cli:drc' })
      .first();
    await expect(primaryProblem).toBeVisible({ timeout: 15000 });
    await primaryProblem.dblclick();
    await expect(session.page.locator('.tab.active')).toContainText(
      name + '.kicad_pcb',
      { timeout: 30000 }
    );
    console.log('REAL_VME_DRC_PRIMARY_BOARD_TAB_OPENED=PASS');
    expect(sha(pcb)).toBe(pcbSha);
    expect(sha(original)).toBe(originalSha);
    expect(sha(project)).toBe(projectSha);
    expect(fs.existsSync(sidecar)).toBe(sidecarSha !== undefined);
    if (sidecarSha !== undefined) {
      expect(sha(sidecar)).toBe(sidecarSha);
    }
    console.log('REAL_VME_DRC_WINDOWS_USER_SOURCE_IMMUTABLE=PASS');
  } finally {
    await session.close();
  }
});
