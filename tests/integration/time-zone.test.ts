import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COLLABORATOR_ROLE_NAME } from '@domain/access/role';
import { DEFAULT_TIME_ZONE, SUPPORTED_TIME_ZONES } from '@domain/access/time-zone';
import type { Principal } from '@application/use-cases/resolve-session';
import { APP_KINDS, createTestApp, type TestApp } from '../support/test-app';

/** Each person chooses the zone in which dates are shown to them (D-043). */

for (const kind of APP_KINDS) {
  describe(`Time zone per person: ${kind}`, () => {
    let t: TestApp;
    let leader: Principal;
    let ana: Principal;
    let token = { leader: '', ana: '' };

    async function signIn(email: string): Promise<{ principal: Principal; token: string }> {
      const login = await t.app.signIn.execute({
        identity: { email, name: null },
        ip: null,
        userAgent: null,
      });
      if (!login.ok) throw new Error(login.error);
      const principal = await t.app.resolveSession.execute(login.value.token);
      if (!principal) throw new Error('no principal');
      return { principal, token: login.value.token };
    }
    const reload = async (who: 'leader' | 'ana'): Promise<Principal> => {
      const principal = await t.app.resolveSession.execute(token[who]);
      if (!principal) throw new Error('no principal');
      return principal;
    };

    beforeAll(async () => {
      t = await createTestApp(kind);
      const first = await signIn('lider@holafly.com');
      leader = first.principal;
      const roleId = (await t.app.roles.findByName(COLLABORATOR_ROLE_NAME))?.id ?? '';
      await t.app.inviteUser.execute(leader, {
        email: 'ana@holafly.com',
        roleId,
        confirmLeader: false,
        ip: null,
      });
      const second = await signIn('ana@holafly.com');
      ana = second.principal;
      token = { leader: first.token, ana: second.token };
    });
    afterAll(async () => {
      await t.close();
    });

    it('starts everyone in Bogotá, the zone the team groups its reports in', () => {
      expect(leader.user.timeZone).toBe(DEFAULT_TIME_ZONE);
      expect(ana.user.timeZone).toBe('America/Bogota');
    });

    it('lets a person choose any of the six zones on the list, and remembers it', async () => {
      for (const zone of SUPPORTED_TIME_ZONES) {
        expect(await t.app.setTimeZone.execute(leader, zone.id)).toEqual({
          ok: true,
          value: zone.id,
        });
        expect((await reload('leader')).user.timeZone).toBe(zone.id);
      }
    });

    it('changes only the person who chose, never anybody else', async () => {
      await t.app.setTimeZone.execute(leader, 'Europe/Madrid');
      await t.app.setTimeZone.execute(ana, 'Asia/Bangkok');
      expect((await reload('leader')).user.timeZone).toBe('Europe/Madrid');
      expect((await reload('ana')).user.timeZone).toBe('Asia/Bangkok');
    });

    it('refuses a zone that is not on the list and keeps the one the person had', async () => {
      for (const bad of ['Mars/Olympus', 'UTC', '+05:00', '', 'america/bogota']) {
        expect(await t.app.setTimeZone.execute(leader, bad)).toEqual({
          ok: false,
          error: 'invalid-zone',
        });
      }
      expect((await reload('leader')).user.timeZone).toBe('Europe/Madrid');
    });

    it('is available to a collaborator, because it only changes how they see times', async () => {
      expect((await t.app.setTimeZone.execute(ana, 'America/Argentina/Mendoza')).ok).toBe(true);
      expect((await reload('ana')).user.timeZone).toBe('America/Argentina/Mendoza');
    });

    if (kind === 'postgres') {
      it('falls back to Bogotá if the stored zone is no longer on the list', async () => {
        const db = t.db;
        if (!db) throw new Error('expected a database');
        await db.execute(
          sql`update app_user set time_zone = 'Mars/Olympus' where email = 'ana@holafly.com'`,
        );
        expect((await reload('ana')).user.timeZone).toBe('America/Bogota');
      });
    }
  });
}
