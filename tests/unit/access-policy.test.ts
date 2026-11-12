import { describe, expect, it } from 'vitest';
import {
  PermissionSet,
  can,
  resolvePermissions,
  visibleSections,
  type PermissionGrant,
} from '@domain/access/permission-set';
import {
  ASSIGNABLE_PERMISSIONS,
  PERMISSION_CATALOG,
  SECTION_IDS,
  isPermissionKey,
} from '@domain/access/permissions';
import {
  COLLABORATOR_ROLE_NAME,
  DEFAULT_ROLE_GRANTS,
  LEADER_ROLE_NAME,
  isLeaderRole,
  type Role,
} from '@domain/access/role';
import {
  isAllowedEmail,
  normalizeEmail,
  validateGrantChange,
  validateLeaderChange,
} from '@domain/access/user-rules';

const leader: Role = { name: LEADER_ROLE_NAME, isSystem: true };
const collaborator: Role = { name: COLLABORATOR_ROLE_NAME, isSystem: true };
const custom: Role = { name: 'Editor', isSystem: false };

const grant = (permissionKey: string, granted = true): PermissionGrant => ({
  permissionKey,
  granted,
});

describe('permission catalog', () => {
  it('contains every section, the three actions and admin.roles', () => {
    expect(PERMISSION_CATALOG).toHaveLength(SECTION_IDS.length + 4);
    expect(PERMISSION_CATALOG).toContain('admin.roles');
    // Reading "Lo aprendido" and writing it are separate permissions (D-061).
    expect(PERMISSION_CATALOG).toContain('section.learn');
    expect(PERMISSION_CATALOG).toContain('action.learnedit');
  });

  it('never lets admin.roles be assigned', () => {
    expect(ASSIGNABLE_PERMISSIONS).not.toContain('admin.roles');
  });

  it('recognises only catalog keys', () => {
    expect(isPermissionKey('section.eco')).toBe(true);
    expect(isPermissionKey('section.secret')).toBe(false);
    expect(isPermissionKey('')).toBe(false);
  });
});

describe('resolvePermissions', () => {
  it('denies everything by default', () => {
    const set = resolvePermissions(collaborator, []);
    for (const key of PERMISSION_CATALOG) expect(can(set, key)).toBe(false);
  });

  it('gives the built-in Leader the full catalog regardless of stored grants', () => {
    const set = resolvePermissions(leader, []);
    for (const key of PERMISSION_CATALOG) expect(can(set, key)).toBe(true);
  });

  it('does not treat a custom role named "Líder" as a leader', () => {
    const impostor: Role = { name: LEADER_ROLE_NAME, isSystem: false };
    expect(isLeaderRole(impostor)).toBe(false);
    expect(can(resolvePermissions(impostor, []), 'admin.roles')).toBe(false);
  });

  it('applies only granted permissions', () => {
    const set = resolvePermissions(custom, [grant('section.eco'), grant('section.sla', false)]);
    expect(can(set, 'section.eco')).toBe(true);
    expect(can(set, 'section.sla')).toBe(false);
  });

  it('drops admin.roles and unknown keys even when the data contains them', () => {
    const set = resolvePermissions(custom, [grant('admin.roles'), grant('section.invented')]);
    expect(set.toArray()).toEqual([]);
  });

  it('gives built-in collaborators the section permissions only, except the page of the Leader (D-001, D-061)', () => {
    const defaults = DEFAULT_ROLE_GRANTS[COLLABORATOR_ROLE_NAME] ?? [];
    const set = resolvePermissions(
      collaborator,
      defaults.map((key) => grant(key)),
    );
    expect(visibleSections(set)).toEqual(SECTION_IDS.filter((id) => id !== 'learn'));
    expect(can(set, 'section.learn')).toBe(false);
    expect(can(set, 'action.learnedit')).toBe(false);
    expect(can(set, 'action.sync')).toBe(false);
    expect(can(set, 'admin.roles')).toBe(false);
  });
});

describe('PermissionSet', () => {
  it('is empty by default', () => {
    expect(PermissionSet.EMPTY.toArray()).toEqual([]);
  });

  it('produces the same cache key for the same permissions in any order', () => {
    const a = PermissionSet.of(['section.eco', 'section.sla']);
    const b = PermissionSet.of(['section.sla', 'section.eco']);
    expect(a.cacheKey()).toBe(b.cacheKey());
  });

  it('produces different cache keys for different permissions', () => {
    const a = PermissionSet.of(['section.eco']);
    const b = PermissionSet.of(['section.eco', 'section.sla']);
    expect(a.cacheKey()).not.toBe(b.cacheKey());
  });

  it('lists visible sections in catalog order', () => {
    const set = PermissionSet.of(['section.sla', 'section.exec']);
    expect(visibleSections(set)).toEqual(['exec', 'sla']);
  });
});

describe('email rules', () => {
  it('normalizes case and whitespace', () => {
    expect(normalizeEmail('  Maria.Lopez@Holafly.com ')).toBe('maria.lopez@holafly.com');
  });

  it.each(['ana@holafly.com', 'ANA@HOLAFLY.COM', ' ana.perez+x@holafly.com '])(
    'accepts %s',
    (email) => {
      expect(isAllowedEmail(email, 'holafly.com')).toBe(true);
    },
  );

  it.each([
    'ana@gmail.com',
    'ana@holafly.com.evil.io',
    'ana@evilholafly.com',
    'ana@sub.holafly.com',
    '@holafly.com',
    'ana holafly.com',
    '',
  ])('rejects %s', (email) => {
    expect(isAllowedEmail(email, 'holafly.com')).toBe(false);
  });
});

describe('validateGrantChange', () => {
  it('allows an assignable permission on a non-leader role', () => {
    expect(validateGrantChange(collaborator, 'section.eco').ok).toBe(true);
  });

  it.each([
    ['unknown permission', collaborator, 'section.nope', 'unknown-permission'],
    ['leader-only permission', collaborator, 'admin.roles', 'leader-only-permission'],
    ['edit of the leader role', leader, 'section.eco', 'leader-role-is-fixed'],
  ] as const)('rejects %s', (_label, role, key, expected) => {
    expect(validateGrantChange(role, key)).toEqual({ ok: false, error: expected });
  });
});

describe('validateLeaderChange', () => {
  const base = { currentRole: leader, nextRole: collaborator, activeLeaderCount: 2, isSelf: false };

  it('allows changes that do not remove leadership', () => {
    expect(
      validateLeaderChange({ ...base, currentRole: collaborator, activeLeaderCount: 1 }).ok,
    ).toBe(true);
    expect(validateLeaderChange({ ...base, nextRole: leader, activeLeaderCount: 1 }).ok).toBe(true);
  });

  it('allows demoting a leader when another leader remains', () => {
    expect(validateLeaderChange(base).ok).toBe(true);
  });

  it('never leaves the system without a leader', () => {
    expect(validateLeaderChange({ ...base, activeLeaderCount: 1 })).toEqual({
      ok: false,
      error: 'last-leader',
    });
    expect(validateLeaderChange({ ...base, nextRole: null, activeLeaderCount: 1 })).toEqual({
      ok: false,
      error: 'last-leader',
    });
  });

  it('forbids a leader from removing their own leadership', () => {
    expect(validateLeaderChange({ ...base, isSelf: true })).toEqual({
      ok: false,
      error: 'self-demotion',
    });
    expect(validateLeaderChange({ ...base, nextRole: null, isSelf: true }).ok).toBe(false);
  });
});
