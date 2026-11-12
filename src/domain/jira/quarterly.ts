import { createdIn, medianResolutionDays, resolvedIn } from './executive-summary';
import {
  REPORTING_TIME_ZONE,
  previousQuarter,
  quarterOf,
  quarterRange,
  type Quarter,
} from './quarter';
import type { SlaCycle } from './sla';
import { cycleInPeriod, slaCompliance, type SlaCompliance } from './sla-compliance';
import type { Ticket } from './ticket';

const DAY_MS = 86_400_000;
/** How many quarters the page looks back, the current one included: two years. */
export const QUARTERS_SHOWN = 8;

export interface QuarterStats {
  readonly quarter: Quarter;
  /** The quarter is still running, so its figures are partial. */
  readonly inProgress: boolean;
  /** Days of the quarter that have passed, for the one in progress. */
  readonly elapsedDays: number | null;
  readonly created: number;
  readonly resolved: number;
  /** Median days from creation to resolution of what was resolved in the quarter. */
  readonly resolutionDays: number | null;
  readonly sla: SlaCompliance;
}

export interface QuarterlyReport {
  /** Oldest first, starting at the first quarter with anything to show and ending with the current one. */
  readonly quarters: readonly QuarterStats[];
}

function statsFor(
  quarter: Quarter,
  input: { tickets: readonly Ticket[]; cycles: readonly SlaCycle[]; now: Date },
  zone: string,
  current: Quarter,
): QuarterStats {
  const { tickets, cycles, now } = input;
  const range = quarterRange(quarter, zone);
  const inProgress = quarter.year === current.year && quarter.quarter === current.quarter;
  return {
    quarter,
    inProgress,
    elapsedDays: inProgress
      ? Math.max(1, Math.ceil((now.getTime() - range.from.getTime()) / DAY_MS))
      : null,
    created: createdIn(tickets, range).length,
    resolved: resolvedIn(tickets, range).length,
    resolutionDays: medianResolutionDays(resolvedIn(tickets, range)),
    sla: slaCompliance(
      cycles.filter((cycle) => cycleInPeriod(cycle, range, now)),
      now,
    ),
  };
}

const hasData = (stats: QuarterStats): boolean =>
  stats.created > 0 || stats.resolved > 0 || stats.sla.metrics.some((m) => m.total > 0);

/**
 * Pure: the same figures for each of the last quarters, so they can be read side by side. Every
 * quarter is shown whole, and the one in progress is marked as partial instead of being compared
 * with a finished one.
 */
export function buildQuarterlyReport(
  input: { tickets: readonly Ticket[]; cycles: readonly SlaCycle[]; now: Date },
  zone: string = REPORTING_TIME_ZONE,
  count: number = QUARTERS_SHOWN,
): QuarterlyReport {
  const current = quarterOf(input.now, zone);
  const chosen: Quarter[] = [current];
  while (chosen.length < count) {
    const last = chosen[chosen.length - 1];
    if (last === undefined) break;
    chosen.push(previousQuarter(last));
  }
  // Built newest first, then flipped; leading quarters with nothing in them are dropped.
  const all = chosen.map((quarter) => statsFor(quarter, input, zone, current)).reverse();
  const first = all.findIndex(hasData);
  return { quarters: first === -1 ? [] : all.slice(first) };
}
