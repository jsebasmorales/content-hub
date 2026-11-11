import { defineConfig, devices } from '@playwright/test';

const PORT = 4321;
const isCi = Boolean(process.env['CI']);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: isCi ? 'github' : 'list',
  use: { baseURL: `http://localhost:${String(PORT)}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm e2e:server',
    url: `http://localhost:${String(PORT)}`,
    reuseExistingServer: !isCi,
    timeout: 120_000,
  },
});
