import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/webview',
  timeout: 60000,
  expect: {
    timeout: 10000
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    browserName: 'chromium',
    viewport: {
      width: 1280,
      height: 720
    },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  }
});
