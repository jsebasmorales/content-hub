import { describe, expect, it } from 'vitest';
import { PermissionSet, resolvePermissions } from '@domain/access/permission-set';
import {
  COLLABORATOR_ROLE_NAME,
  DEFAULT_ROLE_GRANTS,
  LEADER_ROLE_NAME,
  type Role,
} from '@domain/access/role';
import { decideAccess, type AccessDecision } from '@domain/access/route-access';
import { buildMenu } from '@presentation/navigation';
import { ROUTES } from '@presentation/routes';

const collaboratorGrants = (DEFAULT_ROLE_GRANTS[COLLABORATOR_ROLE_NAME] ?? []).map((key) => ({
  permissionKey: key,
  granted: true,
}));

interface Profile {
  readonly label: string;
  readonly permissions: PermissionSet | null;
}

const PROFILES: readonly Profile[] = [
  { label: 'visitor (no session)', permissions: null },
  {
    label: 'collaborator without any grant',
    permissions: resolvePermissions({ name: COLLABORATOR_ROLE_NAME, isSystem: true }, []),
  },
  {
    label: 'collaborator with default grants',
    permissions: resolvePermissions(
      { name: COLLABORATOR_ROLE_NAME, isSystem: true },
      collaboratorGrants,
    ),
  },
  {
    label: 'leader',
    permissions: resolvePermissions({ name: LEADER_ROLE_NAME, isSystem: true } satisfies Role, []),
  },
];

/** Expected outcome per profile for every route, written out by hand on purpose. */
function expected(profile: Profile, pattern: string): AccessDecision {
  const isPublic = ['/login', '/api/auth/login', '/api/auth/start', '/api/auth/callback'];
  if (isPublic.includes(pattern)) return 'allow';
  if (profile.permissions === null) return 'unauthenticated';
  const key = profile.label;
  if (pattern === '/api/auth/logout') return 'allow';
  if (pattern === '/') return key === 'collaborator without any grant' ? 'hidden' : 'allow';
  // /permisos and /api/admin/users need admin.roles: leaders only.
  return key === 'leader' ? 'allow' : 'hidden';
}

describe('authorization matrix: every profile x every route', () => {
  for (const profile of PROFILES) {
    describe(profile.label, () => {
      it.each(ROUTES.map((route) => [route.pattern, route] as const))('%s', (pattern, route) => {
        const requester = profile.permissions ? { permissions: profile.permissions } : null;
        expect(decideAccess(route.access, requester)).toBe(expected(profile, pattern));
      });
    });
  }
});

describe('menu', () => {
  it('shows nothing to someone with no permissions', () => {
    expect(buildMenu(PermissionSet.EMPTY)).toEqual([]);
  });

  it('shows collaborators their sections but never the administration page', () => {
    const permissions = PROFILES[2]?.permissions ?? PermissionSet.EMPTY;
    const labels = buildMenu(permissions).map((item) => item.label);
    expect(labels).toContain('Resumen ejecutivo');
    expect(labels).not.toContain('Permisos');
  });

  it('shows leaders both entries', () => {
    const permissions = PROFILES[3]?.permissions ?? PermissionSet.EMPTY;
    expect(buildMenu(permissions).map((item) => item.href)).toEqual(['/', '/permisos']);
  });
});
