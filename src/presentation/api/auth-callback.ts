import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getApp } from '@infrastructure/container';
import { clientIp } from './request-helpers';
import { OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE } from './oauth-cookies';
import { notFoundResponse } from '../security/responses';
import { setSessionCookie } from '../security/session-cookie';

const callbackQuery = z.object({
  code: z.string().min(1).max(2048),
  state: z.string().min(1).max(256),
});

/** Finishes the Atlassian login: checks `state`, exchanges the code, applies the invitation list. */
export const GET: APIRoute = async (context) => {
  const app = await getApp();
  if (app.authProvider.kind !== 'redirect') return notFoundResponse(context.url.pathname);

  const query = callbackQuery.safeParse(Object.fromEntries(context.url.searchParams));
  const expectedState = context.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const codeVerifier = context.cookies.get(OAUTH_VERIFIER_COOKIE)?.value;
  context.cookies.delete(OAUTH_STATE_COOKIE, { path: '/api/auth' });
  context.cookies.delete(OAUTH_VERIFIER_COOKIE, { path: '/api/auth' });
  if (!query.success || !expectedState || !codeVerifier || query.data.state !== expectedState) {
    return context.redirect('/login?error=1', 303);
  }

  const identity = await app.authProvider.complete({ code: query.data.code, codeVerifier });
  if (!identity.ok) return context.redirect('/login?error=1', 303);

  const result = await app.signIn.execute({
    identity: identity.value,
    ip: clientIp(context),
    userAgent: context.request.headers.get('user-agent'),
  });
  if (!result.ok) return context.redirect('/login?error=1', 303);

  setSessionCookie(
    context.cookies,
    app.settings.secureCookies,
    result.value.token,
    result.value.expiresAt,
  );
  return context.redirect('/', 303);
};
