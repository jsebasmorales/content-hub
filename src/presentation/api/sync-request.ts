import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getApp, getJiraApp, type JiraApp } from '@infrastructure/container';
import { safeReturnPath, syncRedirect, type SyncMessageCode } from '../sync-messages';
import { clientIp, readForm } from './request-helpers';

const syncForm = z.object({ _csrf: z.string().max(256), back: z.string().max(64).optional() });

/** One manual sync per person per minute (D-035). */
const MANUAL_SYNC_LIMIT = { limit: 1, windowMs: 60_000 } as const;

type Outcome = Awaited<ReturnType<JiraApp['requestSync']['manual']>>;

/** The button only ever hears "started", "already running" or "could not start". */
function messageFor(outcome: Outcome): SyncMessageCode {
  if (outcome.requested) return 'started';
  return outcome.reason === 'running' ? 'running' : 'unavailable';
}

/**
 * The "Resincronizar con Jira" button. Only people with `action.sync` get here (the route
 * registry answers everyone else with an empty 404). It never waits for Jira: it asks the
 * background function to start and returns at once.
 */
export const POST: APIRoute = async (context) => {
  const actor = context.locals.principal;
  if (!actor) return new Response(null, { status: 404 });

  const form = await readForm(context.request, syncForm);
  const back = safeReturnPath(form?.back);
  if (!form) return context.redirect(syncRedirect(back, 'invalid-request'), 303);

  const app = await getApp();
  // Checked before the limit so a forged request cannot use up the real person's minute.
  if (!app.csrf.verify(actor.sessionId, form._csrf)) {
    return context.redirect(syncRedirect(back, 'invalid-token'), 303);
  }

  const limit = await app.rateLimiter.hit(`user:${actor.user.id}:/api/sync`, MANUAL_SYNC_LIMIT);
  if (!limit.allowed) return context.redirect(syncRedirect(back, 'wait'), 303);

  const outcome = await (await getJiraApp()).requestSync.manual();
  await app.audit.record({
    actorId: actor.user.id,
    action: 'sync.manual_requested',
    targetType: 'sync',
    after: { requested: outcome.requested },
    ip: clientIp(context),
  });
  return context.redirect(syncRedirect(back, messageFor(outcome)), 303);
};
