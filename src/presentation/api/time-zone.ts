import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getApp } from '@infrastructure/container';
import { safeReturnTarget } from '../return-target';
import { readForm } from './request-helpers';

const zoneForm = z.object({
  _csrf: z.string().max(256),
  zone: z.string().max(64),
  back: z.string().max(500).optional(),
});

/**
 * Changes the zone in which this person sees dates. It only affects how times are shown to them, so
 * any signed-in person may use it, on their own account. A bad request changes nothing and simply
 * returns to the page.
 */
export const POST: APIRoute = async (context) => {
  const actor = context.locals.principal;
  if (!actor) return new Response(null, { status: 404 });

  const app = await getApp();
  const form = await readForm(context.request, zoneForm);
  const target = safeReturnTarget(form?.back);
  if (form && app.csrf.verify(actor.sessionId, form._csrf)) {
    await app.setTimeZone.execute(actor, form.zone);
  }
  return context.redirect(target, 303);
};
