import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getApp, type App } from '@infrastructure/container';
import type { Principal } from '@application/use-cases/resolve-session';
import type { AdminError } from '@application/use-cases/admin/shared';
import type { Result } from '@shared/result';
import { errorRedirect, okRedirect } from '../admin-messages';
import { clientIp, isChecked, readForm } from './request-helpers';

const common = { _csrf: z.string().max(256), confirmLeader: z.enum(['yes']).optional() };

const adminForm = z.discriminatedUnion('intent', [
  z.object({
    ...common,
    intent: z.literal('invite'),
    email: z.string().max(254),
    roleId: z.uuid(),
  }),
  z.object({ ...common, intent: z.literal('role'), userId: z.uuid(), roleId: z.uuid() }),
  z.object({
    ...common,
    intent: z.literal('status'),
    userId: z.uuid(),
    active: z.enum(['true', 'false']),
  }),
]);

type AdminForm = z.output<typeof adminForm>;

function run(app: App, actor: Principal, form: AdminForm, ip: string | null) {
  const confirmLeader = isChecked(form.confirmLeader);
  switch (form.intent) {
    case 'invite':
      return app.inviteUser.execute(actor, {
        email: form.email,
        roleId: form.roleId,
        confirmLeader,
        ip,
      });
    case 'role':
      return app.changeUserRole.execute(actor, {
        userId: form.userId,
        roleId: form.roleId,
        confirmLeader,
        ip,
      });
    case 'status':
      return app.setUserStatus.execute(actor, {
        userId: form.userId,
        active: form.active === 'true',
        ip,
      });
  }
}

const SUCCESS_CODE = {
  invite: 'invited',
  role: 'role-changed',
} as const;

function successRedirect(form: AdminForm): string {
  if (form.intent === 'status')
    return okRedirect(form.active === 'true' ? 'reactivated' : 'deactivated');
  return okRedirect(SUCCESS_CODE[form.intent]);
}

/** Single entry point for the three actions of /permisos; the form says which with `intent`. */
export const POST: APIRoute = async (context) => {
  const app = await getApp();
  const actor = context.locals.principal;
  if (!actor) return new Response(null, { status: 404 });

  const form = await readForm(context.request, adminForm);
  if (!form) return context.redirect(errorRedirect('invalid-request'), 303);
  if (!app.csrf.verify(actor.sessionId, form._csrf)) {
    return context.redirect(errorRedirect('invalid-token'), 303);
  }

  const result: Result<void, AdminError> = await run(app, actor, form, clientIp(context));
  return context.redirect(result.ok ? successRedirect(form) : errorRedirect(result.error), 303);
};
