import type { User } from '@domain/access/user';
import { err, ok, type Result } from '@shared/result';
import type { RoleRecord } from '../../ports/repositories';
import type { Principal } from '../resolve-session';
import { isAdmin, type AdminDeps } from './shared';

export interface AccessOverview {
  readonly users: readonly User[];
  readonly roles: readonly RoleRecord[];
}

/** Data for the /permisos page: who is invited and which roles exist. */
export class GetAccessOverview {
  constructor(private readonly deps: AdminDeps) {}

  async execute(actor: Principal): Promise<Result<AccessOverview, 'forbidden'>> {
    if (!isAdmin(actor)) return err('forbidden');
    const [users, roles] = await Promise.all([this.deps.users.list(), this.deps.roles.list()]);
    return ok({ users, roles });
  }
}
