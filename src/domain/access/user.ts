import type { Role } from './role';
import type { SupportedTimeZone } from './time-zone';

export const USER_STATUSES = ['invitado', 'activo', 'desactivado'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** A person who may (or may no longer) use the Hub. Access is by invitation only. */
export interface User {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly status: UserStatus;
  readonly roleId: string;
  readonly role: Role;
  /** Zone used to show dates to this person (D-043). Grouping always uses Bogotá. */
  readonly timeZone: SupportedTimeZone;
}

/** Only invited or active users can sign in; deactivated ones are locked out (SDD §10.2). */
export function canSignIn(user: Pick<User, 'status'>): boolean {
  return user.status === 'invitado' || user.status === 'activo';
}
