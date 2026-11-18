import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, test, type Frame } from '@playwright/test';
import { launchVsCodeWithFixtures } from './vscodeHarness';

const realSource = process.env.KICADSTUDIO_QA_SCHEMATIC_DIR;
const schematic = 'test.kicad_sch';

function sha256(file: string) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('native VS Code real user schematic: Fit, zoom, theme, grid, reference and source integrity', async () => {
  test.skip(
    process.platform !== 'win32' ||
      process.env.KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE !== '1' ||
      !realSource ||
      !fs.existsSync(path.join(realSource, schematic)),
    'Requires opted-in isolated Windows KiCad schematic QA source'
  );
  test.setTimeout(225000);

  const originalHash = sha256(path.join(realSource!, schematic));
  const session = await launchVsCodeWithFixtures({
    workspaceSourcePath: realSource,
    settings: {
      'kicadstudio.kicadCliPath': process.env.KICADSTUDIO_QA_KICAD_CLI
    }
  });
  try {
    await expect(session.page.locator('.statusbar')).toContainText('MCP', {
      timeout: 45000
    });
    const picker = session.page.locator('.quick-input-widget');
    await session.page.keyboard.press('Control+P');
    await expect(picker).toBeVisible();
    await picker.locator('input').fill(schematic);
    await expect(picker).toContainText(schematic);
    await session.page.keyboard.press('Enter');
    await expect(session.page.locator('.tab.active')).toContainText(schematic, {
      timeout: 30000
    });

    let frame: Frame | undefined;
    await expect
      .poll(
        async () => {
          for (const candidate of session.page.frames()) {
            if (await candidate.locator('#fit-btn').count()) {
              frame = candidate;
              return true;
            }
          }
          return false;
        },
        { timeout: 40000 }
      )
      .toBe(true);
    if (!frame) throw new Error('Real schematic viewer webview did not mount.');

    await expect(frame.locator('#viewer-status')).toContainText(
      'Interactive renderer loaded',
      { timeout: 90000 }
    );
    const getCamera = () =>
      frame!.evaluate(() => {
        const embed: any = document.querySelector('kicanvas-embed');
        const app: any = embed?.shadowRoot?.querySelector('kc-schematic-app');
        return app?.viewer?.viewport?.camera?.zoom as number;
      });
    const initial = await getCamera();
    expect(initial).toBeGreaterThan(0);
    await frame.locator('#zoom-in-btn').click();
    expect(await getCamera()).toBeGreaterThan(initial * 1.15);
    await frame.locator('#fit-btn').click();
    expect(await getCamera()).toBeCloseTo(initial, 2);
    await frame.locator('#grid-toggle').click();
    await expect(frame.locator('body')).toHaveClass(/grid-visible/);
    await frame.locator('#theme-toggle').click();
    await expect(frame.locator('#theme-toggle')).toHaveText('Dark');

    await frame.locator('#export-menu-toggle').click();
    await expect(frame.locator('#export-png-btn')).toBeVisible();
    await expect(frame.locator('#export-svg-btn')).toBeVisible();
    await frame.locator('#export-menu-toggle').click();
    await expect(frame.locator('#sheet-select')).toBeDisabled();
    await frame.locator('#side-panel-toggle').click();
    await expect(frame.locator('body')).not.toHaveClass(/tools-collapsed/);

    expect(sha256(path.join(session.workspacePath, schematic))).toBe(
      originalHash
    );
    expect(sha256(path.join(realSource!, schematic))).toBe(originalHash);
    console.log(
      'NATIVE_USER_SCHEMATIC_TOOLBAR_PASS',
      JSON.stringify({
        afterZoom: await getCamera(),
        sourceUnchanged: true,
        theme: await frame.locator('#theme-toggle').innerText()
      })
    );
    await test.info().attach('real-user-schematic-toolbar', {
      body: await session.page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
  } finally {
    await session.close();
  }
});

test('native KiCad 10 official hierarchical schematic opens an actual child source', async () => {
  const demoDir = path.join(
    process.env.ProgramFiles ?? String.raw`C:\Program Files`,
    'KiCad',
    '10.0',
    'share',
    'kicad',
    'demos',
    'royalblue54L_feather'
  );
  const projectFile = 'RoyalBlue54L-Feather.kicad_sch';
  const childFile = path.join('sch', 'Connectors.kicad_sch');
  test.skip(
    process.platform !== 'win32' ||
      process.env.KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE !== '1' ||
      !fs.existsSync(path.join(demoDir, projectFile)) ||
      !fs.existsSync(path.join(demoDir, childFile)),
    'Opt-in Windows authentic hierarchical schematic acceptance'
  );
  test.setTimeout(190000);
  const originalRoot = sha256(path.join(demoDir, projectFile));
  const originalChild = sha256(path.join(demoDir, childFile));
  const session = await launchVsCodeWithFixtures({
    workspaceSourcePath: demoDir
  });
  try {
    await expect(session.page.locator('.statusbar')).toContainText('MCP', {
      timeout: 45000
    });
    const picker = session.page.locator('.quick-input-widget');
    await session.page.keyboard.press('Control+P');
    await picker.locator('input').fill(projectFile);
    await expect(picker).toContainText(projectFile);
    await session.page.keyboard.press('Enter');
    await expect(session.page.locator('.tab.active')).toContainText(
      projectFile
    );
    let frame: Frame | undefined;
    await expect
      .poll(
        async () => {
          for (const candidate of session.page.frames()) {
            if (await candidate.locator('#sheet-select').count()) {
              frame = candidate;
              return true;
            }
          }
          return false;
        },
        { timeout: 40000 }
      )
      .toBe(true);
    if (!frame) throw new Error('Schematic view not loaded.');
    await expect(frame.locator('#viewer-status')).toContainText(
      /Interactive renderer loaded|CLI SVG fallback loaded/,
      { timeout: 70000 }
    );
    const dropdown = frame.locator('#sheet-select');
    await expect(dropdown).toBeEnabled();
    await expect(dropdown.locator('option')).toContainText([
      'Root sheet',
      'Connectors',
      'nPM1300',
      'nRF54L15',
      'Debugger'
    ]);
    const options = await dropdown.locator('option').evaluateAll((els) =>
      els.map((e) => ({
        value: (e as HTMLOptionElement).value,
        text: e.textContent
      }))
    );
    const target = options.find((x) => x.text === 'Connectors');
    expect(target?.value).toBeTruthy();
    await dropdown.selectOption(target!.value);
    await expect(session.page.locator('.tab.active')).toContainText(
      'Connectors.kicad_sch',
      { timeout: 30000 }
    );
    expect(sha256(path.join(demoDir, projectFile))).toBe(originalRoot);
    expect(sha256(path.join(demoDir, childFile))).toBe(originalChild);
    expect(sha256(path.join(session.workspacePath, projectFile))).toBe(
      originalRoot
    );
    expect(sha256(path.join(session.workspacePath, childFile))).toBe(
      originalChild
    );
    console.log('NATIVE_OFFICIAL_HIERARCHICAL_SHEET_NAVIGATION=PASS');
  } finally {
    await session.close();
  }
});
