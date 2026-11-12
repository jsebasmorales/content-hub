import { cycleOutcome, SLA_METRICS, type SlaCycle, type SlaMetric } from '@domain/jira/sla';
import type { Ticket } from '@domain/jira/ticket';
import { slaFieldSchema } from './jira-schemas';

/** A ticket exactly as Jira answers, before the Hub maps anything. */
export interface RawIssue {
  readonly key: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

/** What the Hub holds for that ticket. */
export interface CachedIssue {
  readonly ticket: Ticket;
  readonly cycles: readonly SlaCycle[];
}

export interface SlaFieldIds {
  readonly firstResponse: string;
  readonly done: string;
}

export interface Difference {
  readonly field: string;
  readonly hub: string;
  readonly jira: string;
}

/**
 * - `match`: every field agrees.
 * - `stale`: the ticket changed in Jira after the last sync, so differences are expected and say
 *   "synchronise", not "there is a bug".
 * - `mismatch`: it did not change since the sync, yet the Hub disagrees with Jira.
 */
export type Verdict = 'match' | 'stale' | 'mismatch';

export interface Comparison {
  readonly key: string;
  readonly verdict: Verdict;
  readonly differences: readonly Difference[];
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

/** A date the way Jira writes it ("2026-04-16T15:07:58.736+0200"), read without the Hub's parser. */
const epoch = (value: unknown): number | null => {
  const raw = text(value);
  if (raw === null) return null;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
};

const show = (value: string | number | boolean | null): string =>
  value === null ? '(vacío)' : String(value);
const showTime = (ms: number | null): string =>
  ms === null ? '(vacío)' : new Date(ms).toISOString();

interface RawCycle {
  readonly ongoing: boolean;
  readonly startMs: number;
  readonly stopMs: number | null;
  readonly breachMs: number | null;
  readonly breached: boolean;
  readonly paused: boolean;
}

function rawCycles(value: unknown): RawCycle[] {
  const parsed = slaFieldSchema.safeParse(value);
  if (!parsed.success || !parsed.data) return [];
  const done = parsed.data.completedCycles.map((cycle) => ({
    ongoing: false,
    startMs: cycle.startTime.epochMillis,
    stopMs: cycle.stopTime?.epochMillis ?? null,
    breachMs: cycle.breachTime?.epochMillis ?? null,
    breached: cycle.breached,
    paused: false,
  }));
  const open = parsed.data.ongoingCycle;
  const running = open
    ? [
        {
          ongoing: true,
          startMs: open.startTime.epochMillis,
          stopMs: null,
          breachMs: open.breachTime?.epochMillis ?? null,
          breached: open.breached,
          paused: open.paused ?? false,
        },
      ]
    : [];
  return [...done, ...running].sort((a, b) => a.startMs - b.startMs);
}

/** How a cycle counts, worked out here from Jira's own flags and not from the Hub's code. */
function rawOutcome(cycle: RawCycle, now: Date): 'met' | 'breached' | 'excluded' {
  if (!cycle.ongoing) return cycle.breached ? 'breached' : 'met';
  if (cycle.breached) return 'breached';
  if (cycle.paused) return 'excluded';
  return cycle.breachMs !== null && cycle.breachMs <= now.getTime() ? 'breached' : 'excluded';
}

function compareTicketFields(raw: RawIssue, ticket: Ticket): Difference[] {
  const fields = raw.fields;
  const status = record(fields['status']);
  const category = text(record(status['statusCategory'])['key']);
  const assignee = text(record(fields['assignee'])['displayName']);
  const reporter = text(record(fields['reporter'])['displayName']);
  const rawDone = category === 'done';
  const finished = epoch(fields['resolutiondate']) ?? epoch(fields['statuscategorychangedate']);
  const rawResolved = rawDone ? finished : null;

  const pairs: [string, string | number | null, string | number | null][] = [
    ['Resumen', ticket.summary, text(fields['summary'])],
    ['Estado', ticket.status, text(status['name'])],
    [
      'Categoría del estado',
      ticket.statusCategory,
      category === 'new' || category === 'done' ? category : 'indeterminate',
    ],
    ['Tipo de solicitud', ticket.requestType, text(record(fields['issuetype'])['name'])],
    ['Responsable', ticket.assigneeName, assignee],
    ['Solicitante', ticket.requesterName, reporter],
    ['Creado', ticket.createdAt.getTime(), epoch(fields['created'])],
    ['Fecha de finalización', ticket.resolvedAt?.getTime() ?? null, rawResolved],
  ];
  return pairs
    .filter(([, hub, jira]) => hub !== jira)
    .map(([field, hub, jira]) => {
      const timeField = field === 'Creado' || field === 'Fecha de finalización';
      const render = (v: string | number | null) =>
        timeField ? showTime(typeof v === 'number' ? v : null) : show(v);
      return { field, hub: render(hub), jira: render(jira) };
    });
}

const LABEL: Readonly<Record<SlaMetric, string>> = {
  first_response: 'Primera respuesta',
  done: 'Resolución',
};

/** How one pair of cycles (the Hub's and Jira's) differs, field by field. */
function cycleDifferences(
  label: string,
  index: number,
  mine: SlaCycle,
  jira: RawCycle,
  now: Date,
): Difference[] {
  const where = `${label}, ciclo ${String(index + 1)}`;
  const pairs: [string, string | number | boolean | null, string | number | boolean | null][] = [
    ['inicio', mine.startedAt.getTime(), jira.startMs],
    ['fin', mine.stoppedAt?.getTime() ?? null, jira.stopMs],
    ['límite', mine.breachAt?.getTime() ?? null, jira.breachMs],
    ['incumplido según Jira', mine.breached, jira.breached],
    ['en pausa', mine.paused, jira.paused],
    ['en curso', mine.state === 'ongoing', jira.ongoing],
  ];
  // The limit of a PAUSED clock is only a projection that Jira recalculates every time it is read
  // ("if the clock restarted at the next working hour"), so two readings seconds apart give two
  // values. The Hub does not use it (paused clocks are neither counted nor listed, D-042), so a
  // difference there says nothing about the stored data.
  const projected = jira.ongoing && jira.paused;
  const differences = pairs
    .filter(([name, a, b]) => a !== b && !(projected && name === 'límite'))
    .map(([name, a, b]): Difference => {
      const timeLike = name === 'inicio' || name === 'fin' || name === 'límite';
      return {
        field: `${where}: ${name}`,
        hub: timeLike ? showTime(typeof a === 'number' ? a : null) : show(a),
        jira: timeLike ? showTime(typeof b === 'number' ? b : null) : show(b),
      };
    });
  const expected = rawOutcome(jira, now);
  const actual = cycleOutcome(mine, now);
  if (expected !== actual) {
    differences.push({ field: `${where}: cómo cuenta`, hub: actual, jira: expected });
  }
  return differences;
}

function compareCycles(
  metric: SlaMetric,
  raw: readonly RawCycle[],
  cached: readonly SlaCycle[],
  now: Date,
): Difference[] {
  const hub = cached
    .filter((cycle) => cycle.metric === metric)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  if (hub.length !== raw.length) {
    const field = `${LABEL[metric]}: número de ciclos`;
    return [{ field, hub: String(hub.length), jira: String(raw.length) }];
  }
  return raw.flatMap((jira, index) => {
    const mine = hub[index];
    return mine ? cycleDifferences(LABEL[metric], index, mine, jira, now) : [];
  });
}

/**
 * Compares one ticket as Jira answers it now with what the Hub has stored. The expected values are
 * worked out here from Jira's raw answer, not with the Hub's mapping code, so a mistake in that code
 * cannot hide itself.
 */
export function compareIssue(
  raw: RawIssue,
  cached: CachedIssue,
  fields: SlaFieldIds,
  now: Date,
): Comparison {
  const differences = [
    ...compareTicketFields(raw, cached.ticket),
    ...SLA_METRICS.flatMap((metric) =>
      compareCycles(
        metric,
        rawCycles(raw.fields[metric === 'first_response' ? fields.firstResponse : fields.done]),
        cached.cycles,
        now,
      ),
    ),
  ];
  if (differences.length === 0) return { key: raw.key, verdict: 'match', differences };
  // Anything differing is expected when Jira changed the ticket after the last sync.
  const changedSince = epoch(raw.fields['updated']) !== cached.ticket.updatedAt.getTime();
  return { key: raw.key, verdict: changedSince ? 'stale' : 'mismatch', differences };
}

/** Cycles that count as met and as breached, for one metric. */
export interface RawTally {
  readonly met: number;
  readonly breached: number;
}

/**
 * Counts SLA compliance for a period straight from Jira's raw answers, with a few lines of its own
 * and none of the Hub's aggregation code, so it can be set beside the Hub's figures. A cycle that
 * ended counts in the period it ended in; a running one counts in the period that contains `now`.
 */
export function rawCompliance(
  issues: readonly RawIssue[],
  fields: SlaFieldIds,
  range: { readonly from: Date; readonly to: Date },
  now: Date,
): Readonly<Record<SlaMetric, RawTally>> {
  const tally = (metric: SlaMetric): RawTally => {
    let met = 0;
    let breached = 0;
    const id = metric === 'first_response' ? fields.firstResponse : fields.done;
    for (const issue of issues) {
      for (const cycle of rawCycles(issue.fields[id])) {
        const reference = cycle.ongoing ? now.getTime() : cycle.stopMs;
        if (
          reference === null ||
          reference < range.from.getTime() ||
          reference >= range.to.getTime()
        ) {
          continue;
        }
        const outcome = rawOutcome(cycle, now);
        if (outcome === 'met') met += 1;
        else if (outcome === 'breached') breached += 1;
      }
    }
    return { met, breached };
  };
  return { first_response: tally('first_response'), done: tally('done') };
}
