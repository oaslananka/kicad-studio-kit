import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
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

test('Windows explicit PCB viewer recovers from KiCanvas source error with CLI SVG', async () => {
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

    let frame: Frame | undefined;
    await expect
      .poll(
        async () => {
          for (const candidate of session.page.frames()) {
            if (await candidate.locator('#viewer-engine-badge').count()) {
              frame = candidate;
              return true;
            }
          }
          return false;
        },
        { timeout: 30000 }
      )
      .toBe(true);
    if (!frame) throw new Error('PCB custom editor failed to mount.');
    await expect(frame.locator('#reload-btn')).toBeVisible();
    await frame.evaluate(() => {
      const state = window as Window & { __kicadBlockedMounts?: number };
      state.__kicadBlockedMounts = 0;
      const original = Element.prototype.appendChild;
      Element.prototype.appendChild = function <T extends Node>(child: T): T {
        if (
          this.localName === 'kicanvas-embed' &&
          child instanceof Element &&
          child.localName === 'kicanvas-source'
        ) {
          state.__kicadBlockedMounts = (state.__kicadBlockedMounts ?? 0) + 1;
          throw new Error('Intentional KiCanvas mount failure for local test');
        }
        return original.call(this, child);
      };
    });
    await frame.locator('#reload-btn').click();
    await expect(frame.locator('#viewer-engine-badge')).toHaveText(
      'CLI SVG fallback',
      { timeout: 60000 }
    );
    expect(
      await frame.evaluate(
        () =>
          (window as Window & { __kicadBlockedMounts?: number })
            .__kicadBlockedMounts ?? 0
      )
    ).toBeGreaterThan(0);
    await expect(frame.locator('#viewer-mount svg')).toBeVisible();
    console.log('WINDOWS_NATIVE_PCB_SVG_RECOVERY=PASS');
    await test.info().attach('windows-pcb-svg-recovery', {
      body: await session.page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
  } catch (error) {
    console.log(
      'WINDOWS_RECOVERY_FRAMES=' +
        JSON.stringify(session.page.frames().map((f) => f.url().slice(0, 100)))
    );
    console.log(
      'WINDOWS_RECOVERY_TABS=' +
        JSON.stringify(
          await session.page
            .locator('.tab.active')
            .allInnerTexts()
            .catch(() => [])
        )
    );
    throw error;
  } finally {
    await session.close();
  }
});

test('Windows eight-copper-layer fixture controls change native KiCanvas camera and net visibility', async () => {
  test.skip(
    process.platform !== 'win32' ||
      process.env.KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE !== '1',
    'Opt-in local Windows native acceptance only'
  );
  const session = await launchVsCodeWithFixtures();
  try {
    const picker = await openTaskHub(session.page);
    await session.page.keyboard.press('Escape');
    await expect(picker).toBeHidden();

    const folder = session.page
      .locator('.explorer-folders-view')
      .getByText('kicad10', { exact: true });
    await expect(folder).toBeVisible();
    const folderRow = folder.locator('xpath=ancestor::*[@role="treeitem"][1]');
    if ((await folderRow.getAttribute('aria-expanded')) !== 'true') {
      await folder.click();
    }
    const file = session.page
      .locator('.explorer-folders-view')
      .getByText('multilayer_traces.kicad_pcb', { exact: true });
    await expect(file).toBeVisible();
    await file.dblclick();
    await expect(session.page.locator('.tab.active')).toContainText(
      'multilayer_traces.kicad_pcb'
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

    let frame: Frame | undefined;
    await expect
      .poll(
        async () => {
          for (const candidate of session.page.frames()) {
            if (await candidate.locator('#viewer-engine-badge').count()) {
              frame = candidate;
              return true;
            }
          }
          return false;
        },
        { timeout: 30000 }
      )
      .toBe(true);
    if (!frame) throw new Error('KiCanvas custom viewer did not open.');
    await expect(frame.locator('#viewer-engine-badge')).toHaveText('KiCanvas', {
      timeout: 45000
    });
    await expect(frame.locator('#viewer-status')).toContainText(
      'Interactive renderer loaded',
      { timeout: 45000 }
    );

    // Read KiCanvas's actual model, not merely the toolbar's percentage.
    const cameraZoom = () =>
      frame!.evaluate(() => {
        const embed = document.querySelector('kicanvas-embed') as any;
        const viewer =
          embed?.viewer ??
          embed?.shadowRoot?.querySelector('kc-board-app')?.viewer;
        return viewer?.viewport?.camera?.zoom as number | undefined;
      });
    const initialZoom = await cameraZoom();
    expect(initialZoom).toBeGreaterThan(0);
    await frame.locator('#zoom-in-btn').click();
    await expect(frame.locator('#zoom-level')).toHaveText('120%');
    expect(await cameraZoom()).toBeCloseTo(initialZoom! * 1.2, 3);
    await frame.locator('#fit-btn').click();
    await expect(frame.locator('#zoom-level')).toHaveText('100%');
    expect(await cameraZoom()).toBeCloseTo(initialZoom!, 3);

    const gridOpacity = () =>
      frame!.evaluate(() => {
        const embed = document.querySelector('kicanvas-embed') as any;
        const viewer =
          embed?.viewer ??
          embed?.shadowRoot?.querySelector('kc-board-app')?.viewer;
        return viewer?.layers?.by_name?.(':Grid')?.opacity as
          number | undefined;
      });
    const gridBefore = await gridOpacity();
    expect(gridBefore).toBe(0);
    await frame.locator('#grid-toggle').click();
    await expect(frame.locator('#grid-toggle')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(await gridOpacity()).not.toBe(gridBefore);
    await frame.locator('#side-panel-toggle').click();
    await expect(frame.locator('#layers-section')).toBeVisible();
    await frame.getByRole('button', { name: 'Focus In3.Cu' }).click();
    await frame.locator('#layer-solo-btn').click();
    await expect(frame.locator('#layer-count')).toContainText('1/');
    await frame.locator('#all-layers-btn').click();
    await expect(frame.locator('#layer-solo-btn')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    await expect(frame.locator('#nets-section')).toBeVisible();
    await expect(frame.locator('#net-count')).toHaveText('1 net');
    const canvasBefore = PNG.sync.read(
      await frame.locator('#viewer-mount').screenshot()
    );
    await frame.locator('#net-search').fill('TEST');
    await frame.locator('#net-highlight-btn').click();
    await expect(frame.locator('#net-feedback')).toContainText('8 tracks/arcs');
    const canvasHighlighted = PNG.sync.read(
      await frame.locator('#viewer-mount').screenshot()
    );
    expect(countChangedPixels(canvasBefore, canvasHighlighted)).toBeGreaterThan(
      150
    );
    await frame.locator('#net-clear-btn').click();
    await expect(frame.locator('#net-feedback')).toContainText(
      'Net highlight cleared'
    );
    const canvasCleared = PNG.sync.read(
      await frame.locator('#viewer-mount').screenshot()
    );
    expect(countChangedPixels(canvasBefore, canvasCleared)).toBeLessThan(150);
    console.log('WINDOWS_NATIVE_EIGHT_LAYER_CAMERA_LAYERS_NETS=PASS');
    await test.info().attach('windows-eight-layer-controls', {
      body: await session.page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
  } finally {
    await session.close();
  }
});

function countChangedPixels(left: PNG, right: PNG): number {
  expect(left.width).toBe(right.width);
  expect(left.height).toBe(right.height);
  let changed = 0;
  for (let i = 0; i < left.data.length; i += 4) {
    if (
      Math.abs(left.data[i]! - right.data[i]!) > 14 ||
      Math.abs(left.data[i + 1]! - right.data[i + 1]!) > 14 ||
      Math.abs(left.data[i + 2]! - right.data[i + 2]!) > 14
    )
      changed++;
  }
  return changed;
}
