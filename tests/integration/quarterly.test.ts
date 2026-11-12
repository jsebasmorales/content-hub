import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PermissionSet } from '@domain/access/permission-set';
import { snapshot } from '../support/jira-fixtures';
import { createSyncHarness, type SyncHarness } from '../support/jira-sync-harness';
import { APP_KINDS } from '../support/test-app';

/** /trimestres: needs `section.qoq` and reads tickets and SLA cycles. */

const allowed = PermissionSet.of(['section.qoq']);

for (const kind of APP_KINDS) {
  describe(`GetQuarterlyReport: ${kind}`, () => {
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
      expect(await t.app.quarterly.execute(PermissionSet.EMPTY)).toEqual({
        ok: false,
        error: 'forbidden',
      });
      expect((await t.app.quarterly.execute(PermissionSet.of(['section.sla']))).ok).toBe(false);
    });

    it('reports the quarter that holds the cached tickets', async () => {
      await t.app.issues.upsertMany([
        snapshot('JSMCO-1', '2026-11-05T10:00:00Z', 'Done'),
        snapshot('JSMCO-2', '2026-11-06T10:00:00Z'),
      ]);
      const result = await t.app.quarterly.execute(allowed);
      if (!result.ok) throw new Error('expected the report');
      const [only] = result.value.quarters;
      expect(result.value.quarters).toHaveLength(1);
      expect(only).toMatchObject({ inProgress: true, created: 2 });
      expect(only?.sla.metrics.find((m) => m.metric === 'done')).toMatchObject({ met: 2 });
    });

    it('works before the first sync', async () => {
      const result = await t.app.quarterly.execute(allowed);
      if (!result.ok) throw new Error('expected the report');
      expect(result.value.quarters).toEqual([]);
    });
  });
}
