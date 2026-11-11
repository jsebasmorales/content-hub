// Post-deploy check of the security headers and the CSP that cannot be tested locally
// (docs/DECISIONES.md D-026). Usage: pnpm verify:deploy https://your-site.netlify.app
const base = process.argv[2];
if (!base?.startsWith('https://')) {
  console.error('Usage: pnpm verify:deploy https://<deployed-site>');
  process.exit(2);
}

const response = await fetch(new URL('/login', base), { redirect: 'manual' });
const html = await response.text();
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const header = (name) => response.headers.get(name) ?? '';
check(response.status === 200, `/login answered ${String(response.status)}, expected 200`);
check(
  header('content-security-policy').includes("frame-ancestors 'none'"),
  'CSP header: frame-ancestors',
);
check(header('strict-transport-security').includes('max-age=31536000'), 'HSTS header');
check(header('x-content-type-options') === 'nosniff', 'X-Content-Type-Options');
check(header('referrer-policy') === 'strict-origin-when-cross-origin', 'Referrer-Policy');
check(header('cross-origin-opener-policy') === 'same-origin', 'Cross-Origin-Opener-Policy');
check(header('cache-control').includes('private'), 'Cache-Control must be private');

const meta = html.match(/<meta[^>]*http-equiv="content-security-policy"[^>]*content="([^"]*)"/i);
check(Boolean(meta), 'Astro CSP <meta> tag is missing from the page');
if (meta?.[1]) {
  check(meta[1].includes('script-src'), 'CSP meta: script-src directive missing');
  check(meta[1].includes('style-src'), 'CSP meta: style-src directive missing');
  check(!meta[1].includes('unsafe-inline'), "CSP meta must not contain 'unsafe-inline'");
}
check(!/<style[\s>]/i.test(html) || Boolean(meta), 'Inline <style> without a CSP meta');

if (failures.length > 0) {
  console.error(`Deployment check FAILED (${String(failures.length)}):`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.warn('Deployment check passed: headers and CSP are in place.');
