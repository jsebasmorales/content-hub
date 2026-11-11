import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COLLABORATOR_ROLE_NAME, LEADER_ROLE_NAME } from '@domain/access/role';
import type { Principal } from '@application/use-cases/resolve-session';
import { APP_KINDS, createTestApp, type TestApp } from '../support/test-app';

/**
 * D-031: "there is always an active Leader" must hold even when two requests overlap.
 * PGlite runs one connection, so these prove the use cases go through the lock and decide on
 * fresh data; true parallelism against `pg` needs the Postgres job in CI.
 */
for (const kind of APP_KINDS) {
  describe(`leader lock · ${kind}`, () => {
    let t: TestApp;
    let first: Principal;
    let second: Principal;
    let collaboratorRoleId = '';

    async function signIn(email: string): Promise<Principal> {
      const login = await t.app.signIn.execute({
        identity: { email, name: null },
        ip: null,
        userAgent: null,
      });
      if (!login.ok) throw new Error(login.error);
      const principal = await t.app.resolveSession.execute(login.value.token);
      if (!principal) throw new Error('no principal');
      return principal;
    }

    beforeEach(async () => {
      t = await createTestApp(kind);
      const leaderRoleId = (await t.app.roles.findByName(LEADER_ROLE_NAME))?.id ?? '';
      collaboratorRoleId = (await t.app.roles.findByName(COLLABORATOR_ROLE_NAME))?.id ?? '';
      first = await signIn('lider@holafly.com');
      await t.app.inviteUser.execute(first, {
        email: 'segundo@holafly.com',
        roleId: leaderRoleId,
        confirmLeader: true,
        ip: null,
      });
      second = await signIn('segundo@holafly.com');
    });

    afterEach(async () => {
      await t.close();
    });

    it('lets only one of two simultaneous demotions succeed', async () => {
      const results = await Promise.all([
        t.app.changeUserRole.execute(first, {
          userId: second.user.id,
          roleId: collaboratorRoleId,
          confirmLeader: false,
          ip: null,
        }),
        t.app.changeUserRole.execute(second, {
          userId: first.user.id,
          roleId: collaboratorRoleId,
          confirmLeader: false,
          ip: null,
        }),
      ]);

      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: 'last-leader' });
      expect(await t.app.users.countActiveLeaders()).toBe(1);
    });

    it('lets only one of two simultaneous deactivations succeed', async () => {
      const results = await Promise.all([
        t.app.setUserStatus.execute(first, { userId: second.user.id, active: false, ip: null }),
        t.app.setUserStatus.execute(second, { userId: first.user.id, active: false, ip: null }),
      ]);

      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(await t.app.users.countActiveLeaders()).toBe(1);
    });

    it('creates the bootstrap Leader once when the first logins overlap', async () => {
      const fresh = await createTestApp(kind);
      try {
        const attempt = () =>
          fresh.app.signIn.execute({
            identity: { email: 'lider@holafly.com', name: null },
            ip: null,
            userAgent: null,
          });
        const results = await Promise.all([attempt(), attempt(), attempt()]);

        expect(results.every((r) => r.ok)).toBe(true);
        expect(await fresh.app.users.countActiveLeaders()).toBe(1);
        expect(await fresh.app.users.list()).toHaveLength(1);
      } finally {
        await fresh.close();
      }
    });
  });
}
