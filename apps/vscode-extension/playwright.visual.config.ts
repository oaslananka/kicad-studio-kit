import { defineConfig } from '@playwright/test';

const PLAYWRIGHT_CHANNEL_ENV = 'KICADSTUDIO_PLAYWRIGHT_CHANNEL';
const VISUAL_MAX_DIFF_PIXEL_RATIO = 0.002;
const VISUAL_PIXELMATCH_THRESHOLD = 0.2;
const playwrightChannel = process.env[PLAYWRIGHT_CHANNEL_ENV];

export default defineConfig({
  testDir: './test/visual',
  timeout: 120000,
  expect: {
    timeout: 10000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: VISUAL_MAX_DIFF_PIXEL_RATIO,
      scale: 'css',
      threshold: VISUAL_PIXELMATCH_THRESHOLD,
      pathTemplate: '{testDir}/__screenshots__/{arg}{ext}'
    }
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    browserName: 'chromium',
    ...(playwrightChannel ? { channel: playwrightChannel } : {}),
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    reducedMotion: 'reduce'
  },
  projects: [
    {
      name: 'visual-dpr1',
      use: { deviceScaleFactor: 1 }
    },
    {
      name: 'visual-dpr2',
      use: { deviceScaleFactor: 2 }
    }
  ]
});
