import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/marketplace',
  timeout: 240000,
  expect: { timeout: 30000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off'
  }
});
