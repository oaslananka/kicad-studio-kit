import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  launchVsCodeWithFixtures,
  type VsCodeSession
} from '../e2e/vscodeHarness';

const CAPTURE_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  'assets',
  'screenshots'
);
const VIEWPORT = { width: 1280, height: 720 };
const DEMO_WORKSPACE = path.resolve(
  __dirname,
  '..',
  'fixtures',
  'benchmark_projects',
  'pass_i2c_sensor_hub'
);

test.describe('KiCad Studio marketplace captures', () => {
  test('captures real extension host product surfaces', async () => {
    const session = await launchVsCodeWithFixtures({
      workspaceSourcePath: DEMO_WORKSPACE,
      workspaceName: 'KiCad Studio Demo',
      softwareWebgl: true,
      settings: {
        'kicadstudio.kicadCliPath':
          process.env.KICADSTUDIO_MARKETPLACE_KICAD_CLI || '/usr/bin/kicad-cli',
        'workbench.colorTheme': 'Default Dark Modern',
        'window.zoomLevel': 0,
        'editor.minimap.enabled': false,
        'workbench.tips.enabled': false
      }
    });

    try {
      await session.page.setViewportSize(VIEWPORT);
      await waitForCommand(session.page, 'KiCad Studio: Open Task Hub');
      await dismissWelcomeNotification(session.page);
      await closeSecondarySidebar(session.page);

      await openKiCadStudioSidebar(session.page);
      await expect(session.page.locator('body')).toContainText('KiCad Project');
      await capture(session, 'project-tree.png');

      await openWorkspaceFile(session.page, 'demo.kicad_sch');
      await waitForViewerReady(session.page);
      await capture(session, 'schematic-viewer.png');

      await openWorkspaceFile(session.page, 'demo.kicad_pcb');
      await waitForViewerReady(session.page);
      await capture(session, 'pcb-viewer.png');

      await invokeCommand(session.page, 'KiCad: Run Design Rule Check (DRC)');
      await expect
        .poll(
          async () =>
            !(await session.page.locator('body').innerText()).includes(
              'DRCNot run - Run DRC'
            ),
          { timeout: 60000 }
        )
        .toBe(true);
      const problemsPanel = session.page.locator(
        '[id="workbench.parts.panel"]'
      );
      await expect(problemsPanel).toBeVisible({ timeout: 60000 });
      await capture(session, 'drc-results.png');

      await session.page.keyboard.press('Control+Shift+M');
      await openWorkspaceFile(session.page, 'demo.kicad_sch');
      await waitForViewerReady(session.page);
      await openBomView(session.page);
      await capture(session, 'bom-table.png');

      await invokeCommand(
        session.page,
        'KiCad Studio: Focus on MCP & Tools View'
      );
      await expect(session.page.locator('body')).toContainText('MCP', {
        timeout: 10000
      });
      await capture(session, 'mcp-tools-dashboard.png');
    } finally {
      await session.close();
    }
  });
});

async function waitForCommand(page: Page, query: string): Promise<void> {
  const quickInput = page.locator('.quick-input-widget');
  await expect(async () => {
    await page.keyboard.press('Control+Shift+P');
    await expect(quickInput).toBeVisible({ timeout: 5000 });
    const input = quickInput.locator('input');
    await input.fill('');
    await input.fill(`>${query}`);
    await expect(quickInput).toContainText(query, { timeout: 2000 });
  }).toPass({ timeout: 30000 });
  await page.keyboard.press('Escape');
  await expect(quickInput).toBeHidden();
}

async function dismissWelcomeNotification(page: Page): Promise<void> {
  await page.waitForTimeout(750);
  const maybeLater = page.getByText('Maybe Later', { exact: true });
  if (
    (await maybeLater.count()) > 0 &&
    (await maybeLater.first().isVisible())
  ) {
    await maybeLater.first().click();
    await expect(maybeLater.first()).toBeHidden({ timeout: 5000 });
  }
}

async function invokeCommand(page: Page, title: string): Promise<void> {
  const quickInput = page.locator('.quick-input-widget');
  await page.keyboard.press('Control+Shift+P');
  await expect(quickInput).toBeVisible({ timeout: 5000 });
  const input = quickInput.locator('input');
  await input.fill('');
  await input.fill('>' + title);
  await expect(quickInput).toContainText(title, { timeout: 5000 });
  await page.keyboard.press('Enter');
  await expect(quickInput).toBeHidden({ timeout: 5000 });
}

async function openBomView(page: Page): Promise<void> {
  await invokeCommand(page, 'KiCad Studio: Focus on Bill of Materials View');

  await expect
    .poll(
      async () => {
        for (const frame of page.frames()) {
          const rows = frame.locator('#bom-rows tr');
          if ((await rows.count()) > 0) {
            return await rows.count();
          }
        }
        return 0;
      },
      { timeout: 30000 }
    )
    .toBeGreaterThan(0);
}

