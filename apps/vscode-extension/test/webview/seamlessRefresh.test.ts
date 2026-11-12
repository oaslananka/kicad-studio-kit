import { expect, test, type Page } from '@playwright/test';
import {
  installVsCodeApiMock,
  readFixtureBase64,
  setViewerContent
} from './webviewTestHarness';

type PausedWorker = {
  input: { base64: string; fileType: string };
  onmessage: ((event: { data: unknown }) => void) | null;
  terminated: boolean;
};

async function pausePreparation(page: Page): Promise<void> {
  await page.evaluate(() => {
    const workers: PausedWorker[] = [];
    class WorkerGate {
      onmessage: PausedWorker['onmessage'] = null;
      onerror: ((event: { message: string }) => void) | null = null;
      input = { base64: '', fileType: '' };
      terminated = false;
      constructor(_url: string) {}
      postMessage(input: PausedWorker['input']) {
        this.input = input;
        workers.push(this);
      }
      terminate() {
        this.terminated = true;
      }
    }
    Object.assign(window, { Worker: WorkerGate, __refreshWorkers: workers });
  });
}

async function sendRefresh(
  page: Page,
  base64: string,
  fileType: 'board' | 'schematic'
) {
  await page.evaluate(
    ({ base64, fileType }) =>
      window.postMessage(
        {
          type: 'refresh',
          payload: {
            base64,
            fileName: 'sample.kicad_' + (fileType === 'board' ? 'pcb' : 'sch'),
            fileType
          }
        },
        '*'
      ),
    { base64, fileType }
  );
}

async function workers(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as Window & { __refreshWorkers?: PausedWorker[] })
        .__refreshWorkers?.length ?? 0
  );
}

async function releaseWorker(page: Page, index: number, valid = true) {
  await page.evaluate(
    ({ index, valid }) => {
      const gates =
        (window as Window & { __refreshWorkers?: PausedWorker[] })
          .__refreshWorkers ?? [];
      const gate = gates[index];
      if (!gate) throw new Error('Missing worker');
      const text = valid ? atob(gate.input.base64) : '';
      gate.onmessage?.({
        data: valid
          ? { ok: true, text, renderText: text }
          : { ok: false, message: 'Malformed KiCad source' }
      });
    },
    { index, valid }
  );
}

for (const fileType of ['board', 'schematic'] as const) {
  test(
    fileType +
      ' refresh keeps old drawing visible until new rendering completes',
    async ({ page }) => {
      const name = 'sample.kicad_' + (fileType === 'board' ? 'pcb' : 'sch');
      const source = readFixtureBase64(name);
      await installVsCodeApiMock(page);
      await setViewerContent(page, {
        fileName: name,
        fileType,
        base64: source
      });
      await expect(page.locator('#viewer-status')).toContainText(
        'Interactive renderer loaded:',
        { timeout: 30000 }
      );
      await page.locator('kicanvas-embed').evaluate((node) => {
        node.dataset.lastGood = 'true';
      });
      await pausePreparation(page);
      await sendRefresh(page, source, fileType);
      await expect.poll(() => workers(page)).toBe(1);
      await expect(
        page.locator('kicanvas-embed[data-last-good="true"]')
      ).toBeVisible();
      await expect(page.locator('#viewer-mount')).not.toHaveClass(/is-hidden/);
      await expect(page.locator('#loading-overlay')).toBeHidden();
      await expect(page.locator('#viewer-status')).toContainText('Updating');

      await releaseWorker(page, 0);
      await expect(
        page.locator('kicanvas-embed[data-last-good="true"]')
      ).toHaveCount(0);
      await expect(page.locator('kicanvas-embed')).toHaveCount(1);
      await expect(page.locator('#viewer-mount')).not.toHaveClass(/is-hidden/);
      await expect(page.locator('#loading-overlay')).toBeHidden();
      await expect(page.locator('#viewer-status')).toContainText(
        'Interactive renderer loaded:',
        { timeout: 15000 }
      );
    }
  );
}

