// Performance gate (SDD §12, D-008): JavaScript budget + Lighthouse on every Hub page.
//
// Usage: pnpm perf [baseUrl] [leaderEmail]   (the app must already be running; defaults are
// http://localhost:4321 and lider@holafly.com, with AUTH_PROVIDER=local so the script can sign in)
//
// 1. JS budget: how many KB (gzip) of JavaScript each page downloads. The Hub is server-rendered
//    and ships none today, so any new script shows up here before it reaches a user.
// 2. Lighthouse (mobile, simulated slow 4G): scores and the SDD's LCP / CLS limits.
// Exit code 1 if any budget is broken, so CI fails.
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';

const BASE = process.argv[2] ?? 'http://localhost:4321';
const LEADER = process.argv[3] ?? 'lider@holafly.com';
const PORT = 9333;

/** Pages behind the login (all of them for a Leader) and the public one. */
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
];
const PUBLIC_PAGES = ['/login'];

const BUDGET = {
  jsKbGzip: 30, // SDD §12: dashboard pages
  performance: 0.9,
  accessibility: 0.95,
  bestPractices: 0.9,
  lcpMs: 1500, // SDD §12: LCP on simulated 4G
  cls: 0.05,
};

const failures = [];
const fail = (page, text) => failures.push(`${page}: ${text}`);

async function signIn(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Correo de Holafly').fill(LEADER);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(`${BASE}/`);
  await page.close();
}

/**
 * Scripts that only exist under `astro dev` (Vite client, dev toolbar, CSS served as modules).
 * They are not part of what users download, so they must not count against the budget.
 */
const DEV_ONLY = /\/@vite\/|\/@id\/|\/node_modules\/|\/src\/|\/\.astro\/|\/_astro\/.*\.css/;

/** KB of gzip JavaScript a page downloads, counting scripts only. */
async function jsKb(context, path) {
  const page = await context.newPage();
  let bytes = 0;
  const pending = [];
  page.on('response', (response) => {
    if (response.request().resourceType() !== 'script') return;
    if (DEV_ONLY.test(new URL(response.url()).pathname)) return;
    pending.push(response.body().then((body) => (bytes += gzipSync(body).length)));
  });
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await Promise.all(pending);
  await page.close();
  return bytes / 1024;
}

async function audit(path, cookieHeader) {
  const flags = {
    port: PORT,
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['performance', 'accessibility', 'best-practices'],
    disableStorageReset: true,
    ...(cookieHeader ? { extraHeaders: { Cookie: cookieHeader } } : {}),
  };
  const result = await lighthouse(`${BASE}${path}`, flags);
  const lhr = result?.lhr;
  if (!lhr) throw new Error(`Lighthouse returned nothing for ${path}`);
  const score = (id) => lhr.categories[id]?.score ?? 0;
  // Name what is not perfect, so a failing CI log says what to fix and not just a number.
  const imperfect = Object.values(lhr.audits)
    .filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode === 'binary')
    .map((a) => a.id);
  if (imperfect.length > 0) console.warn(`  ${path} — not perfect: ${imperfect.join(', ')}`);
  for (const id of imperfect) {
    const items = lhr.audits[id]?.details?.items ?? [];
    for (const item of items.slice(0, 3)) {
      const snippet = item.node?.snippet ?? item.node?.selector;
      if (snippet) console.warn(`    ${id}: ${snippet.slice(0, 140)}`);
    }
  }
  return {
    performance: score('performance'),
    accessibility: score('accessibility'),
    bestPractices: score('best-practices'),
    lcpMs: lhr.audits['largest-contentful-paint']?.numericValue ?? 0,
    cls: lhr.audits['cumulative-layout-shift']?.numericValue ?? 0,
  };
}

function judge(path, kb, lh) {
  if (kb > BUDGET.jsKbGzip) fail(path, `${kb.toFixed(1)} KB of JS (limit ${BUDGET.jsKbGzip})`);
  if (lh.performance < BUDGET.performance) fail(path, `performance ${lh.performance}`);
  if (lh.accessibility < BUDGET.accessibility) fail(path, `accessibility ${lh.accessibility}`);
  if (lh.bestPractices < BUDGET.bestPractices) fail(path, `best practices ${lh.bestPractices}`);
  if (lh.lcpMs > BUDGET.lcpMs) fail(path, `LCP ${Math.round(lh.lcpMs)} ms (limit ${BUDGET.lcpMs})`);
  if (lh.cls > BUDGET.cls) fail(path, `CLS ${lh.cls.toFixed(3)} (limit ${BUDGET.cls})`);
}

function line(path, kb, lh) {
  const pct = (n) => String(Math.round(n * 100)).padStart(3);
  return (
    `${path.padEnd(18)} JS ${kb.toFixed(1).padStart(5)} KB | perf ${pct(lh.performance)} ` +
    `a11y ${pct(lh.accessibility)} best ${pct(lh.bestPractices)} | ` +
    `LCP ${String(Math.round(lh.lcpMs)).padStart(5)} ms CLS ${lh.cls.toFixed(3)}`
  );
}

const browser = await chromium.launch({ args: [`--remote-debugging-port=${PORT}`] });
try {
  const context = await browser.newContext();
  // The public page first: no session yet.
  for (const path of PUBLIC_PAGES) {
    const kb = await jsKb(context, path);
    const lh = await audit(path);
    console.warn(line(path, kb, lh));
    judge(path, kb, lh);
  }
  await signIn(context);
  const cookies = await context.cookies(BASE);
  const header = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  for (const path of PAGES) {
    const kb = await jsKb(context, path);
    const lh = await audit(path, header);
    console.warn(line(path, kb, lh));
    judge(path, kb, lh);
  }
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(`\n✖ ${failures.length} budget(s) broken:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.warn('\n✔ All pages are inside the performance budget.');
