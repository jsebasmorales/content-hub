import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PermissionSet } from '@domain/access/permission-set';
import { COLLABORATOR_ROLE_NAME } from '@domain/access/role';
import { LEARNED_FIELD_MAX } from '@domain/learned/learned';
import type { AuditEntry } from '@application/ports/services';
import type { Principal } from '@application/use-cases/resolve-session';
import { wireLearned } from '@infrastructure/compose-learned';
import { DbLearnedRepository } from '@infrastructure/db/repositories/learned-repository';
import { InMemoryLearnedRepository } from '@infrastructure/fakes/in-memory-learned';
import { APP_KINDS, createTestApp, type TestApp } from '../support/test-app';

/**
 * "Lo aprendido": the Leader's text per quarter. The same behaviour must hold on the real database
 * and on the in-memory fake, and the real database must refuse to change or erase a saved version.
 */

const NOW = new Date('2026-11-12T15:00:00Z');
const T4 = { year: 2026, quarter: 4 } as const;
const T3 = { year: 2026, quarter: 3 } as const;
const body = (conclusions: string, nextFocus = '', notes = '') => ({
  conclusions,
  nextFocus,
  notes,
});

for (const kind of APP_KINDS) {
  describe(`Lo aprendido: ${kind}`, () => {
    let t: TestApp;
    let leader: Principal;
    let collaborator: Principal;
    let app: ReturnType<typeof wireLearned>;
    let repository: DbLearnedRepository | InMemoryLearnedRepository;
    const audited: AuditEntry[] = [];

    async function principalFor(email: string): Promise<Principal> {
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

    beforeAll(async () => {
      t = await createTestApp(kind);
      t.clock.set(NOW);
      leader = await principalFor('lider@holafly.com');
      const roleId = (await t.app.roles.findByName(COLLABORATOR_ROLE_NAME))?.id ?? '';
      await t.app.inviteUser.execute(leader, {
        email: 'ana@holafly.com',
        roleId,
        confirmLeader: false,
        ip: null,
      });
      collaborator = await principalFor('ana@holafly.com');
      repository = t.db ? new DbLearnedRepository(t.db) : new InMemoryLearnedRepository();
      app = wireLearned(
        {
          learned: repository,
          users: t.app.users,
          audit: {
            record: async (entry) => {
              audited.push(entry);
              await t.app.audit.record(entry);
            },
          },
        },
        t.clock,
      );
    });
    afterAll(async () => {
      await t.close();
    });

    const save = (actor: Principal, quarter: typeof T4 | typeof T3 | null, content = body('x')) =>
      app.saveLearned.execute(actor, { quarter, content, ip: null });

    describe('who may use it', () => {
      it('is the Leader’s page: a collaborator gets neither the page nor the pen', async () => {
        expect(collaborator.permissions.has('section.learn')).toBe(false);
        expect(leader.permissions.has('section.learn')).toBe(true);
        expect(leader.permissions.has('action.learnedit')).toBe(true);
        expect((await app.getLearned.execute(collaborator.permissions, null)).ok).toBe(false);
        expect(await save(collaborator, T4)).toEqual({ ok: false, error: 'forbidden' });
      });

      it('needs the editing permission to write, not only to read', async () => {
        const reader: Principal = { ...leader, permissions: PermissionSet.of(['section.learn']) };
        expect((await app.getLearned.execute(reader.permissions, null)).ok).toBe(true);
        expect(await save(reader, T4)).toEqual({ ok: false, error: 'forbidden' });
      });
    });

    describe('saving', () => {
      it('refuses empty text, text that is too long and a quarter that has not started', async () => {
        expect(await save(leader, T4, body('  ', '', '\n'))).toEqual({ ok: false, error: 'empty' });
        expect(await save(leader, T4, body('x'.repeat(LEARNED_FIELD_MAX + 1)))).toEqual({
          ok: false,
          error: 'too-long',
        });
        expect(await save(leader, { year: 2027, quarter: 1 } as never)).toEqual({
          ok: false,
          error: 'invalid-quarter',
        });
        expect(await save(leader, null)).toEqual({ ok: false, error: 'invalid-quarter' });
        expect(await repository.latest(T4)).toBeNull();
      });

      it('adds a version, and a repeated save with the same text adds nothing', async () => {
        expect(await save(leader, T4, body('Lo aprendido 1', 'Foco 1'))).toEqual({
          ok: true,
          value: 'saved',
        });
        expect(await save(leader, T4, body('  Lo aprendido 1\r\n', 'Foco 1'))).toEqual({
          ok: true,
          value: 'unchanged',
        });
        expect((await repository.history(T4)).map((v) => v.conclusions)).toEqual([
          'Lo aprendido 1',
        ]);
      });

      it('keeps every earlier version when the text changes, newest first, with who and when', async () => {
        t.clock.advance(60_000);
        expect(await save(leader, T4, body('Lo aprendido 2', 'Foco 2'))).toEqual({
          ok: true,
          value: 'saved',
        });
        const history = await repository.history(T4);
        expect(history.map((v) => v.conclusions)).toEqual(['Lo aprendido 2', 'Lo aprendido 1']);
        expect(history[0]).toMatchObject({ authorId: leader.user.id, quarter: T4 });
        expect(history[0]?.createdAt.getTime()).toBeGreaterThan(
          history[1]?.createdAt.getTime() ?? 0,
        );
        expect((await repository.latest(T4))?.nextFocus).toBe('Foco 2');
      });

      it('records who saved, without copying the text into the audit log', () => {
        const entry = audited.find((e) => e.action === 'learned.saved');
        expect(entry).toMatchObject({ actorId: leader.user.id, targetType: 'learned_entry' });
        expect(JSON.stringify(entry)).not.toContain('Lo aprendido');
      });

      it('keeps each quarter apart', async () => {
        await save(leader, T3, body('Otro trimestre'));
        expect((await repository.latest(T3))?.conclusions).toBe('Otro trimestre');
        expect((await repository.latest(T4))?.conclusions).toBe('Lo aprendido 2');
        expect(await repository.quartersWithEntries()).toEqual([T4, T3]);
      });
    });

    describe('reading', () => {
      it('shows the latest text, who wrote it, every version and which quarters have text', async () => {
        const result = await app.getLearned.execute(leader.permissions, '2026-T4');
        if (!result.ok) throw new Error('expected the page');
        const page = result.value;
        expect(page.quarter).toEqual(T4);
        expect(page.latest).toMatchObject({ conclusions: 'Lo aprendido 2' });
        expect(page.latest?.authorName).toBe(leader.user.name ?? leader.user.email);
        expect(page.history).toHaveLength(2);
        const written = page.quarters.filter((q) => q.written).map((q) => q.quarter);
        expect(written).toEqual([T4, T3]);
        expect(page.ignoredQuarter).toBe(false);
      });

      it('falls back to the current quarter, and says so, for a quarter that cannot be used', async () => {
        for (const raw of ['2027-T1', 'abc', '2026-T9']) {
          const result = await app.getLearned.execute(leader.permissions, raw);
          if (!result.ok) throw new Error('expected the page');
          expect(result.value.quarter).toEqual(T4);
          expect(result.value.ignoredQuarter).toBe(true);
        }
        const none = await app.getLearned.execute(leader.permissions, null);
        if (!none.ok) throw new Error('expected the page');
        expect(none.value.ignoredQuarter).toBe(false);
      });

      it('offers the last eight quarters even when nothing is written there', async () => {
        const result = await app.getLearned.execute(leader.permissions, null);
        if (!result.ok) throw new Error('expected the page');
        expect(result.value.quarters.length).toBeGreaterThanOrEqual(8);
        expect(result.value.quarters[0]?.quarter).toEqual(T4);
      });
    });

    if (kind === 'postgres') {
      describe('the database keeps what was written', () => {
        it('refuses to change a saved version', async () => {
          const db = t.db;
          if (!db) throw new Error('expected a database');
          await expect(
            db.execute(sql`update learned_entry set conclusions = 'cambiado'`),
          ).rejects.toThrow();
        });

        it('refuses to erase a version, or the whole table', async () => {
          const db = t.db;
          if (!db) throw new Error('expected a database');
          await expect(db.execute(sql`delete from learned_entry`)).rejects.toThrow();
          await expect(db.execute(sql`truncate table learned_entry`)).rejects.toThrow();
          expect((await repository.history(T4)).length).toBe(2);
        });
      });
    }
  });
}
