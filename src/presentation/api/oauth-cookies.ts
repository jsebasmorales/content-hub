import type { AstroCookieSetOptions } from 'astro';

/** Short-lived cookies that carry `state` and the PKCE verifier across the OAuth redirect. */
export const OAUTH_STATE_COOKIE = 'hub_oauth_state';
export const OAUTH_VERIFIER_COOKIE = 'hub_oauth_verifier';

export const OAUTH_COOKIE_OPTIONS: AstroCookieSetOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/api/auth',
  maxAge: 10 * 60,
};
