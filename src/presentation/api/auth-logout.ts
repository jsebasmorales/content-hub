import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getApp } from '@infrastructure/container';
import { clientIp, readForm } from './request-helpers';
import { clearSessionCookie, readSessionToken } from '../security/session-cookie';

const logoutForm = z.object({ _csrf: z.string().max(256) });

export const POST: APIRoute = async (context) => {
  const app = await getApp();
  const principal = context.locals.principal;
  const form = await readForm(context.request, logoutForm);
  if (!principal || !form || !app.csrf.verify(principal.sessionId, form._csrf)) {
    return new Response(null, { status: 404 });
  }

  const token = readSessionToken(context.cookies, app.settings.secureCookies);
  await app.signOut.execute(token, principal.user.id, clientIp(context));
  clearSessionCookie(context.cookies, app.settings.secureCookies);
  return context.redirect('/login', 303);
};
