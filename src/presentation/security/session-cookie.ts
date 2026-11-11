import type { AstroCookies } from 'astro';

/** Cookie name and flags (docs/DECISIONES.md D-022). The cookie holds only an opaque token. */
export function sessionCookieName(secure: boolean): string {
  return secure ? '__Host-hub_session' : 'hub_session';
}

export function readSessionToken(cookies: AstroCookies, secure: boolean): string | undefined {
  return cookies.get(sessionCookieName(secure))?.value;
}

export function setSessionCookie(
  cookies: AstroCookies,
  secure: boolean,
  token: string,
  expiresAt: Date,
): void {
  cookies.set(sessionCookieName(secure), token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(cookies: AstroCookies, secure: boolean): void {
  cookies.delete(sessionCookieName(secure), { path: '/' });
}
