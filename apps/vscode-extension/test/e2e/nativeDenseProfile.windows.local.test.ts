import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchVsCodeWithFixtures } from './vscodeHarness';

// Profiling is deliberately opt-in and scoped to a disposable KiCad 10 demo.
// This test never treats an unpainted large PCB as a passed acceptance.
const demoDir = path.join(
  process.env.ProgramFiles ?? String.raw`C:\Program Files`,
  'KiCad',
  '10.0',
  'share',
  'kicad',
  'demos',
  'vme-wren'
);
const fileName = 'vme-wren.kicad_pcb';

test('Windows bounded dense-viewer phase and main-thread responsiveness profile', async () => {
  test.skip(
    process.platform !== 'win32' ||
      process.env.KICADSTUDIO_LOCAL_WINDOWS_ACCEPTANCE !== '1' ||
      !fs.existsSync(path.join(demoDir, fileName)),
    'Only local Windows with the KiCad 10 VME Wren demo'
  );
  test.setTimeout(110_000);
  const session = await launchVsCodeWithFixtures({
    workspaceSourcePath: demoDir,
    settings: {
      'kicadstudio.viewer.largeFileThresholdBytes': 110 * 1024 * 1024
    }
  });
  const samples: string[] = [];
  const started = Date.now();

  try {
    session.page.on('console', (message) => {
      const line = message.text();
      if (!line.startsWith('KICAD_DENSE_PROFILE ')) return;
      samples.push(line);
      // Stage timings only. No file contents or user paths are logged.
      console.log(line);
    });
    await session.page.addInitScript(() => {
      let previousTick = performance.now();
      let lastStatus = '';
      const start = performance.now();
      window.setInterval(() => {
        const now = performance.now();
        const status = document.getElementById('viewer-status');
        if (!status) {
          previousTick = now;
          return;
        }
        const value = (status.textContent ?? '').slice(0, 80);
        const lagMs = Math.round(now - previousTick - 1000);
        previousTick = now;
        if (value !== lastStatus || lagMs > 1500) {
          console.info(
            'KICAD_DENSE_PROFILE status=' +
              value +
              ' elapsedMs=' +
              Math.round(now - start) +
              ' eventLoopLagMs=' +
              lagMs
          );
          lastStatus = value;
        }
      }, 1000);
    });
    await expect(session.page.locator('.statusbar')).toContainText('MCP', {
      timeout: 30000
    });
    const picker = session.page.locator('.quick-input-widget');
    await session.page.keyboard.press('Control+P');
    await expect(picker).toBeVisible();
    await picker.locator('input').fill(fileName);
    await expect(picker).toContainText(fileName, { timeout: 30000 });
    await session.page.keyboard.press('Enter');
    await expect(session.page.locator('.tab.active')).toContainText(fileName);
    console.log(
      'WINDOWS_DENSE_PROFILE_TAB_OPENED_MS=' + (Date.now() - started)
    );

    await expect
      .poll(
        async () =>
          session.page
            .frames()
            .some((frame) => frame.url().startsWith('vscode-webview:')),
        { timeout: 30000 }
      )
      .toBe(true);
    // The outer Playwright process remains responsive while a renderer might
    // monopolize its own UI thread. Stop sampling at a finite horizon.
    await new Promise<void>((resolve) => setTimeout(resolve, 32_000));
    console.log('WINDOWS_DENSE_PROFILE_SAMPLES=' + samples.length);
    console.log(
      'WINDOWS_DENSE_PROFILE_OBSERVATION_MS=' + (Date.now() - started)
    );
    // This is a profile, not a pass for rendering the board.
  } finally {
    await session.close();
  }
});
