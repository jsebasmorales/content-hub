import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PermissionSet } from '@domain/access/permission-set';
import { snapshot } from '../support/jira-fixtures';
import { createSyncHarness, type SyncHarness } from '../support/jira-sync-harness';
import { APP_KINDS } from '../support/test-app';

/** /definiciones: every role has `section.defs`; the live part is the cut-off date and the counts. */

const allowed = PermissionSet.of(['section.defs']);

for (const kind of APP_KINDS) {
  describe(`GetDefinitionsData: ${kind}`, () => {
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
      expect(await t.app.definitions.execute(PermissionSet.EMPTY)).toEqual({
        ok: false,
        error: 'forbidden',
      });
      expect((await t.app.definitions.execute(PermissionSet.of(['section.sla']))).ok).toBe(false);
    });

    it('gives the cut-off date and the counts of what is stored', async () => {
      t.jira.setIssues([
        snapshot('JSMCO-1', '2026-11-01T10:00:00Z', 'Done'),
        snapshot('JSMCO-2', '2026-11-02T10:00:00Z'),
      ]);
      await t.app.runSync.execute({ kind: 'manual', mode: 'incremental' });
      const result = await t.app.definitions.execute(allowed);
      if (!result.ok) throw new Error('expected the data');
      expect(result.value.status.lastUpdateAt).toEqual(t.clock.now());
      expect(result.value.quality).toMatchObject({ tickets: 2, openTickets: 1 });
    });

    it('works before the first sync', async () => {
      const result = await t.app.definitions.execute(allowed);
      if (!result.ok) throw new Error('expected the data');
      expect(result.value.status.lastUpdateAt).toBeNull();
      expect(result.value.quality.tickets).toBe(0);
    });

    it('shares only counts: no ticket or person can be read from it', async () => {
      await t.app.issues.upsertMany([snapshot('JSMCO-1', '2026-11-01T10:00:00Z')]);
      const result = await t.app.definitions.execute(allowed);
      if (!result.ok) throw new Error('expected the data');
      const serialised = JSON.stringify(result.value);
      expect(serialised).not.toContain('JSMCO-1');
      expect(serialised).not.toContain('Ana Asignada');
    });
  });
}
