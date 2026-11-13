// Visual capture of every Hub page, for the design before/after comparison (docs/PLAN_DISENO.md §5).
//
// Usage: node --env-file=.env scripts/capture-pages.mjs <label> [baseUrl] [page,page,...]
//   label    folder under .design-captures/ (e.g. "antes", "fase-a")
//   baseUrl  where the app already runs (default http://localhost:4321, AUTH_PROVIDER=local)
//   pages    optional comma list of paths to capture instead of all of them
//
// Each page is shot at 1440, 1024 and 390 px wide, in light and dark. The theme is chosen with
// the browser's colour-scheme preference, which is what a person with no saved choice gets.
// Captures may show real ticket data: the folder is ignored by git and must stay out of the repo.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [label, base = 'http://localhost:4321', only] = process.argv.slice(2);
if (!label) {
  console.error('Usage: node --env-file=.env scripts/capture-pages.mjs <label> [baseUrl] [pages]');
  process.exit(1);
}
// The sign-in used here exists only in local development (AUTH_PROVIDER=local): never point this at a real site.
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) {
  console.error('capture-pages only runs against a local server');
  process.exit(1);
}
const LEADER = process.env.BOOTSTRAP_LEADER_EMAIL ?? 'lider@holafly.com';

const PAGES = [
  '/',
  '/resumen',
  '/tareas',
  '/sla',
  '/incumplimientos',
  '/capacidad',
  '/trimestres',
  '/aprendido',
  '/definiciones',
  '/estado',
  '/permisos',
];
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];
const THEMES = ['light', 'dark'];

/** `astro dev` overlays a toolbar on every page; it is not part of the product. */
const HIDE_DEV_TOOLBAR = 'astro-dev-toolbar { display: none !important; }';

const slug = (path) => (path === '/' ? 'inicio' : path.slice(1));
const wanted = only ? only.split(',') : PAGES;
const outDir = `.design-captures/${label}`;
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
let shots = 0;
const problems = [];

async function signIn(context) {
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.getByLabel('Correo de Holafly').fill(LEADER);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(`${base}/`);
  await page.close();
}

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport, colorScheme: theme });
    await signIn(context);
    for (const path of wanted) {
      const page = await context.newPage();
      const response = await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
      if (!response || response.status() >= 400) {
        problems.push(
          `${path} ${String(viewport.width)} ${theme}: HTTP ${String(response?.status())}`,
        );
      }
      await page.addStyleTag({ content: HIDE_DEV_TOOLBAR });
      await page.screenshot({
        path: `${outDir}/${slug(path)}-${String(viewport.width)}-${theme}.png`,
        fullPage: true,
      });
      shots += 1;
      await page.close();
    }
    await context.close();
  }
}

// The login page is public: no session.
for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport, colorScheme: theme });
    const page = await context.newPage();
    await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: HIDE_DEV_TOOLBAR });
    await page.screenshot({
      path: `${outDir}/login-${String(viewport.width)}-${theme}.png`,
      fullPage: true,
    });
    shots += 1;
    await context.close();
  }
}

await browser.close();
console.log(`${String(shots)} capturas en ${outDir}`);
if (problems.length > 0) {
  console.error(`Páginas con error:\n${problems.join('\n')}`);
  process.exit(1);
}
