import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getApp, getLearnedApp } from '@infrastructure/container';
import { parseQuarterParam, quarterParam } from '@domain/jira/report-period';
import { LEARNED_FIELD_MAX } from '@domain/learned/learned';
import type {
  SaveLearnedError,
  SaveLearnedOutcome,
} from '@application/use-cases/learned/save-learned';
import { learnedRedirect, type LearnedMessageCode } from '../learned-messages';
import { clientIp, readForm } from './request-helpers';

// The box limit is enforced by the domain with a clear message; this cap only stops absurd bodies.
const BODY_CAP = LEARNED_FIELD_MAX * 2;
const learnedForm = z.object({
  _csrf: z.string().max(256),
  trimestre: z.string().max(20),
  conclusions: z.string().max(BODY_CAP),
  nextFocus: z.string().max(BODY_CAP),
  notes: z.string().max(BODY_CAP),
});

const CODE: Readonly<Record<SaveLearnedOutcome | SaveLearnedError, LearnedMessageCode>> = {
  saved: 'saved',
  unchanged: 'unchanged',
  empty: 'empty',
  'too-long': 'too-long',
  'invalid-quarter': 'invalid-quarter',
  forbidden: 'invalid-request',
};

/**
 * Saves the Leader's text for a quarter as a new version. Only people with `action.learnedit` get
 * here (the route registry answers everyone else with an empty 404), and the use case checks it
 * again. The token is verified first so a forged request cannot write anything.
 */
export const POST: APIRoute = async (context) => {
  const actor = context.locals.principal;
  if (!actor) return new Response(null, { status: 404 });

  const form = await readForm(context.request, learnedForm);
  if (!form) return context.redirect(learnedRedirect(null, 'invalid-request'), 303);
  const quarter = parseQuarterParam(form.trimestre);
  const back = quarter === null ? null : quarterParam(quarter);

  const app = await getApp();
  if (!app.csrf.verify(actor.sessionId, form._csrf)) {
    return context.redirect(learnedRedirect(back, 'invalid-token'), 303);
  }

  const result = await (
    await getLearnedApp()
  ).saveLearned.execute(actor, {
    quarter,
    content: { conclusions: form.conclusions, nextFocus: form.nextFocus, notes: form.notes },
    ip: clientIp(context),
  });
  return context.redirect(
    learnedRedirect(back, CODE[result.ok ? result.value : result.error]),
    303,
  );
};
