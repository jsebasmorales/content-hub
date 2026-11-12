import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getApp } from '@infrastructure/container';
import { safeReturnTarget } from '../return-target';
import { THEME_CHOICES, writeTheme } from '../theme';
import { readForm } from './request-helpers';

const themeForm = z.object({
  _csrf: z.string().max(256),
  theme: z.enum(THEME_CHOICES),
  back: z.string().max(500).optional(),
});

/**
 * Changes how the Hub looks for this browser. It only stores a display preference, so any signed-in
 * person may use it; the token still protects it like every other form. A bad request changes
 * nothing and simply returns to the page.
 */
export const POST: APIRoute = async (context) => {
  const actor = context.locals.principal;
  if (!actor) return new Response(null, { status: 404 });

  const app = await getApp();
  const form = await readForm(context.request, themeForm);
  const target = safeReturnTarget(form?.back);
  if (form && app.csrf.verify(actor.sessionId, form._csrf)) {
    writeTheme(context.cookies, form.theme, app.settings.secureCookies);
  }
  return context.redirect(target, 303);
};
