import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { leaderContext } from './leader-session';

/**
 * The filter with its progressive-enhancement script ON (D-081). global-filter.spec.ts runs the very
 * same form with the script switched off. The e2e database has no tickets, so each test gets a page
 * whose HTML is topped up with three request types, a previous year and a "today" in February.
 */

const TYPES = ['Edit', 'Blog', 'Push'];

const filterCard = (page: Page) =>
  page.getByRole('form', { name: 'Filtros del período y los tipos' });
const typesButton = (page: Page) => filterCard(page).locator('summary');
const typesBox = (page: Page) => filterCard(page).locator('details');
const typeChecks = (page: Page) => filterCard(page).locator('details input[name="tipos"]');
const selectAll = (page: Page) => filterCard(page).locator('[data-select-all] input');

test.describe.configure({ mode: 'serial', timeout: 90_000 });

let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  context = await leaderContext(browser);
  page = await context.newPage();
  await page.goto('/');
});

test.afterAll(async () => {
  await context.close();
});

/** Tops up the HTML of /resumen the way a real database would, before the script reads it. */
async function withData(target: Page): Promise<void> {
  await target.route(/\/resumen(\?.*)?$/, async (route) => {
    // The form's own request is answered with a redirect, which cannot be rebuilt here: pass it through.
    if (new URL(route.request().url()).searchParams.has('desde0')) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const checks = TYPES.map(
      (name) =>
        `<label class="gfilter-check"><input type="checkbox" name="tipos" value="${name}" checked /><span>${name}</span><span class="gfilter-count">1</span></label>`,
    ).join('');
    const html = (await response.text())
      .replace(
        /(<div class="gfilter-types-panel"[^>]*>\s*<label class="gfilter-check gfilter-all"[\s\S]*?<\/label>)[\s\S]*?(<\/div>)/,
        `$1${checks}$2`,
      )
      .replace(/(<span data-types-label[^>]*>)[^<]*/, '$1Todos seleccionados')
      .replace(/data-today="[^"]*"/, 'data-today="2026-02-10"')
      .replace(/(<select[^>]*name="anio"[^>]*>)/, '$1<option value="2025">2025</option>');
    await route.fulfill({ response, body: html });
  });
}

test.beforeEach(async () => {
  await context.clearCookies({ name: 'hub_filter' });
  await withData(page);
  await page.goto('/resumen');
});

test.afterEach(async () => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('the script is on: the page says so and the dropdown tells its state', async () => {
  await expect(page.locator('html')).toHaveClass(/gfilter-js/);
  await expect(typesButton(page)).toHaveAttribute('aria-expanded', 'false');
  await typesButton(page).click();
  await expect(typesButton(page)).toHaveAttribute('aria-expanded', 'true');
  await typesButton(page).click();
  await expect(typesButton(page)).toHaveAttribute('aria-expanded', 'false');
});

test('Esc closes the dropdown and the focus goes back to its button', async () => {
  await typesButton(page).click();
  await typeChecks(page).first().focus();
  await page.keyboard.press('Escape');
  await expect(typesBox(page)).not.toHaveAttribute('open', '');
  await expect(typesButton(page)).toBeFocused();
  await expect(typesButton(page)).toHaveAttribute('aria-expanded', 'false');
});

test('a click outside closes it', async () => {
  await typesButton(page).click();
  await expect(typesBox(page)).toHaveAttribute('open', '');
  await page.getByRole('heading', { name: 'Resumen', level: 1, exact: true }).click();
  await expect(typesBox(page)).not.toHaveAttribute('open', '');
});

test('tabbing out of the panel closes it, and tabbing inside does not', async () => {
  await typesButton(page).click();
  await typeChecks(page).first().focus();
  await page.keyboard.press('Tab');
  await expect(typesBox(page)).toHaveAttribute('open', '');
  await typeChecks(page).last().focus();
  await page.keyboard.press('Tab');
  await expect(typesBox(page)).not.toHaveAttribute('open', '');
});

test('only one dropdown is open at a time', async () => {
  await page.evaluate(() => {
    const first = document.querySelector('details.gfilter-types');
    if (!(first instanceof HTMLDetailsElement)) throw new Error('no dropdown');
    const other = first.cloneNode(true) as HTMLDetailsElement;
    other.id = 'other-dropdown';
    other.open = true;
    first.after(other);
  });
  await typesButton(page).first().click();
  await expect(typesBox(page).first()).toHaveAttribute('open', '');
  await expect(page.locator('#other-dropdown')).not.toHaveAttribute('open', '');
});

test('the last type cannot be unchecked, and a short notice says why', async () => {
  const checks = typeChecks(page);
  await typesButton(page).click();
  await checks.nth(0).uncheck();
  await checks.nth(1).uncheck();
  await expect(page.locator('[data-types-hint]')).toHaveText('');
  await checks.nth(2).click();
  await expect(checks.nth(2)).toBeChecked();
  await expect(page.locator('[data-types-hint]')).toHaveText(
    'Debe quedar al menos un tipo de solicitud.',
  );
  // Choosing another type clears the notice.
  await checks.nth(0).check();
  await expect(page.locator('[data-types-hint]')).toHaveText('');
});

test('the button label follows the choice at once', async () => {
  const label = filterCard(page).locator('[data-types-label]');
  await expect(label).toHaveText('Todos seleccionados');
  await typesButton(page).click();
  await typeChecks(page).nth(0).uncheck();
  await expect(label).toHaveText('2 seleccionados');
  await typeChecks(page).nth(1).uncheck();
  await expect(label).toHaveText('1 seleccionado');
  await typeChecks(page).nth(0).check();
  await typeChecks(page).nth(1).check();
  await expect(label).toHaveText('Todos seleccionados');
});

test('a click anywhere on the date field asks the browser for the calendar', async () => {
  await page.evaluate(() => {
    const w = window as unknown as { picked: string[] };
    w.picked = [];
    HTMLInputElement.prototype.showPicker = function (this: HTMLInputElement) {
      w.picked.push(this.name);
    };
  });
  const range = filterCard(page).getByRole('group', { name: 'Rango de fechas' });
  const picked = () => page.evaluate(() => (window as unknown as { picked: string[] }).picked);

  await filterCard(page).getByLabel('Desde').click();
  expect(await picked()).toEqual(['desde']);
  await filterCard(page).getByLabel('Hasta (incluido)').click();
  expect(await picked()).toEqual(['desde', 'hasta']);
  // The border at the far right and the "30 d" label belong to the field too: nearest date wins.
  const box = await range.boundingBox();
  if (!box) throw new Error('the field has no box');
  await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2);
  await page.mouse.click(box.x + 2, box.y + box.height / 2);
  expect((await picked()).slice(2)).toEqual(['hasta', 'desde']);
});

