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
  expect((await request.post('/api/sync')).status()).toBe(404);
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

test('the Leader sees the administration entry, can ask Jira for an update and can invite', async ({
  browser,
}) => {
  const page = await newPage(browser);
  await signIn(page, LEADER);
  await expect(page.getByRole('navigation', { name: 'Principal' })).toContainText('Permisos');

  // Layout: every section lives in the sidebar, which also holds the profile and sign-out; the top
  // bar holds only the sync state (its brand link and menu button exist for phones only).
  await expect(page.locator('aside.sidebar').getByRole('link', { name: 'Tareas' })).toBeVisible();
  await expect(page.locator('header.topbar').getByRole('link')).toHaveCount(0);
  await expect(page.locator('aside.sidebar')).toContainText(LEADER);
  await expect(
    page.locator('aside.sidebar').getByRole('button', { name: 'Cerrar sesión' }),
  ).toBeVisible();

  // Status: the Leader reads how the sync is going and how far to trust the data.
  await expect(page.locator('aside.sidebar').getByRole('link', { name: 'Estado' })).toBeVisible();
  await page.goto('/estado');
  await expect(page.getByRole('heading', { name: 'Estado', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Calidad del dato' })).toBeVisible();

  // Time zone: each person sees dates in their own zone; a forged request changes nothing.
  await expect(page.locator('aside.sidebar')).toContainText('Colombia · Bogotá');
  await page.locator('button[popovertarget="user-menu"]').click();
  await page.getByLabel('Mostrar las horas en').selectOption({ label: 'España · Madrid' });
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.locator('aside.sidebar')).toContainText('España · Madrid');
  await page.request.post('/api/time-zone', { form: { _csrf: 'forged', zone: 'Asia/Bangkok' } });
  await page.goto('/estado');
  await expect(page.locator('aside.sidebar')).toContainText('España · Madrid');
  await expect(page.getByRole('columnheader', { name: 'Inicio (España · Madrid)' })).toBeVisible();

  // Lo aprendido: the Leader writes, every save is a version, and repeating it adds nothing.
  await expect(
    page.locator('aside.sidebar').getByRole('link', { name: 'Lo aprendido' }),
  ).toBeVisible();
  await page.goto('/aprendido');
  await expect(page.getByRole('heading', { name: 'Lo aprendido', level: 1 })).toBeVisible();
  await page.getByLabel('Conclusiones del trimestre').fill('El tiempo de respuesta mejoró.');
  await page
    .getByLabel('Foco del siguiente trimestre')
    .fill('Reducir los tickets sin responsable.');
  await page.getByRole('button', { name: 'Guardar nueva versión' }).click();
  await expect(page.getByRole('status')).toContainText('Guardado');
  await expect(page.getByLabel('Conclusiones del trimestre')).toHaveValue(
    'El tiempo de respuesta mejoró.',
  );
  await page.getByRole('button', { name: 'Guardar nueva versión' }).click();
  await expect(page.getByRole('status')).toContainText('No había cambios');

  // Theme: the choice is applied by the server, survives a reload and keeps the page's filters.
  await page.goto('/tareas?tipo=Edit');
  await page.locator('button[popovertarget="user-menu"]').click();
  await page.getByRole('button', { name: 'Tema oscuro' }).click();
  await expect(page).toHaveURL('/tareas?tipo=Edit');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('button[popovertarget="user-menu"]').click();
  await page.getByRole('button', { name: 'Tema claro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('button[popovertarget="user-menu"]').click();
  await page.getByRole('button', { name: 'Tema del dispositivo' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  await page.goto('/');

  // "Resincronizar": answers at once, and a second press within the minute is turned down.
  await expect(page.getByText('Todavía no hay datos de Jira.')).toBeVisible();
  await page.getByRole('button', { name: 'Resincronizar con Jira' }).click();
  await expect(page).toHaveURL(/\/\?sync=(started|running)$/);
  // Opening the page may already have started a refresh, which the button then reports as running.
  await expect(page.getByRole('status')).toContainText(
    /Pedimos la actualización|Ya hay una actualización en curso/,
  );
  await page.getByRole('button', { name: 'Resincronizar con Jira' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Espera un minuto' })).toBeVisible();

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

  // The task list is open to collaborators by default and shows its filters.
  await expect(nav).toContainText('Tareas');
  await page.getByRole('link', { name: 'Resumen', exact: true }).click();
  await expect(page).toHaveURL('/resumen');
  await expect(page.getByRole('heading', { name: 'Resumen', level: 1, exact: true })).toBeVisible();
  await expect(page.getByLabel('Tipo de solicitud')).toBeVisible();
  await page.getByRole('link', { name: 'Tareas' }).click();
  await expect(page).toHaveURL('/tareas');
  await expect(page.getByRole('heading', { name: 'Tareas' })).toBeVisible();
  await expect(page.getByLabel('Tipo de tarea')).toBeVisible();
  await expect(page.getByLabel('Estado actual')).toBeVisible();
  await expect(page.getByLabel('Solicitante')).toBeVisible();
  await expect(page.getByLabel('Asignado a')).toBeVisible();
  await expect(nav).toContainText('SLAs');
  await page.getByRole('link', { name: 'SLAs', exact: true }).click();
  await expect(page).toHaveURL('/sla');
  await expect(page.getByRole('heading', { name: 'SLAs', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'T4 2026' })).toBeVisible();
  await expect(page.getByLabel('Desde')).toBeVisible();
  await expect(nav).toContainText('SLAs incumplidos');
  await page.getByRole('link', { name: 'SLAs incumplidos' }).click();
  await expect(page).toHaveURL('/incumplimientos');
  await expect(page.getByRole('heading', { name: 'SLAs incumplidos', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Métrica')).toBeVisible();
  await expect(nav).toContainText('Capacidad');
  await page.getByRole('link', { name: 'Capacidad' }).click();
  await expect(page).toHaveURL('/capacidad');
  await expect(page.getByRole('heading', { name: 'Capacidad', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Cola actual/ })).toBeVisible();
  await expect(nav).toContainText('Trimestre a trimestre');
  await page.getByRole('link', { name: 'Trimestre a trimestre' }).click();
  await expect(page).toHaveURL('/trimestres');
  await expect(
    page.getByRole('heading', { name: 'Trimestre a trimestre', level: 1 }),
  ).toBeVisible();
  await page.goto('/');

  // 5. "Resincronizar" (Leader only by default): no button, no trace in the source, empty 404.
  await expect(page.getByRole('button', { name: 'Resincronizar con Jira' })).toHaveCount(0);
  await expect(nav).not.toContainText('Estado');
  await expect(nav).not.toContainText('Lo aprendido');
  const learned = await page.request.get('/aprendido');
  expect(learned.status()).toBe(404);
  expect(await learned.text()).toBe(await missing.text());
  const write = await page.request.post('/api/learned');
  expect(write.status()).toBe(404);
  expect(await write.text()).toBe('');
  // Definitions are for every role, but never link to a page this person cannot open.
  await page.getByRole('link', { name: 'Definiciones' }).click();
  await expect(page).toHaveURL('/definiciones');
  await expect(page.getByRole('heading', { name: 'Definiciones', level: 1 })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Fecha de corte y calidad del dato' }),
  ).toBeVisible();
  expect(await page.content()).not.toContain('href="/estado"');
  await page.goto('/');
  const status = await page.request.get('/estado');
  expect(status.status()).toBe(404);
  expect(await status.text()).toBe(await missing.text());
  for (const trace of ['Resincronizar', '/api/sync', 'action.sync', '/estado', '/aprendido']) {
    expect(source, `page source leaks "${trace}"`).not.toContain(trace);
  }
  // Even a crafted address shows the collaborator nothing about the button.
  await page.goto('/?sync=started');
  await expect(page.getByText('Pedimos la actualización')).toHaveCount(0);
  const sync = await page.request.post('/api/sync');
  expect(sync.status()).toBe(404);
  expect(await sync.text()).toBe('');
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
