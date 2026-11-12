import { describe, expect, it } from 'vitest';
import type { SlaCycle, SlaMetric } from '@domain/jira/sla';
import type { Ticket } from '@domain/jira/ticket';
import { buildSlaReport } from '@domain/jira/sla-report';
import {
  compareIssue,
  rawCompliance,
  type CachedIssue,
  type RawIssue,
} from '@infrastructure/jira/sample-compare';
import {
  SAMPLE_SIZE,
  chooseSample,
  type SampleCandidate,
} from '@infrastructure/jira/sample-selection';

const at = (iso: string): Date => new Date(iso);
const now = at('2026-11-12T15:00:00Z');
const FIELDS = { firstResponse: 'customfield_1', done: 'customfield_2' };

function ticket(key: string, overrides: Partial<Ticket> = {}): Ticket {
  return {
    key,
    summary: `Resumen de ${key}`,
    status: 'Done',
    statusCategory: 'done',
    requestType: 'Edit',
    priority: null,
    assigneeId: 'a1',
    assigneeName: 'Ana',
    requesterId: 'r1',
    requesterName: 'Raúl',
    createdAt: at('2026-10-01T10:00:00Z'),
    resolvedAt: at('2026-10-10T10:00:00Z'),
    updatedAt: at('2026-10-10T10:00:00Z'),
    ...overrides,
  };
}

function cycle(metric: SlaMetric, overrides: Partial<SlaCycle> = {}): SlaCycle {
  return {
    metric,
    state: 'completed',
    startedAt: at('2026-10-01T10:00:00Z'),
    stoppedAt: at('2026-10-05T10:00:00Z'),
    breachAt: at('2026-10-06T10:00:00Z'),
    breached: false,
    paused: false,
    ...overrides,
  };
}

const rawCycle = (start: string, stop: string | null, breach: string | null, extra = {}) => ({
  startTime: { epochMillis: at(start).getTime() },
  stopTime: stop === null ? null : { epochMillis: at(stop).getTime() },
  breachTime: breach === null ? null : { epochMillis: at(breach).getTime() },
  breached: false,
  ...extra,
});

/** A Jira answer that agrees with `ticket('A')` and the two cycles of `cycle()`. */
function raw(overrides: Record<string, unknown> = {}): RawIssue {
  const start = '2026-10-01T10:00:00Z';
  return {
    key: 'A',
    fields: {
      summary: 'Resumen de A',
      status: { name: 'Done', statusCategory: { key: 'done' } },
      issuetype: { name: 'Edit' },
      assignee: { displayName: 'Ana' },
      reporter: { displayName: 'Raúl' },
      created: '2026-10-01T10:00:00.000+0000',
      updated: '2026-10-10T10:00:00.000+0000',
      resolutiondate: null,
      statuscategorychangedate: '2026-10-10T10:00:00.000+0000',
      [FIELDS.firstResponse]: {
        completedCycles: [rawCycle(start, '2026-10-05T10:00:00Z', '2026-10-06T10:00:00Z')],
      },
      [FIELDS.done]: {
        completedCycles: [rawCycle(start, '2026-10-05T10:00:00Z', '2026-10-06T10:00:00Z')],
      },
      ...overrides,
    },
  };
}

const cached = (overrides: Partial<CachedIssue> = {}): CachedIssue => ({
  ticket: ticket('A'),
  cycles: [cycle('first_response'), cycle('done')],
  ...overrides,
});

