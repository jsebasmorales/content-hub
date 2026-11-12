import { isSupportedTimeZone, type SupportedTimeZone } from '@domain/access/time-zone';
import { err, ok, type Result } from '@shared/result';
import type { UserRepository } from '../ports/repositories';
import type { Principal } from './resolve-session';

/**
 * Lets each person choose the zone in which dates are shown to them (D-043). It is a display
 * preference of one's own, so being signed in is enough; nobody can change someone else's. Reports
 * and totals keep grouping by Bogotá, so everyone reads the same figures.
 */
export class SetTimeZone {
  constructor(private readonly deps: { readonly users: UserRepository }) {}

  async execute(
    actor: Principal,
    requested: string,
  ): Promise<Result<SupportedTimeZone, 'invalid-zone'>> {
    if (!isSupportedTimeZone(requested)) return err('invalid-zone');
    await this.deps.users.setTimeZone(actor.user.id, requested);
    return ok(requested);
  }
}
