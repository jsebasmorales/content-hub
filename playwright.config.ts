import { defineConfig, devices } from '@playwright/test';

const PORT = 4321;
const isCi = Boolean(process.env['CI']);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCi,
  retries: 0,
  reporter: isCi ? 'github' : 'list',
  use: { baseURL: `http://localhost:${String(PORT)}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec astro dev --port ${String(PORT)}`,
    url: `http://localhost:${String(PORT)}/login`,
    // Always a fresh server: the tests assume an empty in-memory database.
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: 'pglite:memory',
      SESSION_SECRET: 'e2e-only-secret-e2e-only-secret-e2e-only-secret',
      ALLOWED_EMAIL_DOMAIN: 'holafly.com',
      BOOTSTRAP_LEADER_EMAIL: 'lider@holafly.com',
      PUBLIC_APP_URL: `http://localhost:${String(PORT)}`,
      AUTH_PROVIDER: 'local',
    },
  },
});
