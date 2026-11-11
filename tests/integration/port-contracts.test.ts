import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COLLABORATOR_ROLE_NAME, LEADER_ROLE_NAME } from '@domain/access/role';
import { FakeRedirectAuthProvider } from '@infrastructure/fakes/in-memory-services';
import { APP_KINDS, createTestApp, type TestApp } from '../support/test-app';

/**
 * Contract: each port behaves the same whether it is the real adapter or the in-memory fake.
 * If a fake drifts from the real adapter, these tests fail (SDD §3 rule 7).
 */
for (const kind of APP_KINDS) {
  describe(`port contract: ${kind}`, () => {
    let t: TestApp;
    let collaboratorRoleId = '';
    let leaderRoleId = '';

    beforeAll(async () => {
      t = await createTestApp(kind);
      collaboratorRoleId = (await t.app.roles.findByName(COLLABORATOR_ROLE_NAME))?.id ?? '';
      leaderRoleId = (await t.app.roles.findByName(LEADER_ROLE_NAME))?.id ?? '';
    });

    afterAll(async () => {
      await t.close();
    });

    it('RoleRepository: lists both built-in roles and finds them by id or name', async () => {
      const names = (await t.app.roles.list()).map((role) => role.name);
      expect(names).toEqual([COLLABORATOR_ROLE_NAME, LEADER_ROLE_NAME].sort());
      expect((await t.app.roles.findById(collaboratorRoleId))?.name).toBe(COLLABORATOR_ROLE_NAME);
      expect(await t.app.roles.findById('not-a-uuid')).toBeNull();
      expect(await t.app.roles.findByName('Nope')).toBeNull();
    });

    it('RoleRepository: collaborators start with section permissions only; grants can be toggled', async () => {
      const keys = (await t.app.roles.listGrants(collaboratorRoleId)).map((g) => g.permissionKey);
      expect(keys).toContain('section.eco');
      expect(keys).not.toContain('admin.roles');
      await t.app.roles.setGrant(collaboratorRoleId, 'section.eco', false);
      const eco = (await t.app.roles.listGrants(collaboratorRoleId)).find(
        (g) => g.permissionKey === 'section.eco',
      );
      expect(eco?.granted).toBe(false);
      await t.app.roles.setGrant(collaboratorRoleId, 'section.eco', true);
    });

    it('UserRepository: creates, finds, updates and lists users', async () => {
      const created = await t.app.users.create({
        email: 'b@holafly.com',
        roleId: collaboratorRoleId,
        status: 'invitado',
        invitedBy: null,
      });
      await t.app.users.create({
        email: 'a@holafly.com',
        roleId: leaderRoleId,
        status: 'activo',
        invitedBy: null,
      });
      expect((await t.app.users.findByEmail('b@holafly.com'))?.id).toBe(created.id);
      expect((await t.app.users.findById(created.id))?.role.name).toBe(COLLABORATOR_ROLE_NAME);
      expect(await t.app.users.findById('not-a-uuid')).toBeNull();
      expect(await t.app.users.findByEmail('nobody@holafly.com')).toBeNull();
      expect((await t.app.users.list()).map((u) => u.email)).toEqual([
        'a@holafly.com',
        'b@holafly.com',
      ]);

      await t.app.users.markLoggedIn(created.id, 'Bea', t.clock.now());
      const loggedIn = await t.app.users.findById(created.id);
      expect([loggedIn?.status, loggedIn?.name]).toEqual(['activo', 'Bea']);

      await t.app.users.setRole(created.id, leaderRoleId);
      expect(await t.app.users.countActiveLeaders()).toBe(2);
      await t.app.users.setStatus(created.id, 'desactivado');
      expect(await t.app.users.countActiveLeaders()).toBe(1);
    });

    it('SessionRepository: creates, reads, touches and deletes sessions', async () => {
      const user = await t.app.users.findByEmail('a@holafly.com');
      const base = { userId: user?.id ?? '', now: t.clock.now(), ip: null, userAgent: 'x' };
      const expiresAt = new Date(t.clock.now().getTime() + 1000);
      await t.app.sessions.create({ ...base, tokenHash: 'h1', expiresAt });
      await t.app.sessions.create({ ...base, tokenHash: 'h2', expiresAt });

      expect((await t.app.sessions.findWithUser('h1'))?.user.email).toBe('a@holafly.com');
      const later = new Date(t.clock.now().getTime() + 500);
      await t.app.sessions.touch('h1', later);
      expect((await t.app.sessions.findWithUser('h1'))?.lastSeenAt.getTime()).toBe(later.getTime());

      await t.app.sessions.delete('h1');
      expect(await t.app.sessions.findWithUser('h1')).toBeNull();
      await t.app.sessions.deleteAllForUser(user?.id ?? '');
      expect(await t.app.sessions.findWithUser('h2')).toBeNull();
      expect(await t.app.sessions.findWithUser('missing')).toBeNull();
    });

    it('AuditLog: records an entry without error', async () => {
      await expect(
        t.app.audit.record({ actorId: null, action: 'test.contract', targetType: 'test' }),
      ).resolves.toBeUndefined();
    });
  });
}

describe('FakeRedirectAuthProvider', () => {
  it('returns the scripted identity and rejects an empty code', async () => {
    const provider = new FakeRedirectAuthProvider({
      ok: true,
      value: { email: 'a@holafly.com', name: 'Ana' },
    });
    expect(provider.begin().state).toBe('fake-state');
    expect((await provider.complete({ code: 'c', codeVerifier: 'v' })).ok).toBe(true);
    expect(await provider.complete({ code: '', codeVerifier: 'v' })).toEqual({
      ok: false,
      error: 'invalid-credentials',
    });
    provider.setOutcome({ ok: false, error: 'email-unavailable' });
    expect(await provider.complete({ code: 'c', codeVerifier: 'v' })).toEqual({
      ok: false,
      error: 'email-unavailable',
    });
  });
});
