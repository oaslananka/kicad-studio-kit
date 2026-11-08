import { expect, test } from '@playwright/test';
import type { Frame, Page } from '@playwright/test';
import { launchVsCodeWithFixtures } from './vscodeHarness';

// Local acceptance on an isolated VS Code Extension Development Host.
// No user VS Code profile, secrets, external service or source KiCad files.
const installedKiCadCli = String.raw`C:\Program Files\KiCad\10.0\bin\kicad-cli.exe`;

async function openTaskHub(page: Page) {
  const picker = page.locator('.quick-input-widget');
  await expect(async () => {
    await page.keyboard.press('Control+Shift+P');
    await expect(picker).toBeVisible();
    const input = picker.locator('input');
    await input.fill('');
    await input.fill('>KiCad Studio: Open Task Hub');
    await expect(picker).toContainText('KiCad Studio: Open Task Hub', {
      timeout: 2500
    });
  }).toPass({ timeout: 30000 });
  await page.keyboard.press('Enter');
  await expect(picker).toContainText('Maintain', { timeout: 15000 });
  return picker;
}

async function settingsFrame(page: Page): Promise<Frame> {
  let match: Frame | undefined;
  await expect
    .poll(
      async () => {
        for (const frame of page.frames()) {
          if (await frame.locator('#cli-health').count()) {
            match = frame;
            return true;
          }
        }
        return false;
      },
      { timeout: 30000 }
    )
    .toBe(true);
  if (!match) throw new Error('KiCad Studio Health webview did not open.');
  return match;
}

test('Windows native Task Hub selection and Health webview actions actually work', async () => {
  test.skip(
    process.platform !== 'win32' ||
      process.env.KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE !== '1',
    'Opt-in local Windows native acceptance only'
  );
  const session = await launchVsCodeWithFixtures({
    settings: { 'kicadstudio.kicadCliPath': installedKiCadCli }
  });

  try {
    await expect(session.page.locator('.explorer-folders-view')).toBeVisible();
    const picker = await openTaskHub(session.page);
    await picker.locator('input').fill('Maintain');
    await expect(picker).toContainText('Maintain');
    await session.page.keyboard.press('Enter');
    await expect(picker).toContainText('Open settings panel', {
      timeout: 15000
    });
    await picker.locator('input').fill('Open settings panel');
    await session.page.keyboard.press('Enter');

    const panel = await settingsFrame(session.page);
    await expect(
      panel.getByRole('heading', { name: 'KiCad Studio Capability Health' })
    ).toBeVisible();
    await expect(panel.locator('#cli-health')).toBeVisible();
    await expect(panel.locator('#ai-health')).toBeVisible();
    await expect(panel.locator('#mcp-health')).toBeVisible();
    await expect(panel.locator('#boardreadyops-health')).toBeVisible();
    await expect(panel.locator('#viewer-health')).toBeVisible();

    await panel.locator('#detect-cli').click();
    await expect(panel.locator('#cli-health-label')).toContainText('10.0.8', {
      timeout: 30000
    });
    console.log(
      'WINDOWS_NATIVE_CLI_LABEL=' +
        (await panel.locator('#cli-health-label').innerText())
    );

    await test.info().attach('native-windows-health', {
      body: await session.page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });

    await panel.locator('#open-native-settings').click();
    await expect(session.page.locator('.settings-editor')).toBeVisible({
      timeout: 20000
    });
    console.log('WINDOWS_NATIVE_TASK_HUB_AND_SETTINGS=PASS');
  } finally {
    await session.close();
  }
});

test('Windows explicit Open as PCB Viewer opens a native custom editor', async () => {
  test.skip(
    process.platform !== 'win32' ||
      process.env.KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE !== '1',
    'Opt-in local Windows native acceptance only'
  );
  const session = await launchVsCodeWithFixtures({ mockKiCadCli: true });
  try {
    const picker = await openTaskHub(session.page);
    await session.page.keyboard.press('Escape');
    await expect(picker).toBeHidden();
    const entry = session.page
      .locator('.explorer-folders-view')
      .getByText('sample.kicad_pcb', { exact: true });
    await expect(entry).toBeVisible();
    await entry.dblclick();
    await expect(session.page.locator('.tab.active')).toContainText(
      'sample.kicad_pcb'
    );

    await expect(async () => {
      await session.page.keyboard.press('Control+Shift+P');
      await expect(picker).toBeVisible();
      const input = picker.locator('input');
      await input.fill('');
      await input.fill('>KiCad: Open as PCB Viewer');
      await expect(picker).toContainText('KiCad: Open as PCB Viewer', {
        timeout: 2500
      });
    }).toPass({ timeout: 30000 });
    await session.page.keyboard.press('Enter');

    let viewerFrame: Frame | undefined;
    await expect
      .poll(
        async () => {
          for (const frame of session.page.frames()) {
            if (await frame.locator('#viewer-engine-badge').count()) {
              viewerFrame = frame;
              return true;
            }
          }
          return false;
        },
        { timeout: 30000 }
      )
      .toBe(true);

    if (!viewerFrame) throw new Error('Explicit PCB viewer did not mount.');
    await expect(viewerFrame.locator('#viewer-engine-badge')).toBeVisible();
    console.log('WINDOWS_EXPLICIT_PCB_VIEWER_MOUNT=PASS');
    await test.info().attach('windows-explicit-pcb-viewer', {
      body: await session.page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
  } finally {
    await session.close();
  }
});
