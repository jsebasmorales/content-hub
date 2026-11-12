import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PermissionSet } from '@domain/access/permission-set';
import type { IssueSnapshot } from '@application/ports/jira';
import { at, snapshot } from '../support/jira-fixtures';
import { createSyncHarness, type SyncHarness } from '../support/jira-sync-harness';
import { APP_KINDS } from '../support/test-app';

/** /resumen: needs `section.summary`, which every role has by default. */

const allowed = PermissionSet.of(['section.summary']);

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

    const run = async (input: { period?: Record<string, string>; requestType?: string } = {}) => {
      const result = await t.app.summary.execute(allowed, {
        period: input.period ?? {},
        requestType: input.requestType,
      });
      if (!result.ok) throw new Error('expected the summary');
      return result.value;
    };

    it('refuses people without the section permission', async () => {
      expect(
        await t.app.summary.execute(PermissionSet.EMPTY, { period: {}, requestType: null }),
      ).toEqual({
        ok: false,
        error: 'forbidden',
      });
    });

    it('summarises the current quarter by default', async () => {
      await t.app.issues.upsertMany([
        done('JSMCO-1', 'Edit', '2026-11-03T10:00:00Z'),
        open('JSMCO-2', 'Edit'),
        open('JSMCO-3', 'Translate'),
      ]);
      const page = await run();
      expect(page.resolved.period).toMatchObject({
        kind: 'quarter',
        quarter: { year: 2026, quarter: 4 },
      });
      expect(page.report).toMatchObject({ created: 3, resolved: 1 });
      expect(page.report.openNow.total).toBe(2);
    });

    it('narrows every figure to the request type chosen', async () => {
      await t.app.issues.upsertMany([
        done('JSMCO-1', 'Edit', '2026-11-03T10:00:00Z'),
        open('JSMCO-2', 'Edit'),
        open('JSMCO-3', 'Translate'),
      ]);
      const page = await run({ requestType: 'Translate' });
      expect(page.requestType).toBe('Translate');
      expect(page.report).toMatchObject({ created: 1, resolved: 0 });
      // The filter still lists every type, so the person can change their mind.
      expect(page.typeOptions.map((o) => o.value)).toEqual(['Edit', 'Translate']);
    });

    it('ignores a request type that does not exist', async () => {
      await t.app.issues.upsertMany([open('JSMCO-1', 'Edit')]);
      const page = await run({ requestType: 'Made up' });
      expect(page.requestType).toBeNull();
      expect(page.report.created).toBe(1);
    });

    it('honours a period and says when it ignored one', async () => {
      await t.app.issues.upsertMany([done('JSMCO-1', 'Edit', '2026-10-12T10:00:00Z')]);
      const inside = await run({ period: { from: '2026-10-01', to: '2026-10-31' } });
      expect(inside.report.resolved).toBe(1);
      const outside = await run({ period: { quarter: '2026-T3' } });
      expect(outside.report.resolved).toBe(0);
      expect((await run({ period: { from: 'ayer', to: 'hoy' } })).resolved.ignored).toBe(true);
    });

    it('works before the first sync', async () => {
      const page = await run();
      expect(page.report).toMatchObject({ created: 0, resolved: 0, completionPercent: null });
      expect(page.typeOptions).toEqual([]);
    });
  });
}
