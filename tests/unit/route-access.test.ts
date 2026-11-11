import { describe, expect, it } from 'vitest';
import { PermissionSet } from '@domain/access/permission-set';
import { decideAccess, type AccessRequirement } from '@domain/access/route-access';

const collaborator = { permissions: PermissionSet.of(['section.eco']) };
const needsEco: AccessRequirement = { kind: 'permission', permission: 'section.eco' };
const needsAdmin: AccessRequirement = { kind: 'permission', permission: 'admin.roles' };

describe('decideAccess', () => {
  it('lets anyone reach a public route', () => {
    expect(decideAccess({ kind: 'public' }, null)).toBe('allow');
    expect(decideAccess({ kind: 'public' }, collaborator)).toBe('allow');
  });

  it('sends visitors without a session to sign in', () => {
    expect(decideAccess({ kind: 'authenticated' }, null)).toBe('unauthenticated');
    expect(decideAccess(needsEco, null)).toBe('unauthenticated');
  });

  it('lets any signed-in user reach an authenticated route', () => {
    expect(decideAccess({ kind: 'authenticated' }, collaborator)).toBe('allow');
  });

  it('allows a route when the permission is held', () => {
    expect(decideAccess(needsEco, collaborator)).toBe('allow');
  });

  it('hides a route when the permission is missing', () => {
    expect(decideAccess(needsAdmin, collaborator)).toBe('hidden');
    expect(decideAccess(needsEco, { permissions: PermissionSet.EMPTY })).toBe('hidden');
  });
});
