import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PermissionSet } from '@domain/access/permission-set';
import type { IssueSnapshot } from '@application/ports/jira';
import { at, snapshot } from '../support/jira-fixtures';
import { createSyncHarness, type SyncHarness } from '../support/jira-sync-harness';
import { APP_KINDS } from '../support/test-app';

/** /sla: needs `section.sla`, reads cached cycles and honours the period asked for. */

const allowed = PermissionSet.of(['section.sla']);

/** A ticket whose only SLA cycle is a running "done" clock with the given limit. */
function running(key: string, breachAt: string, paused = false): IssueSnapshot {
  const base = snapshot(key, '2026-11-10T10:00:00Z');
  return {
    ...base,
    slaCycles: [
      {
        metric: 'done',
        state: 'ongoing',
        startedAt: at('2026-11-02T10:00:00Z'),
        stoppedAt: null,
        breachAt: at(breachAt),
        breached: false,
        paused,
      },
    ],
  };
}

for (const kind of APP_KINDS) {
  describe(`GetSlaReport: ${kind}`, () => {
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
      expect(await t.app.slaReport.execute(PermissionSet.EMPTY, {})).toEqual({
        ok: false,
        error: 'forbidden',
      });
      const other = PermissionSet.of(['section.exec']);
      expect((await t.app.slaReport.execute(other, {})).ok).toBe(false);
    });

    it('reports the current quarter by default', async () => {
      await t.app.issues.upsertMany([snapshot('JSMCO-1', '2026-11-05T10:00:00Z', 'Done')]);
      const result = await t.app.slaReport.execute(allowed, {});
      if (!result.ok) throw new Error('expected the report');
      expect(result.value.resolved.period).toMatchObject({
        kind: 'quarter',
        quarter: { year: 2026, quarter: 4 },
      });
      const done = result.value.report.overall.metrics.find((m) => m.metric === 'done');
      expect(done).toMatchObject({ met: 1, total: 1, ratePercent: 100 });
      expect(result.value.quarters).toHaveLength(6);
      expect(result.value.now).toEqual(t.clock.now());
    });

    it('honours a custom period and a quick quarter, and says when it ignored one', async () => {
      await t.app.issues.upsertMany([snapshot('JSMCO-1', '2026-11-05T10:00:00Z', 'Done')]);
      const run = async (raw: Record<string, string>) => {
        const result = await t.app.slaReport.execute(allowed, raw);
        if (!result.ok) throw new Error('expected the report');
        return result.value;
      };

      const outside = await run({ from: '2026-10-01', to: '2026-10-31' });
      expect(outside.report.overall.goalMet).toBeNull();

      const inside = await run({ from: '2026-11-01', to: '2026-11-30' });
      expect(inside.report.overall.metrics.find((m) => m.metric === 'done')?.total).toBe(1);

      const past = await run({ quarter: '2026-T3' });
      expect(past.resolved.period).toMatchObject({ quarter: { year: 2026, quarter: 3 } });

      const bogus = await run({ from: 'ayer', to: 'hoy' });
      expect(bogus.resolved.ignored).toBe(true);
    });

    it('lists running clocks, most urgent first, and counts paused ones apart', async () => {
      await t.app.issues.upsertMany([
        running('JSMCO-1', '2026-11-14T10:00:00Z'),
        running('JSMCO-2', '2026-11-10T10:00:00Z'),
        running('JSMCO-3', '2026-11-20T10:00:00Z', true),
      ]);
      const result = await t.app.slaReport.execute(allowed, { quarter: '2026-T1' });
      if (!result.ok) throw new Error('expected the report');
      expect(result.value.report.ongoing.map((c) => [c.ticketKey, c.breached])).toEqual([
        ['JSMCO-2', true],
        ['JSMCO-1', false],
      ]);
      expect(result.value.report.pausedCount).toBe(1);
    });

    it('works before the first sync', async () => {
      const result = await t.app.slaReport.execute(allowed, {});
      if (!result.ok) throw new Error('expected the report');
      expect(result.value.report.overall.goalMet).toBeNull();
      expect(result.value.report.ongoing).toEqual([]);
    });
  });
}
