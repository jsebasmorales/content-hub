import { can } from '@domain/access/permission-set';
import { isLeaderRole } from '@domain/access/role';
import type { AccessRuleViolation } from '@domain/access/user-rules';
import type { Principal } from '../resolve-session';
import type {
  RoleRecord,
  RoleRepository,
  SessionRepository,
  UserRepository,
} from '../../ports/repositories';
import type { AuditLog } from '../../ports/services';
import type { AccessUnitOfWork } from '../../ports/unit-of-work';

export type AdminError =
  | 'forbidden'
  | 'invalid-email'
  | 'already-exists'
  | 'unknown-role'
  | 'unknown-user'
  | 'confirmation-required'
  | AccessRuleViolation;

export interface AdminDeps {
  readonly users: UserRepository;
  readonly roles: RoleRepository;
  readonly sessions: SessionRepository;
  readonly audit: AuditLog;
  /** Serialises changes that could leave the system without a Leader (D-031). */
  readonly unitOfWork: AccessUnitOfWork;
  readonly allowedEmailDomain: string;
}

/** Defense in depth: use cases re-check the permission even though the route already did. */
export function isAdmin(actor: Principal): boolean {
  return can(actor.permissions, 'admin.roles');
}

/** Making someone a Leader is sensitive, so it needs an explicit confirmation (SDD §10.2). */
export function needsLeaderConfirmation(role: RoleRecord, confirmed: boolean): boolean {
  return isLeaderRole(role) && !confirmed;
}