describe('compareIssue', () => {
  it('says "match" when every field agrees', () => {
    expect(compareIssue(raw(), cached(), FIELDS, now)).toEqual({
      key: 'A',
      verdict: 'match',
      differences: [],
    });
  });

  it('catches a field the Hub stored wrongly, and says which and with what values', () => {
    const result = compareIssue(
      raw(),
      cached({ ticket: ticket('A', { status: 'In progress' }) }),
      FIELDS,
      now,
    );
    expect(result.verdict).toBe('mismatch');
    expect(result.differences).toContainEqual({
      field: 'Estado',
      hub: 'In progress',
      jira: 'Done',
    });
  });

  it('notices a wrong person, type, summary and creation date', () => {
    const result = compareIssue(
      raw(),
      cached({
        ticket: ticket('A', {
          assigneeName: 'Beto',
          requestType: 'Translate',
          summary: 'Otro',
          createdAt: at('2026-09-30T10:00:00Z'),
        }),
      }),
      FIELDS,
      now,
    );
    expect(result.differences.map((d) => d.field).sort()).toEqual(
      ['Creado', 'Resumen', 'Responsable', 'Tipo de solicitud'].sort(),
    );
  });

  it('expects the finish date to be when the ticket entered Done, and nothing for an open ticket', () => {
    const wrong = compareIssue(
      raw(),
      cached({ ticket: ticket('A', { resolvedAt: null }) }),
      FIELDS,
      now,
    );
    expect(wrong.differences.map((d) => d.field)).toEqual(['Fecha de finalización']);

    const open = raw({
      status: { name: 'To Do', statusCategory: { key: 'new' } },
      statuscategorychangedate: '2026-10-02T10:00:00.000+0000',
    });
    const hub = ticket('A', { status: 'To Do', statusCategory: 'new', resolvedAt: null });
    expect(compareIssue(open, cached({ ticket: hub }), FIELDS, now).differences).toEqual([]);
  });

  it('catches an SLA cycle the Hub flagged differently from Jira', () => {
    const result = compareIssue(
      raw(),
      cached({ cycles: [cycle('first_response', { breached: true }), cycle('done')] }),
      FIELDS,
      now,
    );
    const fields = result.differences.map((d) => d.field);
    expect(fields).toContain('Primera respuesta, ciclo 1: incumplido según Jira');
    expect(fields).toContain('Primera respuesta, ciclo 1: cómo cuenta');
  });

  it('catches a missing cycle', () => {
    const result = compareIssue(raw(), cached({ cycles: [cycle('first_response')] }), FIELDS, now);
    expect(result.differences).toContainEqual({
      field: 'Resolución: número de ciclos',
      hub: '0',
      jira: '1',
    });
  });

  it('agrees on a running clock that is past its limit, whether or not Jira had flagged it yet', () => {
    const start = '2026-10-01T10:00:00Z';
    const late = raw({
      [FIELDS.done]: {
        completedCycles: [],
        ongoingCycle: rawCycle(start, null, '2026-10-20T10:00:00Z', { paused: false }),
      },
    });
    const hubCycle = cycle('done', {
      state: 'ongoing',
      stoppedAt: null,
      breachAt: at('2026-10-20T10:00:00Z'),
    });
    const result = compareIssue(
      late,
      cached({ cycles: [cycle('first_response'), hubCycle] }),
      FIELDS,
      now,
    );
    expect(result.differences).toEqual([]);
  });

  it('does not count a paused clock’s limit, which Jira recalculates on every reading', () => {
    const start = '2026-10-01T10:00:00Z';
    const paused = raw({
      [FIELDS.done]: {
        completedCycles: [],
        ongoingCycle: rawCycle(start, null, '2026-12-10T15:58:18Z', { paused: true }),
      },
    });
    const hubCycle = cycle('done', {
      state: 'ongoing',
      stoppedAt: null,
      paused: true,
      breachAt: at('2026-12-10T14:08:16Z'),
    });
    expect(
      compareIssue(paused, cached({ cycles: [cycle('first_response'), hubCycle] }), FIELDS, now)
        .differences,
    ).toEqual([]);
  });

  it('still counts the limit of a running clock, which the Hub does use', () => {
    const start = '2026-10-01T10:00:00Z';
    const running = raw({
      [FIELDS.done]: {
        completedCycles: [],
        ongoingCycle: rawCycle(start, null, '2026-12-10T15:58:18Z', { paused: false }),
      },
    });
    const hubCycle = cycle('done', {
      state: 'ongoing',
      stoppedAt: null,
      breachAt: at('2026-12-10T14:08:16Z'),
    });
    const fields = compareIssue(
      running,
      cached({ cycles: [cycle('first_response'), hubCycle] }),
      FIELDS,
      now,
    ).differences.map((d) => d.field);
    expect(fields).toContain('Resolución, ciclo 1: límite');
  });

  it('calls it "stale", not a bug, when the ticket changed in Jira after the last sync', () => {
    const changedLater = raw({
      status: { name: 'Reopened', statusCategory: { key: 'indeterminate' } },
      updated: '2026-11-12T09:00:00.000+0000',
    });
    const result = compareIssue(changedLater, cached(), FIELDS, now);
    expect(result.verdict).toBe('stale');
    expect(result.differences.length).toBeGreaterThan(0);
  });
});

