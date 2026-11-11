import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getApp } from '@infrastructure/container';
import { clientIp, readForm } from './request-helpers';
import { notFoundResponse } from '../security/responses';
import { setSessionCookie } from '../security/session-cookie';

const loginForm = z.object({ email: z.string().max(254) });

/** Development login (AUTH_PROVIDER=local). Answers 404 when another provider is configured. */
export const POST: APIRoute = async (context) => {
  const app = await getApp();
  if (app.authProvider.kind !== 'direct') return notFoundResponse(context.url.pathname);

  const form = await readForm(context.request, loginForm);
  const identity = form ? await app.authProvider.authenticate(form.email) : null;
  if (!identity?.ok) return context.redirect('/login?error=1', 303);

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
