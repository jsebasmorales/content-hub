/**
 * Response headers required by SDD §11.2. The script/style rules of the Content Security
 * Policy come from Astro's built-in CSP (hash based, no unsafe-inline, see astro.config.mjs);
 * the directives a <meta> tag cannot express (frame-ancestors) are sent here as a header.
 */
const BASE_CSP = "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': BASE_CSP,
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

/**
 * Pages depend on who is asking, so they are never stored by shared caches
 * (SDD §12: `private`, never `public`). Handlers may set a more specific value.
 */
const DEFAULT_CACHE_CONTROL = 'private, no-store';

const directiveName = (directive: string): string =>
  directive.trim().split(/\s+/)[0]?.toLowerCase() ?? '';

/**
 * Astro sends the hash-based `script-src`/`style-src` of on-demand pages in this same header.
 * Replacing it would silently drop them, so we keep every directive Astro already sent and only
 * add the ones it did not (a browser ignores a repeated directive after the first).
 */
export function mergeCsp(existing: string | null): string {
  if (!existing) return BASE_CSP;
  const directives = existing
    .split(';')
    .map((directive) => directive.trim())
    .filter(Boolean);
  const present = new Set(directives.map(directiveName));
  for (const directive of BASE_CSP.split(';').map((d) => d.trim())) {
    if (!present.has(directiveName(directive))) directives.push(directive);
  }
  return directives.join('; ');
}

export function applySecurityHeaders(headers: Headers): void {
  const existingCsp = headers.get('Content-Security-Policy');
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  headers.set('Content-Security-Policy', mergeCsp(existingCsp));
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', DEFAULT_CACHE_CONTROL);
  headers.set('Vary', 'Cookie');
}
