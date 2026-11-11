import { isAllowedEmail, normalizeEmail } from '@domain/access/user-rules';
import { err, ok, type Result } from '@shared/result';
import type { Principal } from '../resolve-session';
import { isAdmin, needsLeaderConfirmation, type AdminDeps, type AdminError } from './shared';

export interface InviteUserInput {
  readonly email: string;
  readonly roleId: string;
  /** Required when the invited role is Líder. */
  readonly confirmLeader: boolean;
  readonly ip: string | null;
}

/** Adds an @holafly.com address to the invitation list with a role (SDD §10.2). */
export class InviteUser {
  constructor(private readonly deps: AdminDeps) {}

  async execute(actor: Principal, input: InviteUserInput): Promise<Result<void, AdminError>> {
    if (!isAdmin(actor)) return err('forbidden');
    const email = normalizeEmail(input.email);
    if (!isAllowedEmail(email, this.deps.allowedEmailDomain)) return err('invalid-email');
    const role = await this.deps.roles.findById(input.roleId);
    if (!role) return err('unknown-role');
    if (needsLeaderConfirmation(role, input.confirmLeader)) return err('confirmation-required');
    if (await this.deps.users.findByEmail(email)) return err('already-exists');

    const created = await this.deps.users.create({
      email,
      roleId: role.id,
      status: 'invitado',
      invitedBy: actor.user.id,
    });
    await this.deps.audit.record({
      actorId: actor.user.id,
      action: 'user.invited',
      targetType: 'user',
      targetId: created.id,
      after: { email, role: role.name },
      ip: input.ip,
    });
    return ok(undefined);
  }
}
