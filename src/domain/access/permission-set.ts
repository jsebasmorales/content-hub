import {
  ASSIGNABLE_PERMISSIONS,
  PERMISSION_CATALOG,
  SECTION_IDS,
  isPermissionKey,
  type PermissionKey,
  type SectionId,
} from './permissions';
import { isLeaderRole, type Role } from './role';

/** One stored role-permission row. Keys are plain strings because they come from the database. */
export interface PermissionGrant {
  readonly permissionKey: string;
  readonly granted: boolean;
}

/**
 * The effective permissions of one user for one request. Immutable and deny-by-default:
 * anything not in the set is forbidden (SDD §11.2).
 */
export class PermissionSet {
  private constructor(private readonly keys: ReadonlySet<PermissionKey>) {}

  static readonly EMPTY = new PermissionSet(new Set());

  static of(keys: Iterable<PermissionKey>): PermissionSet {
    return new PermissionSet(new Set(keys));
  }

  has(key: PermissionKey): boolean {
    return this.keys.has(key);
  }

  /** Sorted list, stable across calls. */
  toArray(): PermissionKey[] {
    return [...this.keys].sort();
  }

  /**
   * Deterministic identity of the set. Cache keys must include it so a response built for one
   * profile is never served to another (SDD §10.3, "Caché").
   */
  cacheKey(): string {
    return this.toArray().join('|');
  }
}

/**
 * Computes what a role may do.
 *  - Leaders always receive the full catalog, whatever the database says, so the system can
 *    never be left without an administrator.
 *  - Other roles receive only granted, known, assignable permissions. `admin.roles` and
 *    unknown keys are dropped even if present in the data.
 */
export function resolvePermissions(role: Role, grants: readonly PermissionGrant[]): PermissionSet {
  if (isLeaderRole(role)) return PermissionSet.of(PERMISSION_CATALOG);
  const assignable: ReadonlySet<string> = new Set(ASSIGNABLE_PERMISSIONS);
  const effective = grants
    .filter((grant) => grant.granted && assignable.has(grant.permissionKey))
    .map((grant) => grant.permissionKey)
    .filter(isPermissionKey);
  return PermissionSet.of(effective);
}

/** The single yes/no question every layer asks (SDD §10.3). */
export function can(permissions: PermissionSet, key: PermissionKey): boolean {
  return permissions.has(key);
}

/** Sections the user may see, in catalog order. Used to build menus and filter data. */
export function visibleSections(permissions: PermissionSet): SectionId[] {
  return SECTION_IDS.filter((id) => permissions.has(`section.${id}`));
}
