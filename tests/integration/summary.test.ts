import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PermissionSet } from '@domain/access/permission-set';
import { EMPTY_RAW_FILTER, type RawGlobalFilter } from '@domain/jira/global-filter';
import type { IssueSnapshot } from '@application/ports/jira';
import { at, snapshot } from '../support/jira-fixtures';
import { createSyncHarness, type SyncHarness } from '../support/jira-sync-harness';
import { APP_KINDS } from '../support/test-app';

/** /resumen: needs `section.summary`, which every role has by default. */

const allowed = PermissionSet.of(['section.summary']);
const raw = (patch: Partial<RawGlobalFilter> = {}): RawGlobalFilter => ({
  ...EMPTY_RAW_FILTER,
  ...patch,
});

function done(key: string, type: string, resolvedAt: string): IssueSnapshot {
  const base = snapshot(key, resolvedAt, 'Done');
  return {
    ...base,
    ticket: { ...base.ticket, requestType: type, resolvedAt: at(resolvedAt) },
  };
}

function open(key: string, type: string): IssueSnapshot {
  const base = snapshot(key, '2026-11-05T10:00:00Z');
  return { ...base, ticket: { ...base.ticket, requestType: type } };
}

for (const kind of APP_KINDS) {
  describe(`GetSummary: ${kind}`, () => {
    let t: SyncHarness;

    beforeAll(async () => {
      t = await createSyncHarness(kind);
    });
    afterAll(async () => {
      await t.close();
    });
    beforeEach(async () => {
      await t.reset();
    });

    const run = async (patch: Partial<RawGlobalFilter> = {}) => {
      const result = await t.app.summary.execute(allowed, raw(patch));
      if (!result.ok) throw new Error('expected the summary');
      return result.value;
    };

    it('refuses people without the section permission', async () => {
      expect(await t.app.summary.execute(PermissionSet.EMPTY, raw())).toEqual({
        ok: false,
        error: 'forbidden',
      });
    });

    it('summarises the last 30 days by default', async () => {
      await t.app.issues.upsertMany([
        done('JSMCO-1', 'Edit', '2026-11-03T10:00:00Z'),
        open('JSMCO-2', 'Edit'),
        open('JSMCO-3', 'Translate'),
      ]);
      const page = await run();
      expect(page.panel.filter.window.preset).toEqual({ kind: 'rolling', days: 30 });
      expect(page.report).toMatchObject({ created: 3, resolved: 1 });
      expect(page.report.openNow.total).toBe(2);
      expect(page.granularity).toBe('weekly');
    });

    it('narrows every figure to the request types chosen', async () => {
      await t.app.issues.upsertMany([
        done('JSMCO-1', 'Edit', '2026-11-03T10:00:00Z'),
        open('JSMCO-2', 'Edit'),
        open('JSMCO-3', 'Translate'),
      ]);
      const page = await run({ types: ['Translate'] });
      expect(page.panel.filter.types).toEqual({ all: false, names: ['Translate'] });
      expect(page.report).toMatchObject({ created: 1, resolved: 0 });
      // What is open today is narrowed by type too, but never by period.
      expect(page.report.openNow.total).toBe(1);
      // The filter still lists every type, so the person can change their mind.
      expect(page.panel.typeOptions.map((o) => o.value)).toEqual(['Edit', 'Translate']);
    });

    it('lets several types through at once, and ignores one that does not exist', async () => {
      await t.app.issues.upsertMany([
        open('JSMCO-1', 'Edit'),
        open('JSMCO-2', 'Translate'),
        open('JSMCO-3', 'Review'),
      ]);
      expect((await run({ types: ['Edit', 'Review'] })).report.created).toBe(2);
      const bogus = await run({ types: ['Made up'] });
      expect(bogus.panel.filter.types).toEqual({ all: true });
      expect(bogus.panel.filter.notices).toContain('types-unknown');
      expect(bogus.report.created).toBe(3);
    });

    it('counts a retired type in the totals of "todos", but not once types are chosen', async () => {
      await t.app.issues.upsertMany([
        open('JSMCO-1', 'Edit'),
        open('JSMCO-2', 'Translate'),
        open('JSMCO-3', "Translate - Moi - DON'T USE"),
      ]);
      expect((await run()).report.created).toBe(3);
      expect((await run({ types: ['Edit'] })).report.created).toBe(1);
      // Choosing every current type is the same as "todos", retired ones included.
      expect((await run({ types: ['Edit', 'Translate'] })).report.created).toBe(3);
    });

    it('honours a period and says when it ignored one', async () => {
      await t.app.issues.upsertMany([done('JSMCO-1', 'Edit', '2026-10-12T10:00:00Z')]);
      const inside = await run({ from: '2026-10-01', to: '2026-10-31' });
      expect(inside.report.resolved).toBe(1);
      const outside = await run({ period: 'T3', year: '2026' });
      expect(outside.report.resolved).toBe(0);
      expect((await run({ from: 'ayer', to: 'hoy' })).panel.filter.notices).toContain('period');
    });

    it('works before the first sync', async () => {
      const page = await run();
      expect(page.report).toMatchObject({ created: 0, resolved: 0, completionPercent: null });
      expect(page.report.flow).toEqual([]);
      expect(page.panel.typeOptions).toEqual([]);
    });
  });
}
