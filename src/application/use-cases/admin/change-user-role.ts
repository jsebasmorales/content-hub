import { validateLeaderChange } from '@domain/access/user-rules';
import { err, ok, type Result } from '@shared/result';
import type { Principal } from '../resolve-session';
import { isAdmin, needsLeaderConfirmation, type AdminDeps, type AdminError } from './shared';

export interface ChangeUserRoleInput {
  readonly userId: string;
  readonly roleId: string;
  readonly confirmLeader: boolean;
  readonly ip: string | null;
}

/**
 * Assigns a different role to a user. The system always keeps at least one active Leader and
 * a Leader cannot demote themselves (SDD §10.2).
 */
export class ChangeUserRole {
  constructor(private readonly deps: AdminDeps) {}

  async execute(actor: Principal, input: ChangeUserRoleInput): Promise<Result<void, AdminError>> {
    if (!isAdmin(actor)) return err('forbidden');
    const { users, roles } = this.deps;
    const target = await users.findById(input.userId);
    if (!target) return err('unknown-user');
    const nextRole = await roles.findById(input.roleId);
    if (!nextRole) return err('unknown-role');
    if (needsLeaderConfirmation(nextRole, input.confirmLeader)) return err('confirmation-required');

    const rule = validateLeaderChange({
      currentRole: target.role,
      nextRole,
      activeLeaderCount: await users.countActiveLeaders(),
      isSelf: target.id === actor.user.id,
    });
    if (!rule.ok) return err(rule.error);

    await users.setRole(target.id, nextRole.id);
    await this.deps.audit.record({
      actorId: actor.user.id,
      action: 'user.role_changed',
      targetType: 'user',
      targetId: target.id,
      before: { role: target.role.name },
      after: { role: nextRole.name },
      ip: input.ip,
    });
    return ok(undefined);
  }
}
