import { err, ok, type Result } from '../../shared/result';
import { isLeaderRole, type Role } from './role';
import { LEADER_ONLY_PERMISSIONS, isPermissionKey } from './permissions';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL_PATTERN = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** Access is only for company accounts: well-formed and on the allowed domain (SDD §1, §11.2). */
export function isAllowedEmail(email: string, allowedDomain: string): boolean {
  const normalized = normalizeEmail(email);
  return (
    EMAIL_PATTERN.test(normalized) && normalized.endsWith(`@${allowedDomain.trim().toLowerCase()}`)
  );
}

export type AccessRuleViolation =
  | 'unknown-permission'
  | 'leader-only-permission'
  | 'leader-role-is-fixed'
  | 'last-leader'
  | 'self-demotion';

/** A Leader may not rewrite the Leader role or hand out leader-only permissions (SDD §10.1). */
export function validateGrantChange(
  targetRole: Role,
  permissionKey: string,
): Result<void, AccessRuleViolation> {
  if (!isPermissionKey(permissionKey)) return err('unknown-permission');
  if (LEADER_ONLY_PERMISSIONS.includes(permissionKey)) return err('leader-only-permission');
  if (isLeaderRole(targetRole)) return err('leader-role-is-fixed');
  return ok(undefined);
}

export interface LeaderChangeContext {
  /** Role the user has now. */
  readonly currentRole: Role;
  /** Role after the change; `null` means the user is being deactivated. */
  readonly nextRole: Role | null;
  /** Active users holding the Leader role right now, including this one if applicable. */
  readonly activeLeaderCount: number;
  readonly isSelf: boolean;
}

/**
 * The system must always keep at least one active Leader, and a Leader cannot remove their own
 * administration access (SDD §10.2).
 */
export function validateLeaderChange(
  context: LeaderChangeContext,
): Result<void, AccessRuleViolation> {
  const losesLeadership =
    isLeaderRole(context.currentRole) &&
    (context.nextRole === null || !isLeaderRole(context.nextRole));
  if (!losesLeadership) return ok(undefined);
  if (context.isSelf) return err('self-demotion');
  if (context.activeLeaderCount <= 1) return err('last-leader');
  return ok(undefined);
}
