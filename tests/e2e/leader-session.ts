import { existsSync } from 'node:fs';
import { expect, type Browser, type BrowserContext } from '@playwright/test';

/**
 * A browser context signed in as the Leader. Signing in is limited to 10 a minute per address and the
 * whole suite shares it, so the first call signs in and saves the session; the next ones reuse it.
 * Playwright empties `test-results` at the start of a run, so a session never outlives its server.
 */

const LEADER = 'lider@holafly.com';
const STATE = 'test-results/leader-session.json';

export async function leaderContext(
  browser: Browser,
  options: { javaScriptEnabled?: boolean } = {},
): Promise<BrowserContext> {
  if (existsSync(STATE)) return browser.newContext({ ...options, storageState: STATE });
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Correo de Holafly').fill(LEADER);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/');
  await context.storageState({ path: STATE });
  await page.close();
  return context;
}
