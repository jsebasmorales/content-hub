import type { TimeRange } from './quarter';
import { cycleOutcome, SLA_METRICS, type SlaMetric } from './sla';
import { cycleInPeriod } from './sla-compliance';
import type { SlaCycleRecord } from './sla-report';
import { UNASSIGNED, type FilterOption } from './task-list';
import { isDone, isObsoleteRequestType, type Ticket } from './ticket';

/** One SLA cycle that missed its goal, with what a person needs to understand and chase it. */
export interface BreachRow {
  readonly ticketKey: string;
  readonly summary: string;
  readonly requestType: string;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly metric: SlaMetric;
  /** When the goal expired, as Jira calculated it with its calendar. */
  readonly breachAt: Date | null;
  /** When the clock stopped; null while it still runs. */
  readonly endedAt: Date | null;
  /** Wall-clock time between the limit and the end (or now, for a running clock). */
  readonly overdueMs: number | null;
  readonly running: boolean;
  /** The ticket is already done but its clock never stopped, so nobody can act on it. */
  readonly ticketClosed: boolean;
}

/** The filters of the list itself. The request type is part of the global filter, not of the list. */
export interface BreachFilter {
  readonly metric: SlaMetric | null;
  readonly assigneeId: string | null;
}

export const NO_BREACH_FILTER: BreachFilter = { metric: null, assigneeId: null };

export interface BreachOptions {
  readonly metrics: readonly FilterOption[];
  readonly assignees: readonly FilterOption[];
}

export interface BreachSummary {
  readonly total: number;
  readonly byMetric: Readonly<Record<SlaMetric, number>>;
  /** Who accumulates the most breaches, most first. */
  readonly byAssignee: readonly { readonly label: string; readonly count: number }[];
  readonly byRequestType: readonly { readonly label: string; readonly count: number }[];
}

export interface BreachReport {
  /** Every breach of the period, worst delay first. Filters are applied afterwards. */
  readonly rows: readonly BreachRow[];
  readonly summary: BreachSummary;
  readonly options: BreachOptions;
}

const UNASSIGNED_LABEL = 'Sin asignar';
const TOP_COUNT = 5;

function overdue(breachAt: Date | null, endedAt: Date | null, now: Date): number | null {
  if (breachAt === null) return null;
  return Math.max(0, (endedAt ?? now).getTime() - breachAt.getTime());
}

/** Largest delay first; a breach with no known delay goes last, and the key keeps the order stable. */
const byWorstDelay = (a: BreachRow, b: BreachRow): number =>
  (b.overdueMs ?? -1) - (a.overdueMs ?? -1) || a.ticketKey.localeCompare(b.ticketKey);

function breachRows(
  records: readonly SlaCycleRecord[],
  tickets: ReadonlyMap<string, Ticket>,
  range: TimeRange,
  now: Date,
): BreachRow[] {
  const rows: BreachRow[] = [];
  for (const { ticketKey, cycle } of records) {
    const ticket = tickets.get(ticketKey);
    if (!ticket || !cycleInPeriod(cycle, range, now)) continue;
    // The same rule as the compliance figures (D-042), so this list adds up to them.
    if (cycleOutcome(cycle, now) !== 'breached') continue;
    rows.push({
      ticketKey,
      summary: ticket.summary,
      requestType: ticket.requestType,
      assigneeId: ticket.assigneeId,
      assigneeName: ticket.assigneeName,
      metric: cycle.metric,
      breachAt: cycle.breachAt,
      endedAt: cycle.stoppedAt,
      overdueMs: overdue(cycle.breachAt, cycle.stoppedAt, now),
      running: cycle.state === 'ongoing',
      ticketClosed: cycle.state === 'ongoing' && isDone(ticket),
    });
  }
  return rows.sort(byWorstDelay);
}

function countBy(
  rows: readonly BreachRow[],
  label: (row: BreachRow) => string,
): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(label(row), (counts.get(label(row)) ?? 0) + 1);
  return [...counts]
    .map(([name, count]) => ({ label: name, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'))
    .slice(0, TOP_COUNT);
}

function optionsOf(rows: readonly BreachRow[]): BreachOptions {
  const tally = (pairs: { value: string; label: string }[]): FilterOption[] => {
    const found = new Map<string, FilterOption>();
    for (const { value, label } of pairs) {
      const known = found.get(value);
      found.set(value, known ? { ...known, count: known.count + 1 } : { value, label, count: 1 });
    }
    return [...found.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'));
  };
  const assignees = tally(
    rows.flatMap((r) =>
      r.assigneeId === null ? [] : [{ value: r.assigneeId, label: r.assigneeName ?? 'Sin nombre' }],
    ),
  );
  const unassigned = rows.filter((r) => r.assigneeId === null).length;
  return {
    metrics: SLA_METRICS.map((metric) => ({
      value: metric,
      label: metric,
      count: rows.filter((r) => r.metric === metric).length,
    })),
    assignees:
      unassigned > 0
        ? [{ value: UNASSIGNED, label: UNASSIGNED_LABEL, count: unassigned }, ...assignees]
        : assignees,
  };
}

/**
 * Pure: the breaches of a period, their summary and the choices the filters offer. `records` arrive
 * already narrowed to the request types of the global filter.
 */
export function buildBreachReport(input: {
  tickets: readonly Ticket[];
  records: readonly SlaCycleRecord[];
  range: TimeRange;
  now: Date;
}): BreachReport {
  const byKey = new Map(input.tickets.map((ticket) => [ticket.key, ticket]));
  const rows = breachRows(input.records, byKey, input.range, input.now);
  return {
    rows,
    summary: {
      total: rows.length,
      byMetric: {
        first_response: rows.filter((r) => r.metric === 'first_response').length,
        done: rows.filter((r) => r.metric === 'done').length,
      },
      byAssignee: countBy(rows, (r) => r.assigneeName ?? UNASSIGNED_LABEL),
      byRequestType: countBy(
        rows.filter((r) => !isObsoleteRequestType(r.requestType)),
        (r) => r.requestType,
      ),
    },
    options: optionsOf(rows),
  };
}

const known = (
  value: string | null | undefined,
  options: readonly FilterOption[],
): string | null =>
  value !== null && value !== undefined && options.some((option) => option.value === value)
    ? value
    : null;

/** Keeps only filter values that exist among the period's breaches; anything else is dropped. */
export function sanitizeBreachFilter(
  raw: Partial<Record<keyof BreachFilter, string | null | undefined>>,
  options: BreachOptions,
): BreachFilter {
  const metric = known(raw.metric, options.metrics);
  return {
    metric: SLA_METRICS.find((candidate) => candidate === metric) ?? null,
    assigneeId: known(raw.assigneeId, options.assignees),
  };
}

export function matchesBreachFilter(row: BreachRow, filter: BreachFilter): boolean {
  if (filter.metric !== null && row.metric !== filter.metric) return false;
  if (filter.assigneeId === UNASSIGNED) return row.assigneeId === null;
  return filter.assigneeId === null || row.assigneeId === filter.assigneeId;
}