test('failed refresh retains last-good geometry and warns the preview is stale', async ({
  page
}) => {
  await installVsCodeApiMock(page);
  await setViewerContent(page, {
    fileName: 'sample.kicad_sch',
    fileType: 'schematic',
    base64: readFixtureBase64('sample.kicad_sch')
  });
  await expect(page.locator('#viewer-status')).toContainText(
    'Interactive renderer loaded:'
  );
  await page.locator('kicanvas-embed').evaluate((node) => {
    node.dataset.lastGood = 'true';
  });
  await pausePreparation(page);
  await sendRefresh(page, '!!!invalid-base64!!!', 'schematic');
  await expect.poll(() => workers(page)).toBe(1);
  await releaseWorker(page, 0, false);
  await expect(
    page.locator('kicanvas-embed[data-last-good="true"]')
  ).toBeVisible();
  await expect(page.locator('#loading-overlay')).toBeHidden();
  await expect(page.locator('#error-overlay')).toBeHidden();
  await expect(page.locator('#viewer-status')).toContainText(/previous|stale/i);
});

test('rapid successive updates cancel stale preparation without blanking the viewer', async ({
  page
}) => {
  const source = readFixtureBase64('sample.kicad_pcb');
  await installVsCodeApiMock(page);
  await setViewerContent(page, {
    fileName: 'sample.kicad_pcb',
    fileType: 'board',
    base64: source
  });
  await expect(page.locator('#viewer-status')).toContainText(
    'Interactive renderer loaded:'
  );
  await page.locator('kicanvas-embed').evaluate((node) => {
    node.dataset.lastGood = 'true';
  });
  await pausePreparation(page);
  await sendRefresh(page, source, 'board');
  await expect.poll(() => workers(page)).toBe(1);
  await sendRefresh(page, source, 'board');
  await expect.poll(() => workers(page)).toBe(2);
  const cancelled = await page.evaluate(
    () =>
      (window as Window & { __refreshWorkers?: PausedWorker[] })
        .__refreshWorkers?.[0]?.terminated
  );
  expect(cancelled).toBe(true);
  await expect(
    page.locator('kicanvas-embed[data-last-good="true"]')
  ).toBeVisible();
  await releaseWorker(page, 1);
  await expect(
    page.locator('kicanvas-embed[data-last-good="true"]')
  ).toHaveCount(0);
  await expect(page.locator('kicanvas-embed')).toHaveCount(1);
  await expect(page.locator('#loading-overlay')).toBeHidden();
});

test('uses one live renderer and a bounded previous-frame snapshot during drawing', async ({
  page
}) => {
  const source = readFixtureBase64('sample.kicad_pcb');
  await installVsCodeApiMock(page);
  await setViewerContent(page, {
    fileName: 'sample.kicad_pcb',
    fileType: 'board',
    base64: source
  });
  await expect(page.locator('#viewer-status')).toContainText(
    'Interactive renderer loaded:'
  );
  await page.evaluate(() => {
    const embed = customElements.get(
      'kicanvas-embed'
    ) as CustomElementConstructor & {
      prototype: HTMLElement & { connectedCallback: () => void };
    };
    const connect = embed.prototype.connectedCallback;
    embed.prototype.connectedCallback = function (this: HTMLElement) {
      Object.assign(window, { __pausedNewEmbed: this });
    };
    Object.assign(window, {
      __resumeNewEmbed: () => {
        const next = (window as Window & { __pausedNewEmbed?: HTMLElement })
          .__pausedNewEmbed;
        if (next) connect.call(next);
      }
    });
  });
  await sendRefresh(page, source, 'board');
  await expect(page.locator('.viewer-last-good-frame')).toBeVisible();
  await expect(page.locator('kicanvas-embed')).toHaveCount(1);
  await expect(page.locator('#loading-overlay')).toBeHidden();
  const framePixels = await page
    .locator('.viewer-last-good-frame')
    .evaluate((node) => {
      const frame = node as HTMLCanvasElement;
      return frame.width * frame.height;
    });
  expect(framePixels).toBeGreaterThan(0);
  expect(framePixels).toBeLessThanOrEqual(1280 * 720);
  await page.evaluate(() =>
    (window as Window & { __resumeNewEmbed?: () => void }).__resumeNewEmbed?.()
  );
  await expect(page.locator('.viewer-last-good-frame')).toHaveCount(0);
  await expect(page.locator('kicanvas-embed')).toHaveCount(1);
  await expect(page.locator('#viewer-status')).toContainText(
    'Interactive renderer loaded:'
  );
});

