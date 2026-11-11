import { validateLeaderChange } from '@domain/access/user-rules';
import { err, ok, type Result } from '@shared/result';
import type { Principal } from '../resolve-session';
import { isAdmin, type AdminDeps, type AdminError } from './shared';

export interface SetUserStatusInput {
  readonly userId: string;
  readonly active: boolean;
  readonly ip: string | null;
}

/**
 * Deactivates (revoking every session at once) or reactivates a person.
 * Reactivated people go back to "invitado" and sign in again (SDD §10.2, §11.2).
 * Runs under the leader lock so the "last Leader" check cannot race (D-031).
 */
export class SetUserStatus {
  constructor(private readonly deps: AdminDeps) {}

  async execute(actor: Principal, input: SetUserStatusInput): Promise<Result<void, AdminError>> {
    if (!isAdmin(actor)) return err('forbidden');
    return this.deps.unitOfWork.withLeaderLock(async ({ users, sessions, audit }) => {
      const target = await users.findById(input.userId);
      if (!target) return err('unknown-user');

      if (!input.active) {
        const rule = validateLeaderChange({
          currentRole: target.role,
          nextRole: null,
          activeLeaderCount: await users.countActiveLeaders(),
          isSelf: target.id === actor.user.id,
        });
        if (!rule.ok) return err(rule.error);
      }

      const next = input.active ? 'invitado' : 'desactivado';
      await users.setStatus(target.id, next);
      if (!input.active) await sessions.deleteAllForUser(target.id);
      await audit.record({
        actorId: actor.user.id,
        action: input.active ? 'user.reactivated' : 'user.deactivated',
        targetType: 'user',
        targetId: target.id,
        before: { status: target.status },
        after: { status: next },
        ip: input.ip,
      });
      return ok(undefined);
    });
  }
}
