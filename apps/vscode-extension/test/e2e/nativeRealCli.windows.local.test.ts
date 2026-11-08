import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Frame } from '@playwright/test';
import { launchVsCodeWithFixtures } from './vscodeHarness';

const fileName = 'CH224A breakout board design.kicad_pcb';
const cliPath = String.raw`C:\Program Files\KiCad\10.0\bin\kicad-cli.exe`;
const fixtureDir = path.resolve(
  __dirname,
  '../fixtures/benchmark_projects/ch224a_breakout'
);

function fileHash(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('Windows real KiCad CLI delivers visible PCB SVG fallback without altering source', async () => {
  test.skip(
    process.platform !== 'win32' ||
      process.env.KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE !== '1',
    'Opt-in isolated local Windows test only'
  );
  expect(fs.existsSync(cliPath)).toBe(true);
  const originalFile = path.join(fixtureDir, fileName);
  const originalHash = fileHash(originalFile);
  const session = await launchVsCodeWithFixtures({
    workspaceSourcePath: fixtureDir,
    settings: { 'kicadstudio.kicadCliPath': cliPath }
  });

  try {
    const copiedFile = path.join(session.workspacePath, fileName);
    expect(fileHash(copiedFile)).toBe(originalHash);
    const picker = session.page.locator('.quick-input-widget');
    await expect(async () => {
      await session.page.keyboard.press('Control+Shift+P');
      await expect(picker).toBeVisible();
      await picker.locator('input').fill('');
      await picker.locator('input').fill('>KiCad Studio: Open Task Hub');
      await expect(picker).toContainText('KiCad Studio: Open Task Hub');
    }).toPass({ timeout: 30000 });
    await session.page.keyboard.press('Escape');
    await expect(picker).toBeHidden();

    const file = session.page
      .locator('.explorer-folders-view')
      .getByText(fileName, { exact: true });
    await expect(file).toBeVisible();
    await file.dblclick();
    await expect(session.page.locator('.tab.active')).toContainText(fileName);
    const findViewer = async (): Promise<Frame | undefined> => {
      for (const f of session.page.frames()) {
        if (await f.locator('#viewer-engine-badge').count()) {
          return f;
        }
      }
      return undefined;
    };
    // A real project may already select the default custom editor,
    // unlike a placeholder fixture. Prefer the actual default-open path.
    await expect
      .poll(async () => Boolean(await findViewer()), {
        timeout: 9000
      })
      .toBe(true)
      .catch(() => undefined);
    let view = await findViewer();
    console.log('WINDOWS_REAL_PCB_DEFAULT_VIEWER=' + Boolean(view));
    if (!view) {
      await session.page.locator('.part.titlebar').click({
        position: { x: 180, y: 10 }
      });
      await expect(async () => {
        await session.page.keyboard.press('Control+Shift+P');
        await expect(picker).toBeVisible();
        await picker.locator('input').fill('');
        await picker.locator('input').fill('>KiCad: Open as PCB Viewer');
        await expect(picker).toContainText('KiCad: Open as PCB Viewer');
      }).toPass({ timeout: 30000 });
      await session.page.keyboard.press('Enter');
      await expect
        .poll(async () => Boolean(await findViewer()), {
          timeout: 30000
        })
        .toBe(true);
      view = await findViewer();
    }
    if (!view) throw new Error('PCB custom editor did not mount.');

    await expect(view.locator('#reload-btn')).toBeVisible();
    await view.evaluate(() => {
      const original = Element.prototype.appendChild;
      const state = window as Window & { __nativeRealCliMounts?: number };
      state.__nativeRealCliMounts = 0;
      Element.prototype.appendChild = function <T extends Node>(child: T): T {
        if (
          this.localName === 'kicanvas-embed' &&
          child instanceof Element &&
          child.localName === 'kicanvas-source'
        ) {
          state.__nativeRealCliMounts = (state.__nativeRealCliMounts ?? 0) + 1;
          throw new Error(
            'Intentional local renderer failure for real CLI recovery'
          );
        }
        return original.call(this, child);
      };
    });
    await view.locator('#reload-btn').click();
    await expect(view.locator('#viewer-engine-badge')).toHaveText(
      'CLI SVG fallback',
      { timeout: 60000 }
    );
    expect(
      await view.evaluate(
        () =>
          (window as Window & { __nativeRealCliMounts?: number })
            .__nativeRealCliMounts ?? 0
      )
    ).toBeGreaterThan(0);
    const svg = view.locator('#viewer-mount svg');
    await expect(svg).toBeVisible();
    expect(await svg.locator('path').count()).toBeGreaterThan(0);
    expect(fileHash(copiedFile)).toBe(originalHash);
    expect(fileHash(originalFile)).toBe(originalHash);
    console.log('WINDOWS_REAL_KICAD_CLI_SVG_FALLBACK=PASS');
    await test.info().attach('real-cli-svg-recovery', {
      body: await session.page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
  } finally {
    await session.close();
  }
});

test('Windows KiCad project tree opens PCB custom viewer from a real project node', async () => {
  test.skip(
    process.platform !== 'win32' ||
      process.env.KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE !== '1',
    'Opt-in isolated local Windows test only'
  );
  const session = await launchVsCodeWithFixtures({
    workspaceSourcePath: fixtureDir
  });
  try {
    // A contributed command is not proof that the extension host activated.
    await expect(session.page.locator('.statusbar')).toContainText('MCP', {
      timeout: 60000
    });
    const studioTab = session.page
      .locator('.activitybar')
      .locator('[aria-label*="KiCad Studio"]')
      .first();
    await expect(studioTab).toBeVisible({ timeout: 15000 });
    await studioTab.click();
    const projectPane = session.page.locator('.sidebar .pane').filter({
      has: session.page.getByRole('heading', { name: 'KiCad Project' })
    });
    await expect(projectPane).toBeVisible();
    const tree = projectPane.locator('.pane-body');
    await expect(tree).toContainText('PCB', { timeout: 30000 });
    await expect(tree).toContainText(fileName);
    await tree.getByText(fileName, { exact: true }).click();

    await expect
      .poll(
        async () => {
          for (const f of session.page.frames()) {
            if (await f.locator('#viewer-engine-badge').count()) return true;
          }
          return false;
        },
        { timeout: 30000 }
      )
      .toBe(true);
    console.log('WINDOWS_NATIVE_PROJECT_TREE_PCB_DEFAULT_VIEWER=PASS');
    await test.info().attach('windows-project-tree-pcb', {
      body: await session.page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
  } finally {
    await session.close();
  }
});

test('Windows Explorer uses registered default PCB viewer after extension activation', async () => {
  test.skip(
    process.platform !== 'win32' ||
      process.env.KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE !== '1',
    'Opt-in isolated local Windows test only'
  );
  const session = await launchVsCodeWithFixtures();
  try {
    await expect(session.page.locator('.statusbar')).toContainText('MCP', {
      timeout: 30000
    });
    const pcb = session.page
      .locator('.explorer-folders-view')
      .getByText('sample.kicad_pcb', { exact: true });
    await expect(pcb).toBeVisible();
    await pcb.dblclick();
    await expect(session.page.locator('.tab.active')).toContainText(
      'sample.kicad_pcb'
    );
    await expect
      .poll(
        async () => {
          for (const frame of session.page.frames()) {
            if (await frame.locator('#viewer-engine-badge').count())
              return true;
          }
          return false;
        },
        { timeout: 20000 }
      )
      .toBe(true);
    console.log('WINDOWS_EXPLORER_DEFAULT_PCB_VIEWER=PASS');
  } catch (error) {
    console.log(
      'WINDOWS_EXPLORER_DEFAULT_TABS=' +
        JSON.stringify(
          await session.page.locator('.tab.active').allInnerTexts()
        )
    );
    console.log(
      'WINDOWS_EXPLORER_DEFAULT_STATUS=' +
        JSON.stringify(
          (await session.page.locator('.statusbar').innerText()).slice(0, 500)
        )
    );
    console.log(
      'WINDOWS_EXPLORER_DEFAULT_FRAMES=' +
        JSON.stringify(session.page.frames().map((f) => f.url().slice(0, 110)))
    );
    await test.info().attach('windows-explorer-default-editor', {
      body: await session.page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
    throw error;
  } finally {
    await session.close();
  }
});

test('Windows Quick Open respects default PCB viewer after extension activation', async () => {
  test.skip(
    process.platform !== 'win32' ||
      process.env.KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE !== '1',
    'Opt-in isolated local Windows test only'
  );
  const session = await launchVsCodeWithFixtures();
  try {
    // Wait for real extension activation, not the static manifest command label.
    await expect(session.page.locator('.statusbar')).toContainText('MCP', {
      timeout: 30000
    });
    const picker = session.page.locator('.quick-input-widget');
    await session.page.keyboard.press('Control+P');
    await expect(picker).toBeVisible();
    await picker.locator('input').fill('sample.kicad_pcb');
    await expect(picker).toContainText('sample.kicad_pcb', {
      timeout: 8000
    });
    await session.page.keyboard.press('Enter');
    await expect(picker).toBeHidden();
    await expect(session.page.locator('.tab.active')).toContainText(
      'sample.kicad_pcb'
    );
    await expect
      .poll(
        async () => {
          for (const frame of session.page.frames()) {
            if (await frame.locator('#viewer-engine-badge').count())
              return true;
          }
          return false;
        },
        { timeout: 20000 }
      )
      .toBe(true);
    console.log('WINDOWS_QUICK_OPEN_DEFAULT_PCB_VIEWER=PASS');
  } catch (error) {
    console.log(
      'WINDOWS_QUICK_OPEN_DEFAULT_TABS=' +
        JSON.stringify(
          await session.page.locator('.tab.active').allInnerTexts()
        )
    );
    console.log(
      'WINDOWS_QUICK_OPEN_DEFAULT_FRAMES=' +
        JSON.stringify(session.page.frames().map((f) => f.url().slice(0, 110)))
    );
    await test.info().attach('windows-quick-open-default-editor', {
      body: await session.page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
    throw error;
  } finally {
    await session.close();
  }
});

test('Windows Explorer defaults to custom schematic viewer after extension activation', async () => {
  test.skip(
    process.platform !== 'win32' ||
      process.env.KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE !== '1',
    'Opt-in isolated local Windows test only'
  );
  const session = await launchVsCodeWithFixtures();
  try {
    await expect(session.page.locator('.statusbar')).toContainText('MCP', {
      timeout: 30000
    });
    const schematic = session.page
      .locator('.explorer-folders-view')
      .getByText('sample.kicad_sch', { exact: true });
    await expect(schematic).toBeVisible();
    await schematic.dblclick();
    await expect(session.page.locator('.tab.active')).toContainText(
      'sample.kicad_sch'
    );
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
        { timeout: 20000 }
      )
      .toBe(true);
    if (!frame) throw new Error('Schematic custom editor did not open.');
    await expect(frame.locator('#reload-btn')).toBeVisible();
    await expect(frame.locator('#viewer-engine-badge')).toBeVisible();
    console.log('WINDOWS_EXPLORER_DEFAULT_SCHEMATIC_VIEWER=PASS');
    await test.info().attach('windows-explorer-default-schematic', {
      body: await session.page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
  } finally {
    await session.close();
  }
});
