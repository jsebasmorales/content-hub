import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PermissionSet } from '@domain/access/permission-set';
import { EMPTY_RAW_FILTER, type RawGlobalFilter } from '@domain/jira/global-filter';
import { at, snapshot } from '../support/jira-fixtures';
import { createSyncHarness, type SyncHarness } from '../support/jira-sync-harness';
import { APP_KINDS } from '../support/test-app';

/** The executive page reads the cached tickets and refuses anyone without `section.exec`. */

const raw = (patch: Partial<RawGlobalFilter> = {}): RawGlobalFilter => ({
  ...EMPTY_RAW_FILTER,
  ...patch,
});

for (const kind of APP_KINDS) {
  describe(`GetExecutiveSummary: ${kind}`, () => {
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

    it('refuses people without the section permission', async () => {
      const result = await t.app.executiveSummary.execute(PermissionSet.EMPTY, raw());
      expect(result).toEqual({ ok: false, error: 'forbidden' });
      const other = PermissionSet.of(['section.sla']);
      expect((await t.app.executiveSummary.execute(other, raw())).ok).toBe(false);
    });

    it('summarises the cached tickets for people who may see them', async () => {
      const done = snapshot('JSMCO-1', '2026-11-05T10:00:00Z', 'Done');
      await t.app.issues.upsertMany([
        {
          ...done,
          ticket: { ...done.ticket, resolvedAt: at('2026-11-05T10:00:00Z') },
        },
        snapshot('JSMCO-2', '2026-11-06T10:00:00Z'),
      ]);
      t.clock.set(at('2026-11-12T15:00:00Z'));

      const result = await t.app.executiveSummary.execute(
        PermissionSet.of(['section.exec']),
        raw(),
      );
      if (!result.ok) throw new Error('expected the summary');
      // Nothing asked: the last 30 days ending today, and no filter counts as active.
      expect(result.value.panel.filter.window).toMatchObject({ days: 30, partial: false });
      expect(result.value.panel.filter.activeCount).toBe(0);
      expect(result.value.summary.created.current).toBe(2);
      expect(result.value.summary.resolved.current).toBe(1);
      expect(result.value.summary.openNow).toBe(1);
      expect(result.value.previous.days).toBe(30);
    });

    it('narrows the figures to the request types of the filter and counts it as active', async () => {
      const other = snapshot('JSMCO-3', '2026-11-06T10:00:00Z');
      await t.app.issues.upsertMany([
        snapshot('JSMCO-1', '2026-11-05T10:00:00Z'),
        { ...other, ticket: { ...other.ticket, requestType: 'Edit' } },
      ]);
      const result = await t.app.executiveSummary.execute(
        PermissionSet.of(['section.exec']),
        raw({ types: ['Edit'] }),
      );
      if (!result.ok) throw new Error('expected the summary');
      expect(result.value.summary.created.current).toBe(1);
      expect(result.value.panel.filter.activeCount).toBe(1);
      expect(result.value.panel.typeOptions.map((o) => o.value)).toEqual([
        'Edit',
        'Translate Marketing Materials',
      ]);
    });

    it('reads a quarter, cut at today, and falls back saying so when it cannot', async () => {
      await t.app.issues.upsertMany([snapshot('JSMCO-1', '2026-11-05T10:00:00Z')]);
      const quarter = await t.app.executiveSummary.execute(
        PermissionSet.of(['section.exec']),
        raw({ period: 'T4', year: '2026' }),
      );
      if (!quarter.ok) throw new Error('expected the summary');
      expect(quarter.value.panel.filter.window).toMatchObject({ days: 42, partial: true });
      const bogus = await t.app.executiveSummary.execute(
        PermissionSet.of(['section.exec']),
        raw({ from: 'ayer', to: 'hoy' }),
      );
      if (!bogus.ok) throw new Error('expected the summary');
      expect(bogus.value.panel.filter.notices).toContain('period');
      expect(bogus.value.panel.filter.window.days).toBe(30);
    });

    it('works before the first sync, with nothing to show', async () => {
      const result = await t.app.executiveSummary.execute(
        PermissionSet.of(['section.exec']),
        raw(),
      );
      if (!result.ok) throw new Error('expected the summary');
      expect(result.value.summary.created.current).toBe(0);
      expect(result.value.summary.sla.goalMet).toBeNull();
      expect(result.value.panel.typeOptions).toEqual([]);
    });
  });
}
