import { expect, test, type Browser, type Page } from '@playwright/test';

const LEADER = 'lider@holafly.com';
const COLLABORATOR = 'ana@holafly.com';

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Correo de Holafly').fill(email);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/');
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL('/login');
}

async function inviteCollaborator(page: Page, email: string): Promise<void> {
  await page.goto('/permisos');
  await page.locator('#invite-email').fill(email);
  await page.locator('#invite-role').selectOption({ label: 'Colaborador' });
  await page.getByRole('button', { name: 'Enviar invitación' }).click();
  await expect(page.getByRole('status')).toContainText('Invitación registrada');
}

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

test.describe.configure({ mode: 'serial' });

test('visitors are sent to sign in, and APIs reveal nothing', async ({ page, request }) => {
  await page.goto('/permisos');
  await expect(page).toHaveURL('/login');
  expect((await request.get('/api/admin/users')).status()).toBe(404);
  expect((await request.post('/api/admin/users')).status()).toBe(404);
});

test('people who were not invited cannot sign in', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Correo de Holafly').fill('stranger@holafly.com');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toContainText('No pudimos darte acceso');

  await page.getByLabel('Correo de Holafly').fill('someone@gmail.com');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toContainText('No pudimos darte acceso');
});

test('the Leader sees the administration entry and can invite', async ({ browser }) => {
  const page = await newPage(browser);
  await signIn(page, LEADER);
  await expect(page.getByRole('navigation', { name: 'Principal' })).toContainText('Permisos');
  await inviteCollaborator(page, COLLABORATOR);
  await expect(page.getByRole('cell', { name: COLLABORATOR, exact: true })).toBeVisible();
});

test('a collaborator gets no trace of the administration page', async ({ browser }) => {
  const page = await newPage(browser);
  await signIn(page, COLLABORATOR);

  // 1. Menu: no link, no lock icon, no "no access" text.
  const nav = page.getByRole('navigation', { name: 'Principal' });
  await expect(nav).toContainText('Resumen ejecutivo');
  await expect(nav).not.toContainText('Permisos');

  // 2. Page source: nothing that mentions the hidden section or its API.
  const source = await page.content();
  for (const trace of ['Permisos', '/permisos', 'admin.roles', '/api/admin', 'sin acceso']) {
    expect(source, `page source leaks "${trace}"`).not.toContain(trace);
  }

  // 3. Direct URL: 404, byte-for-byte identical to a page that does not exist.
  const hidden = await page.request.get('/permisos');
  const missing = await page.request.get('/pagina-que-no-existe');
  expect(hidden.status()).toBe(404);
  expect(missing.status()).toBe(404);
  expect(await hidden.text()).toBe(await missing.text());

  // 4. API: 404 with an empty body, never 403.
  const api = await page.request.get('/api/admin/users');
  expect(api.status()).toBe(404);
  expect(await api.text()).toBe('');
});

test('responses carry the mandatory security headers', async ({ browser }) => {
  const page = await newPage(browser);
  await signIn(page, COLLABORATOR);
  const headers = (await page.request.get('/')).headers();
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['strict-transport-security']).toContain('max-age=31536000');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['cross-origin-opener-policy']).toBe('same-origin');
  expect(headers['cache-control']).toContain('private');
});

test('cross-origin form posts are rejected', async ({ browser }) => {
  const page = await newPage(browser);
  await signIn(page, LEADER);
  const response = await page.request.post('/api/admin/users', {
    headers: { origin: 'https://evil.example' },
    form: { intent: 'invite', email: 'x@holafly.com' },
  });
  expect(response.status()).toBe(403);
});

test('signing out revokes the session on the server', async ({ browser }) => {
  const page = await newPage(browser);
  await signIn(page, LEADER);
  const cookies = await page.context().cookies();
  await signOut(page);

  // Replaying the old cookie must no longer work.
  const replay = await newPage(browser);
  await replay.context().addCookies(cookies);
  await replay.goto('/');
  await expect(replay).toHaveURL('/login');
});

test('deactivating a person closes their session at once', async ({ browser }) => {
  const leader = await newPage(browser);
  const collaborator = await newPage(browser);
  await signIn(leader, LEADER);
  await signIn(collaborator, COLLABORATOR);

  await leader.goto('/permisos');
  const row = leader.getByRole('row', { name: new RegExp(COLLABORATOR) });
  await row.getByRole('button', { name: 'Dar de baja' }).click();
  await expect(leader.getByRole('status')).toContainText('dada de baja');

  await collaborator.goto('/');
  await expect(collaborator).toHaveURL('/login');
});
