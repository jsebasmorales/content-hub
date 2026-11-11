/**
 * Response headers required by SDD §11.2. The script/style rules of the Content Security
 * Policy come from Astro's built-in CSP (hash based, no unsafe-inline, see astro.config.mjs);
 * the directives a <meta> tag cannot express (frame-ancestors) are sent here as a header.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy':
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
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

export function applySecurityHeaders(headers: Headers): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', DEFAULT_CACHE_CONTROL);
  headers.set('Vary', 'Cookie');
}