describe('chooseSample', () => {
  const types = ['Edit', 'Translate', 'UX Writing', 'Launch', 'Landing', "Old - DON'T USE"];
  const candidates: SampleCandidate[] = Array.from({ length: 240 }, (_, i) => {
    const key = `T-${String(i)}`;
    const type = types[i % types.length] ?? 'Edit';
    const month = ((i * 7) % 18) + 1;
    const created = new Date(Date.UTC(2025, month, 5, 10));
    const open = i % 3 === 0;
    const base = ticket(key, {
      requestType: type,
      createdAt: created,
      status: open ? 'To Do' : 'Done',
      statusCategory: open ? 'new' : 'done',
      resolvedAt: open ? null : new Date(created.getTime() + 5 * 86_400_000),
      assigneeId: i % 11 === 0 ? null : 'a1',
    });
    const cycles: SlaCycle[] = open
      ? [
          cycle('first_response'),
          cycle('done', {
            state: 'ongoing',
            stoppedAt: null,
            paused: i % 2 === 0,
            breachAt: new Date(created.getTime() + 86_400_000),
          }),
        ]
      : [
          cycle('first_response', { breached: i % 5 === 0 }),
          cycle('done', { breached: i % 7 === 0 }),
        ];
    return { ticket: base, cycles };
  });

  it('never goes over the size asked, and gives distinct tickets', () => {
    const sample = chooseSample(candidates, now);
    expect(SAMPLE_SIZE).toBe(30);
    expect(sample.length).toBeLessThanOrEqual(SAMPLE_SIZE);
    expect(new Set(sample.map((s) => s.key)).size).toBe(sample.length);
  });

  it('is repeatable: the same cache gives the same sample', () => {
    expect(chooseSample(candidates, now)).toEqual(chooseSample([...candidates].reverse(), now));
  });

  it('covers the situations worth checking and says why each ticket is there', () => {
    const reasons = chooseSample(candidates, now).flatMap((s) => s.reasons);
    for (const wanted of [
      'Cerrado y con las dos métricas cumplidas',
      'Cerrado con la Resolución incumplida',
      'Con la Primera respuesta incumplida',
      'Abierto con un reloj corriendo y ya vencido',
      'Abierto con un reloj en pausa',
      'Abierto y sin empezar',
      'Sin responsable',
      'De un tipo de solicitud retirado',
    ]) {
      expect(reasons, wanted).toContain(wanted);
    }
  });

  it('includes every kind of request in the data', () => {
    const chosen = new Set(chooseSample(candidates, now).map((s) => s.key));
    const kinds = new Set(
      candidates.filter((c) => chosen.has(c.ticket.key)).map((c) => c.ticket.requestType),
    );
    expect(kinds.size).toBe(types.length);
  });

  it('copes with a cache too small to fill the sample, or empty', () => {
    expect(chooseSample(candidates.slice(0, 5), now).length).toBeLessThanOrEqual(5);
    expect(chooseSample([], now)).toEqual([]);
  });
});

describe('rawCompliance (the recount made straight from Jira’s answers)', () => {
  const q4 = { from: at('2026-10-01T05:00:00Z'), to: at('2027-01-01T05:00:00Z') };
  const issues: RawIssue[] = [
    // Ended in the quarter: one met, one breached.
    {
      key: 'B-1',
      fields: {
        [FIELDS.firstResponse]: {
          completedCycles: [
            rawCycle('2026-10-01T10:00:00Z', '2026-10-05T10:00:00Z', '2026-10-06T10:00:00Z'),
          ],
        },
        [FIELDS.done]: {
          completedCycles: [
            rawCycle('2026-10-01T10:00:00Z', '2026-10-09T10:00:00Z', '2026-10-06T10:00:00Z', {
              breached: true,
            }),
          ],
        },
      },
    },
    // Ended in the previous quarter: not counted here.
    {
      key: 'B-2',
      fields: {
        [FIELDS.done]: {
          completedCycles: [
            rawCycle('2026-08-01T10:00:00Z', '2026-08-09T10:00:00Z', '2026-08-06T10:00:00Z', {
              breached: true,
            }),
          ],
        },
      },
    },
    // Running, past its limit and not paused: counts as breached. A paused one does not count.
    {
      key: 'B-3',
      fields: {
        [FIELDS.firstResponse]: {
          completedCycles: [],
          ongoingCycle: rawCycle('2026-10-01T10:00:00Z', null, '2026-10-20T10:00:00Z', {
            paused: false,
          }),
        },
        [FIELDS.done]: {
          completedCycles: [],
          ongoingCycle: rawCycle('2026-10-01T10:00:00Z', null, '2026-10-20T10:00:00Z', {
            paused: true,
          }),
        },
      },
    },
    // Running and still inside its limit: not decided, so not counted.
    {
      key: 'B-4',
      fields: {
        [FIELDS.done]: {
          completedCycles: [],
          ongoingCycle: rawCycle('2026-11-01T10:00:00Z', null, '2026-12-20T10:00:00Z', {
            paused: false,
          }),
        },
      },
    },
  ];

  it('counts what ended in the period, and a running clock only once it is late and not paused', () => {
    expect(rawCompliance(issues, FIELDS, q4, now)).toEqual({
      first_response: { met: 1, breached: 1 },
      done: { met: 0, breached: 1 },
    });
  });

  it('gives the same figures as the Hub’s own aggregation over the same cycles', () => {
    const records = [
      {
        ticketKey: 'B-1',
        cycle: cycle('first_response', { stoppedAt: at('2026-10-05T10:00:00Z') }),
      },
      {
        ticketKey: 'B-1',
        cycle: cycle('done', { stoppedAt: at('2026-10-09T10:00:00Z'), breached: true }),
      },
      {
        ticketKey: 'B-3',
        cycle: cycle('first_response', {
          state: 'ongoing',
          stoppedAt: null,
          breachAt: at('2026-10-20T10:00:00Z'),
        }),
      },
    ];
    const tickets = ['B-1', 'B-3'].map((key) => ticket(key));
    const hub = buildSlaReport({ tickets, records, range: q4, now }).overall.metrics;
    const theirs = rawCompliance(issues, FIELDS, q4, now);
    const pick = (metric: SlaMetric) => hub.find((m) => m.metric === metric);
    expect(pick('first_response')).toMatchObject(theirs.first_response);
    expect(pick('done')).toMatchObject(theirs.done);
  });
});
