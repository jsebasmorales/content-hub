import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { leaderContext } from './leader-session';

/**
 * The global filter (docs/PLAN_FILTROS.md): it lives on four pages, travels in the address, is
 * remembered for the session and works with the progressive-enhancement script switched OFF
 * (global-filter-js.spec.ts covers it switched on). One sign-in for the whole file: logging in is
 * limited to 10 a minute.
 */

const FILTERED = ['/', '/resumen', '/sla', '/incumplimientos'];
const UNFILTERED = [
  '/tareas',
  '/capacidad',
  '/trimestres',
  '/aprendido',
  '/definiciones',
  '/estado',
  '/permisos',
];

const filterCard = (page: Page) =>
  page.getByRole('form', { name: 'Filtros del período y los tipos' });

// The first visit to each page compiles it under `astro dev`, so a step can take a while.
test.describe.configure({ mode: 'serial', timeout: 90_000 });

let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  // No script: everything the filter does must work from the plain form alone (D-078, D-081).
  context = await leaderContext(browser, { javaScriptEnabled: false });
  page = await context.newPage();
  await page.goto('/');
});

test.afterAll(async () => {
  await context.close();
});

/** Each test starts as a new session would: with no filter remembered. */
test.beforeEach(async () => {
  await context.clearCookies({ name: 'hub_filter' });
});

async function apply(): Promise<void> {
  await filterCard(page).getByRole('button', { name: 'Aplicar' }).click();
}

test('the filter is on the four report pages and on no other', async () => {
  for (const path of FILTERED) {
    await page.goto(path);
    await expect(filterCard(page), path).toBeVisible();
  }
  for (const path of UNFILTERED) {
    await page.goto(path);
    await expect(filterCard(page), path).toHaveCount(0);
  }
});

test('it opens on the last 30 days with nothing active', async () => {
  await page.goto('/resumen');
  const card = filterCard(page);
  await expect(card.getByLabel('30 días')).toBeChecked();
  await expect(card.getByText('activo')).toHaveCount(0);
  await expect(card.getByText('30 d', { exact: true })).toBeVisible();
  // The comparison switch does not exist until every page can draw it.
  await expect(card.getByRole('switch')).toHaveCount(0);
});

test('a quarter is applied, shown in the address and counted as active', async () => {
  await page.goto('/resumen');
  await filterCard(page).getByLabel('T3', { exact: true }).check();
  await filterCard(page).getByLabel('Año de los trimestres').selectOption('2026');
  await apply();
  await expect(page).toHaveURL(/\/resumen\?periodo=T3&anio=2026$/);
  await expect(filterCard(page).getByText('1 activo')).toBeVisible();
  await expect(page.getByRole('heading', { name: /T3 2026/ })).toBeVisible();
});

test('typed dates make a custom range, and it is kept when applied again untouched', async () => {
  await page.goto('/sla');
  const card = filterCard(page);
  await card.getByLabel('Desde').fill('2026-01-05');
  await card.getByLabel('Hasta (incluido)').fill('2026-02-10');
  await apply();
  await expect(page).toHaveURL(/\/sla\?desde=2026-01-05&hasta=2026-02-10$/);
  await expect(card.getByText('37 d', { exact: true })).toBeVisible();
  // No chip is checked for a custom range; applying without touching anything must not reset it.
  await apply();
  await expect(page).toHaveURL(/desde=2026-01-05&hasta=2026-02-10/);
});

test('the choice follows the person across the four pages and the menu', async () => {
  await page.goto('/resumen?periodo=T2&anio=2026');
  const menu = page.getByRole('navigation', { name: 'Principal' });
  // A menu link to another filtered page carries the filter...
  await expect(menu.getByRole('link', { name: 'SLAs', exact: true })).toHaveAttribute(
    'href',
    '/sla?periodo=T2&anio=2026',
  );
  // ...a link to any other page does not.
  await expect(menu.getByRole('link', { name: 'Tareas' })).toHaveAttribute('href', '/tareas');

  await page.goto('/tareas');
  await menu.getByRole('link', { name: 'SLAs incumplidos' }).click();
  // The address was bare, so the session cookie brought the choice back.
  await expect(filterCard(page).getByText('1 activo')).toBeVisible();
  await expect(filterCard(page).getByLabel('T2', { exact: true })).toBeChecked();
});

test('"Restablecer" goes back to the defaults and forgets the choice', async () => {
  await page.goto('/sla?periodo=T1&anio=2026');
  await expect(filterCard(page).getByText('1 activo')).toBeVisible();
  await filterCard(page).getByRole('link', { name: 'Restablecer' }).click();
  await expect(page).toHaveURL('/sla');
  await expect(filterCard(page).getByLabel('30 días')).toBeChecked();
  await page.goto('/resumen');
  await expect(filterCard(page).getByText('activo')).toHaveCount(0);
});

test('a new session, with nothing remembered, starts from the defaults', async () => {
  await page.goto('/resumen?periodo=T1&anio=2026');
  await expect(filterCard(page).getByText('1 activo')).toBeVisible();
  await context.clearCookies({ name: 'hub_filter' });
  await page.goto('/resumen');
  await expect(filterCard(page).getByText('activo')).toHaveCount(0);
});

test('an address that cannot be read falls back to the default and says so', async () => {
  await page.goto('/resumen?desde=ayer&hasta=hoy');
  await expect(filterCard(page).getByRole('alert')).toContainText(
    'No pudimos usar el período pedido',
  );
  await expect(filterCard(page).getByLabel('30 días')).toBeChecked();
});

test('a forged cookie is ignored', async () => {
  await context.addCookies([
    { name: 'hub_filter', value: 'periodo=T9&anio=99999&tipos=x', domain: 'localhost', path: '/' },
  ]);
  await page.goto('/resumen');
  await expect(filterCard(page).getByLabel('30 días')).toBeChecked();
  await expect(filterCard(page).getByRole('alert')).toContainText(
    'No pudimos usar el período pedido',
  );
});
