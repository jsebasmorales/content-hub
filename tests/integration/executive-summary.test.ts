import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PermissionSet } from '@domain/access/permission-set';
import { at, snapshot } from '../support/jira-fixtures';
import { createSyncHarness, type SyncHarness } from '../support/jira-sync-harness';
import { APP_KINDS } from '../support/test-app';

/** The executive page reads the cached tickets and refuses anyone without `section.exec`. */

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
      const result = await t.app.executiveSummary.execute(PermissionSet.EMPTY);
      expect(result).toEqual({ ok: false, error: 'forbidden' });
      const other = PermissionSet.of(['section.sla']);
      expect((await t.app.executiveSummary.execute(other)).ok).toBe(false);
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

      const result = await t.app.executiveSummary.execute(PermissionSet.of(['section.exec']));
      if (!result.ok) throw new Error('expected the summary');
      expect(result.value.quarter).toEqual({ year: 2026, quarter: 4 });
      expect(result.value.created.current).toBe(2);
      expect(result.value.resolved.current).toBe(1);
      expect(result.value.openNow).toBe(1);
    });

    it('works before the first sync, with nothing to show', async () => {
      const result = await t.app.executiveSummary.execute(PermissionSet.of(['section.exec']));
      if (!result.ok) throw new Error('expected the summary');
      expect(result.value.created.current).toBe(0);
      expect(result.value.sla.goalMet).toBeNull();
    });
  });
}