async function closeSecondarySidebar(page: Page): Promise<void> {
  const auxiliaryBar = page.locator('[id="workbench.parts.auxiliarybar"]');
  if ((await auxiliaryBar.count()) === 0 || !(await auxiliaryBar.isVisible())) {
    return;
  }

  const closeButton = auxiliaryBar.locator(
    '[aria-label*="Close"], [title*="Close"]'
  );
  for (let index = 0; index < (await closeButton.count()); index += 1) {
    const candidate = closeButton.nth(index);
    if (await candidate.isVisible()) {
      await candidate.click();
      await expect(auxiliaryBar).toBeHidden({ timeout: 5000 });
      return;
    }
  }

  await page.keyboard.press('Control+Alt+B');
  await expect(auxiliaryBar).toBeHidden({ timeout: 5000 });
}

async function openKiCadStudioSidebar(page: Page): Promise<void> {
  const candidates = [
    page.locator('.activitybar [aria-label="KiCad Studio"]'),
    page.locator('.activitybar [aria-label^="KiCad Studio"]'),
    page.getByLabel('KiCad Studio', { exact: true })
  ];
  for (const candidate of candidates) {
    if ((await candidate.count()) > 0) {
      await candidate.first().click();
      await expect(page.locator('body'))
        .toContainText('KiCad Project', {
          timeout: 10000
        })
        .catch(() => undefined);
      return;
    }
  }

  const labels = await page
    .locator('.activitybar [aria-label]')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('aria-label'))
    );
  throw new Error(
    `KiCad Studio activity item not found. Activity labels: ${labels.join(', ')}`
  );
}

async function openWorkspaceFile(page: Page, fileName: string): Promise<void> {
  const quickInput = page.locator('.quick-input-widget');
  await page.keyboard.press('Control+P');
  await expect(quickInput).toBeVisible({ timeout: 5000 });
  const input = quickInput.locator('input');
  await input.fill(fileName);
  await expect(quickInput).toContainText(fileName, { timeout: 5000 });
  await page.keyboard.press('Enter');
  await expect(quickInput).toBeHidden({ timeout: 5000 });
}

async function waitForViewerReady(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        for (const frame of page.frames()) {
          const toolbar = frame.locator('#viewer-toolbar');
          if ((await toolbar.count()) === 0 || !(await toolbar.isVisible())) {
            continue;
          }

          const loading = frame.locator('#loading-overlay');
          const error = frame.locator('#error-overlay');
          const mount = frame.locator('#viewer-mount');
          const badge = frame.locator('#viewer-engine-badge');
          const status =
            (await frame.locator('#viewer-status').textContent())?.trim() ?? '';
          const engineKind =
            (await badge.getAttribute('data-engine-kind')) ?? '';
          const loadingHidden =
            (await loading.count()) > 0 &&
            ((await loading.getAttribute('hidden')) !== null ||
              !(await loading.isVisible()));
          const errorHidden =
            (await error.count()) === 0 ||
            (await error.getAttribute('hidden')) !== null ||
            !(await error.isVisible());
          const mountVisible =
            (await mount.count()) > 0 && (await mount.isVisible());
          return {
            ready:
              loadingHidden &&
              errorHidden &&
              mountVisible &&
              !/loading|rendering|preparing/i.test(status),
            engineKind,
            status
          };
        }
        return { ready: false, engineKind: '', status: '' };
      },
      { timeout: 90000 }
    )
    .toMatchObject({ ready: true });
  await page.waitForTimeout(500);
}

async function capture(
  session: VsCodeSession,
  fileName: string
): Promise<void> {
  await hideTransientUi(session.page);
  fs.mkdirSync(CAPTURE_DIR, { recursive: true });
  const target = path.join(CAPTURE_DIR, fileName);
  await session.page.screenshot({
    path: target,
    fullPage: false,
    animations: 'disabled'
  });
  const body = await session.page.locator('body').innerText();
  for (const forbidden of [
    process.env.HOME,
    process.env.USER,
    process.env.USERNAME,
    'ghp_',
    'github_pat_',
    'sk-'
  ]) {
    if (forbidden && forbidden.length >= 3) {
      expect(body).not.toContain(forbidden);
    }
  }
}

async function hideTransientUi(page: Page): Promise<void> {
  await dismissWelcomeNotification(page);
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.evaluate(() => {
    document
      .querySelectorAll('.notifications-center, .notifications-toasts')
      .forEach((node) => ((node as HTMLElement).style.visibility = 'hidden'));
  });
  await page.waitForTimeout(350);
}
