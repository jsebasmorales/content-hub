import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GetExecutiveSummary } from '@application/use-cases/jira/get-executive-summary';
import { GetSummary } from '@application/use-cases/jira/get-summary';
import { PermissionSet } from '@domain/access/permission-set';
import { EMPTY_RAW_FILTER, type RawGlobalFilter } from '@domain/jira/global-filter';
import { at, snapshot } from '../support/jira-fixtures';
import { createSyncHarness, type SyncHarness } from '../support/jira-sync-harness';
import { APP_KINDS } from '../support/test-app';

/**
 * The comparison with the previous year on `/` and `/resumen`. The switch is not on in the
 * application yet (D-0k), so these tests turn it on in the use cases.
 */
const raw = (patch: Partial<RawGlobalFilter> = {}): RawGlobalFilter => ({
  ...EMPTY_RAW_FILTER,
  ...patch,
});
/** A ticket created at `iso`, whose only SLA cycle also starts then. */
function created(key: string, iso: string) {
  const base = snapshot(key, iso);
  return {
    ...base,
    ticket: { ...base.ticket, createdAt: at(iso) },
    slaCycles: base.slaCycles.map((cycle) => ({ ...cycle, startedAt: at(iso) })),
  };
}
const exec = PermissionSet.of(['section.exec', 'section.summary']);

for (const kind of APP_KINDS) {
  describe(`comparison on / and /resumen: ${kind}`, () => {
    let t: SyncHarness;
    let executive: GetExecutiveSummary;
    let summary: GetSummary;

    beforeAll(async () => {
      t = await createSyncHarness(kind);
    });
    afterAll(async () => {
      await t.close();
    });
    beforeEach(async () => {
      await t.reset();
      t.clock.set(at('2026-11-13T17:00:00Z'));
      const deps = { issues: t.app.issues, clock: t.clock, compareEnabled: true };
      executive = new GetExecutiveSummary(deps);
      summary = new GetSummary(deps);
      await t.app.issues.upsertMany([
        created('JSMCO-1', '2025-10-20T15:00:00Z'), // inside the previous year of the last 30 days
        created('JSMCO-2', '2025-04-10T15:00:00Z'), // the first record: 10 April 2025
        created('JSMCO-3', '2026-11-05T15:00:00Z'),
      ]);
    });

    it('with the switch off in the application nothing is set against the previous year', async () => {
      const off = new GetExecutiveSummary({ issues: t.app.issues, clock: t.clock });
      const result = await off.execute(exec, raw({ compare: '1' }));
      if (!result.ok) throw new Error('expected the summary');
      expect(result.value.comparison.yearOn).toBe(false);
      expect(result.value.panel.compareAvailable).toBe(false);
      expect(result.value.summary.flow.every((p) => p.previousCreated === undefined)).toBe(true);
    });

    it('sets the last 30 days against the same days of the year before', async () => {
      const result = await executive.execute(exec, raw({ compare: '1' }));
      if (!result.ok) throw new Error('expected the summary');
      const { comparison, previous, summary: data, panel } = result.value;
      expect(comparison).toMatchObject({ reference: 'previous-year', yearOn: true });
      expect(previous).toBe(comparison.previous);
      expect(previous.from).toEqual({ year: 2025, month: 10, day: 15 });
      expect(previous.to).toEqual({ year: 2025, month: 11, day: 13 });
      expect(data.created).toEqual({ current: 1, previous: 1 });
      expect(panel.filter.compare).toBe(true);
      expect(panel.filter.activeCount).toBe(1);
    });

    it('current figures do not change when the switch is turned on', async () => {
      const on = await executive.execute(exec, raw({ compare: '1' }));
      const off = await executive.execute(exec, raw());
      if (!on.ok || !off.ok) throw new Error('expected the summary');
      expect(on.value.summary.created.current).toBe(off.value.summary.created.current);
      expect(on.value.summary.resolved.current).toBe(off.value.summary.resolved.current);
      expect(on.value.summary.openNow).toBe(off.value.summary.openNow);
    });

    it('T1 has no data a year earlier: no figure, coverage none', async () => {
      const result = await executive.execute(
        exec,
        raw({ compare: '1', period: 'T1', year: '2026' }),
      );
      if (!result.ok) throw new Error('expected the summary');
      expect(result.value.comparison.volume.coverage).toBe('none');
      expect(result.value.summary.created.previous).toBeNull();
      expect(result.value.summary.previousSla).toBeNull();
    });

    it('T2 is partial: the data begins on 10 April 2025', async () => {
      const result = await summary.execute(exec, raw({ compare: '1', period: 'T2', year: '2026' }));
      if (!result.ok) throw new Error('expected the summary');
      expect(result.value.comparison.volume).toEqual({
        coverage: 'partial',
        since: { year: 2025, month: 4, day: 10 },
      });
      expect(result.value.report.previous?.created).toBe(1);
    });

    it('/resumen carries the previous year only when asked', async () => {
      const off = await summary.execute(exec, raw());
      const on = await summary.execute(exec, raw({ compare: '1' }));
      if (!off.ok || !on.ok) throw new Error('expected the summary');
      expect(off.value.report.previous).toBeNull();
      expect(on.value.report.previous).not.toBeNull();
      expect(on.value.report.created).toBe(off.value.report.created);
    });

    it('still refuses people without the section permission', async () => {
      expect(await executive.execute(PermissionSet.EMPTY, raw({ compare: '1' }))).toEqual({
        ok: false,
        error: 'forbidden',
      });
      expect(await summary.execute(PermissionSet.EMPTY, raw({ compare: '1' }))).toEqual({
        ok: false,
        error: 'forbidden',
      });
    });
  });
}
