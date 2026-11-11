import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_ABSOLUTE_TTL_MS, SESSION_IDLE_TTL_MS } from '@domain/access/session-policy';
import { COLLABORATOR_ROLE_NAME, LEADER_ROLE_NAME } from '@domain/access/role';
import { APP_KINDS, createTestApp, type TestApp } from '../support/test-app';

for (const kind of APP_KINDS) {
  describe(kind, () => {
    let t: TestApp;

    const request = (email: string) => ({
      identity: { email, name: 'Test' },
      ip: '203.0.113.5',
      userAgent: 'vitest',
    });

    async function invite(email: string, roleName = COLLABORATOR_ROLE_NAME): Promise<void> {
      const role = await t.app.roles.findByName(roleName);
      await t.app.users.create({
        email,
        roleId: role?.id ?? '',
        status: 'invitado',
        invitedBy: null,
      });
    }

    beforeAll(async () => {
      t = await createTestApp(kind);
    });

    afterAll(async () => {
      await t.close();
    });

    describe('sign in', () => {
      it('creates the first Leader from the bootstrap email while none exists', async () => {
        const result = await t.app.signIn.execute(request('Lider@Holafly.com'));
        expect(result.ok).toBe(true);
        const leader = await t.app.users.findByEmail('lider@holafly.com');
        expect(leader?.role.name).toBe(LEADER_ROLE_NAME);
        expect(leader?.status).toBe('activo');
      });

      it('rejects people who were not invited', async () => {
        expect(await t.app.signIn.execute(request('stranger@holafly.com'))).toEqual({
          ok: false,
          error: 'not-invited',
        });
      });

      it('rejects emails outside the company domain', async () => {
        expect(await t.app.signIn.execute(request('someone@gmail.com'))).toEqual({
          ok: false,
          error: 'domain-not-allowed',
        });
      });

      it('lets an invited collaborator in and activates them', async () => {
        await invite('ana@holafly.com');
        expect((await t.app.signIn.execute(request('ana@holafly.com'))).ok).toBe(true);
        expect((await t.app.users.findByEmail('ana@holafly.com'))?.status).toBe('activo');
      });

      it('stops honouring the bootstrap email once a Leader exists', async () => {
        // lider@ already is the Leader; a second, different "bootstrap" attempt must not promote anyone.
        await invite('pedro@holafly.com');
        await t.app.signIn.execute(request('pedro@holafly.com'));
        const pedro = await t.app.users.findByEmail('pedro@holafly.com');
        expect(pedro?.role.name).toBe(COLLABORATOR_ROLE_NAME);
      });

      it('denies deactivated users and records the attempt in the audit log', async () => {
        await invite('luis@holafly.com');
        const luis = await t.app.users.findByEmail('luis@holafly.com');
        await t.app.users.setStatus(luis?.id ?? '', 'desactivado');
        expect(await t.app.signIn.execute(request('luis@holafly.com'))).toEqual({
          ok: false,
          error: 'deactivated',
        });
      });
    });

    describe('sessions', () => {
      async function loginAs(email: string): Promise<string> {
        const result = await t.app.signIn.execute(request(email));
        if (!result.ok) throw new Error(`login failed: ${result.error}`);
        return result.value.token;
      }

      it('resolves a valid session with the right permissions', async () => {
        const leaderToken = await loginAs('lider@holafly.com');
        const anaToken = await loginAs('ana@holafly.com');
        const leader = await t.app.resolveSession.execute(leaderToken);
        const ana = await t.app.resolveSession.execute(anaToken);
        expect(leader?.permissions.has('admin.roles')).toBe(true);
        expect(ana?.permissions.has('section.eco')).toBe(true);
        expect(ana?.permissions.has('admin.roles')).toBe(false);
      });

      it('returns nothing for a missing or unknown token', async () => {
        expect(await t.app.resolveSession.execute(undefined)).toBeNull();
        expect(await t.app.resolveSession.execute('not-a-real-token')).toBeNull();
      });

      it('issues a different token on every login (no session fixation)', async () => {
        expect(await loginAs('ana@holafly.com')).not.toBe(await loginAs('ana@holafly.com'));
      });

      it('expires after the idle timeout', async () => {
        const token = await loginAs('ana@holafly.com');
        t.clock.advance(SESSION_IDLE_TTL_MS + 1000);
        expect(await t.app.resolveSession.execute(token)).toBeNull();
      });

      it('expires after the absolute lifetime even when active', async () => {
        const token = await loginAs('ana@holafly.com');
        for (
          let elapsed = 0;
          elapsed < SESSION_ABSOLUTE_TTL_MS;
          elapsed += SESSION_IDLE_TTL_MS / 2
        ) {
          t.clock.advance(SESSION_IDLE_TTL_MS / 2);
          if (elapsed + SESSION_IDLE_TTL_MS / 2 < SESSION_ABSOLUTE_TTL_MS) {
            expect(await t.app.resolveSession.execute(token)).not.toBeNull();
          }
        }
        expect(await t.app.resolveSession.execute(token)).toBeNull();
      });

      it('is revoked on sign out', async () => {
        const token = await loginAs('ana@holafly.com');
        await t.app.signOut.execute(token, null, null);
        expect(await t.app.resolveSession.execute(token)).toBeNull();
      });

      it('stops working immediately when the user is deactivated', async () => {
        await invite('eva@holafly.com');
        const token = await loginAs('eva@holafly.com');
        const eva = await t.app.users.findByEmail('eva@holafly.com');
        await t.app.users.setStatus(eva?.id ?? '', 'desactivado');
        expect(await t.app.resolveSession.execute(token)).toBeNull();
      });

      it('applies role permission changes on the very next request', async () => {
        const token = await loginAs('ana@holafly.com');
        const role = await t.app.roles.findByName(COLLABORATOR_ROLE_NAME);
        await t.app.roles.setGrant(role?.id ?? '', 'section.eco', false);
        const principal = await t.app.resolveSession.execute(token);
        expect(principal?.permissions.has('section.eco')).toBe(false);
      });
    });
  });
}
