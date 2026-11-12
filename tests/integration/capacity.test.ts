import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PermissionSet } from '@domain/access/permission-set';
import type { IssueSnapshot } from '@application/ports/jira';
import { GetCapacity } from '@application/use-cases/jira/get-capacity';
import { snapshot } from '../support/jira-fixtures';
import { createSyncHarness, type SyncHarness } from '../support/jira-sync-harness';
import { APP_KINDS } from '../support/test-app';

/** /capacidad: needs `section.capacity`, reads the cached tickets and studies only the team. */

const allowed = PermissionSet.of(['section.capacity']);

/** An open ticket for the given person (or nobody). */
function open(key: string, person: string | null): IssueSnapshot {
  const base = snapshot(key, '2026-11-05T10:00:00Z');
  return {
    ...base,
    ticket: {
      ...base.ticket,
      assigneeId: person ? `id-${person}` : null,
      assigneeName: person,
    },
  };
}

for (const kind of APP_KINDS) {
  describe(`GetCapacity: ${kind}`, () => {
    let t: SyncHarness;
    /** The same use case over this adapter's tickets, with a team made for the test. */
    const capacity = (team: readonly string[]) =>
      new GetCapacity({ issues: t.app.issues, clock: t.clock, team });

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
      expect(await t.app.capacity.execute(PermissionSet.EMPTY)).toEqual({
        ok: false,
        error: 'forbidden',
      });
      expect((await t.app.capacity.execute(PermissionSet.of(['section.sla']))).ok).toBe(false);
    });

    it('spreads the open work over the team and names the people left out', async () => {
      await t.app.issues.upsertMany([
        open('JSMCO-1', 'Ana'),
        open('JSMCO-2', 'Ana'),
        open('JSMCO-3', 'Ana'),
        open('JSMCO-4', 'Beto'),
        open('JSMCO-5', null),
        open('JSMCO-6', 'Maciej'),
      ]);
      const result = await capacity(['Ana', 'Beto', 'Carla']).execute(allowed);
      if (!result.ok) throw new Error('expected the report');
      expect(result.value.people.map((p) => [p.name, p.open])).toEqual([
        ['Ana', 3],
        ['Beto', 1],
        ['Carla', 0],
      ]);
      expect(result.value.averageLoad).toBeCloseTo(1.3, 1);
      expect(result.value.unassignedOpen).toBe(1);
      expect(result.value.outside).toEqual([{ name: 'Maciej', open: 1 }]);
    });

    it('uses the configured team by default', async () => {
      const result = await t.app.capacity.execute(allowed);
      if (!result.ok) throw new Error('expected the report');
      expect(result.value.people.map((p) => p.name)).toEqual([
        'Andres Montagut',
        'Bon Thatthana',
        'Juan José Gabelo',
        'Maria Fernanda Barrera',
        'Paula Yeyati',
        'Sebastian Hernandez',
      ]);
      expect(result.value.averageLoad).toBe(0);
    });
  });
}