test('the dates can still be typed by hand, and a refusing browser is not an error', async () => {
  await page.evaluate(() => {
    HTMLInputElement.prototype.showPicker = () => {
      throw new DOMException('no user gesture', 'NotAllowedError');
    };
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const from = filterCard(page).getByLabel('Desde');
  await from.click();
  await from.fill('2026-01-05');
  await filterCard(page).getByLabel('Hasta (incluido)').fill('2026-02-03');
  await filterCard(page).getByRole('button', { name: 'Aplicar' }).click();
  await expect(page).toHaveURL(/desde=2026-01-05&hasta=2026-02-03/);
  expect(errors).toEqual([]);
});

test('quarters that have not started are disabled for their year, and re-enabled for another', async () => {
  const chip = (name: string) => filterCard(page).getByLabel(name, { exact: true });
  // "Today" is 10 Feb 2026 on this page: only T1 of 2026 has started.
  await expect(chip('T1')).toBeEnabled();
  for (const name of ['T2', 'T3', 'T4']) await expect(chip(name)).toBeDisabled();
  await expect(chip('30 días')).toBeEnabled();

  await filterCard(page).getByLabel('Año de los trimestres').selectOption('2025');
  for (const name of ['T1', 'T2', 'T3', 'T4']) await expect(chip(name)).toBeEnabled();

  // A checked quarter that becomes unavailable hands the choice to the latest one that is left.
  await chip('T4').check();
  await filterCard(page).getByLabel('Año de los trimestres').selectOption('2026');
  await expect(chip('T4')).toBeDisabled();
  await expect(chip('T1')).toBeChecked();
});

test('applying still works with the script on', async () => {
  await filterCard(page).getByLabel('Año de los trimestres').selectOption('2025');
  await filterCard(page).getByLabel('T3', { exact: true }).check();
  await filterCard(page).getByRole('button', { name: 'Aplicar' }).click();
  await expect(page).toHaveURL(/\/resumen\?periodo=T3&anio=2025/);
});

test('"Seleccionar todos": a tick with all, a dash with some, and it never leaves none', async () => {
  const all = selectAll(page);
  const checks = typeChecks(page);
  const dash = () => all.evaluate((input) => (input as HTMLInputElement).indeterminate);
  await typesButton(page).click();
  await expect(all).toBeVisible();
  await expect(all).toBeChecked();
  expect(await dash()).toBe(false);

  await checks.nth(0).uncheck();
  await expect(all).not.toBeChecked();
  expect(await dash()).toBe(true);

  await all.check();
  for (const i of [0, 1, 2]) await expect(checks.nth(i)).toBeChecked();
  expect(await dash()).toBe(false);

  // With everything chosen, clicking it again does nothing: one type must always be left.
  await all.click();
  await expect(all).toBeChecked();
  for (const i of [0, 1, 2]) await expect(checks.nth(i)).toBeChecked();
  // It has no name, so it never travels with the form.
  expect(await all.getAttribute('name')).toBeNull();
  await expect(filterCard(page).locator('[data-types-label]')).toHaveText('Todos seleccionados');
});

test('the dropdown panel is wide and tall enough: no name on more than one line, no scroll bar', async () => {
  await typesButton(page).click();
  const panel = filterCard(page).locator('.gfilter-types-panel');
  const box = await panel.evaluate((el) => ({
    width: el.getBoundingClientRect().width,
    scrolls: el.scrollHeight > el.clientHeight,
    first: el.querySelector('.gfilter-all')?.getBoundingClientRect().top ?? 0,
    top: el.getBoundingClientRect().top,
  }));
  expect(box.width).toBeGreaterThanOrEqual(340);
  expect(box.scrolls).toBe(false);
  // The first row sits fully inside the panel, below its edge.
  expect(box.first).toBeGreaterThanOrEqual(box.top);
});
