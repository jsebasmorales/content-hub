import type { APIRoute } from 'astro';
import { getApp } from '@infrastructure/container';
import { notFoundResponse } from '../security/responses';
import { OAUTH_COOKIE_OPTIONS, OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE } from './oauth-cookies';

/** Starts the Atlassian login. Inactive (404) unless AUTH_PROVIDER=atlassian. */
export const GET: APIRoute = async (context) => {
  const app = await getApp();
  if (app.authProvider.kind !== 'redirect') return notFoundResponse(context.url.pathname);

  const start = app.authProvider.begin();
  context.cookies.set(OAUTH_STATE_COOKIE, start.state, OAUTH_COOKIE_OPTIONS);
  context.cookies.set(OAUTH_VERIFIER_COOKIE, start.codeVerifier, OAUTH_COOKIE_OPTIONS);
  return context.redirect(start.authorizationUrl, 303);
};