test('failure during the one-context swap retains a correctly labeled old snapshot', async ({
  page
}) => {
  const source = readFixtureBase64('sample.kicad_pcb');
  await installVsCodeApiMock(page);
  await setViewerContent(page, {
    fileName: 'sample.kicad_pcb',
    fileType: 'board',
    base64: source
  });
  await expect(page.locator('#viewer-status')).toContainText(
    'Interactive renderer loaded:'
  );
  await page.evaluate(() => {
    const embed = customElements.get(
      'kicanvas-embed'
    ) as CustomElementConstructor & {
      prototype: HTMLElement & { fitToScreen: () => void };
    };
    const old = document.querySelector('kicanvas-embed');
    const original = embed.prototype.fitToScreen;
    embed.prototype.fitToScreen = function (this: HTMLElement) {
      if (this === old) return original.call(this);
      throw new Error('Simulated new renderer failure');
    };
  });
  await sendRefresh(page, source, 'board');
  await expect(page.locator('#viewer-status')).toContainText(
    /previous snapshot|old snapshot/i,
    {
      timeout: 15000
    }
  );
  await expect(page.locator('.viewer-last-good-frame')).toBeVisible();
  await expect(page.locator('#loading-overlay')).toBeHidden();
});

test('refreshes arriving as the old frame is captured do not leave stale pixels', async ({
  page
}) => {
  const source = readFixtureBase64('sample.kicad_pcb');
  await installVsCodeApiMock(page);
  await setViewerContent(page, {
    fileName: 'sample.kicad_pcb',
    fileType: 'board',
    base64: source
  });
  await expect(page.locator('#viewer-status')).toContainText(
    'Interactive renderer loaded:'
  );
  await page.evaluate((base64) => {
    const root = document.querySelector('main');
    if (!root) throw new Error('Missing viewer root');
    const monitor = new MutationObserver(() => {
      if (!document.querySelector('.viewer-last-good-frame')) return;
      monitor.disconnect();
      Object.assign(window, { __raceRefreshSent: true });
      window.postMessage(
        { type: 'refresh', payload: { base64, fileName: 'latest.kicad_pcb' } },
        '*'
      );
    });
    monitor.observe(root, { childList: true, subtree: true });
    window.postMessage(
      {
        type: 'refresh',
        payload: { base64, fileName: 'intermediate.kicad_pcb' }
      },
      '*'
    );
  }, source);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __raceRefreshSent?: boolean })
            .__raceRefreshSent ?? false
      )
    )
    .toBe(true);
  await expect(page.locator('#viewer-status')).toHaveText(
    'Interactive renderer loaded: latest.kicad_pcb',
    {
      timeout: 15000
    }
  );
  await expect(page.locator('.viewer-last-good-frame')).toHaveCount(0);
  await expect(page.locator('kicanvas-embed')).toHaveCount(1);
  await expect(page.locator('#loading-overlay')).toBeHidden();
});

test('an inactive editor skips the retained-frame path to avoid background GPU work', async ({
  page
}) => {
  const source = readFixtureBase64('sample.kicad_pcb');
  await installVsCodeApiMock(page);
  await setViewerContent(page, {
    fileName: 'sample.kicad_pcb',
    fileType: 'board',
    base64: source
  });
  await expect(page.locator('#viewer-status')).toContainText(
    'Interactive renderer loaded:'
  );
  await pausePreparation(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden'
    });
  });
  await sendRefresh(page, source, 'board');
  await expect.poll(() => workers(page)).toBe(1);
  await expect(page.locator('kicanvas-embed')).toHaveCount(0);
  await expect(page.locator('.viewer-last-good-frame')).toHaveCount(0);
  await expect(page.locator('#loading-overlay')).toBeVisible();
});

test('oversized refreshes avoid duplicating the renderer or reading back a full frame', async ({
  page
}) => {
  const source = readFixtureBase64('sample.kicad_pcb');
  const veryLargeSource = Buffer.from(
    Buffer.from(source, 'base64').toString('utf8') + ' '.repeat(1_800_000)
  ).toString('base64');
  expect(veryLargeSource.length).toBeGreaterThan(2 * 1024 * 1024);
  await installVsCodeApiMock(page);
  await setViewerContent(page, {
    fileName: 'sample.kicad_pcb',
    fileType: 'board',
    base64: source
  });
  await expect(page.locator('#viewer-status')).toContainText(
    'Interactive renderer loaded:'
  );
  await pausePreparation(page);
  await sendRefresh(page, veryLargeSource, 'board');
  await expect.poll(() => workers(page)).toBe(1);
  await expect(page.locator('kicanvas-embed')).toHaveCount(0);
  await expect(page.locator('.viewer-last-good-frame')).toHaveCount(0);
  await expect(page.locator('#loading-overlay')).toBeVisible();
});
