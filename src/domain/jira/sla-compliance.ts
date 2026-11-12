import { SLA_METRICS, cycleOutcome, type SlaCycle, type SlaMetric } from './sla';

/** Each SLA metric must reach this compliance on its own (D-042, option B). */
export const SLA_TARGET_PERCENT = 90;

/** Half-open interval `[from, to)`. */
export interface Period {
  readonly from: Date;
  readonly to: Date;
}

export interface MetricCompliance {
  readonly metric: SlaMetric;
  readonly met: number;
  readonly breached: number;
  readonly total: number;
  /** One decimal place, or null when there is nothing to measure. */
  readonly ratePercent: number | null;
  readonly meetsTarget: boolean | null;
}

export interface SlaCompliance {
  readonly metrics: readonly MetricCompliance[];
  /** True only when every metric meets the target; null while a metric has no data. */
  readonly goalMet: boolean | null;
}

/**
 * A completed cycle belongs to the period of its stop time. Ongoing cycles are judged today, so
 * they belong to the period that contains `now`.
 */
export function cycleInPeriod(cycle: SlaCycle, period: Period, now: Date): boolean {
  const reference = cycle.state === 'completed' ? cycle.stoppedAt : now;
  if (reference === null) return false;
  return reference.getTime() >= period.from.getTime() && reference.getTime() < period.to.getTime();
}

export function metricCompliance(
  metric: SlaMetric,
  cycles: readonly SlaCycle[],
  now: Date,
): MetricCompliance {
  let met = 0;
  let breached = 0;
  for (const cycle of cycles) {
    if (cycle.metric !== metric) continue;
    const outcome = cycleOutcome(cycle, now);
    if (outcome === 'met') met += 1;
    else if (outcome === 'breached') breached += 1;
  }
  const total = met + breached;
  if (total === 0) return { metric, met, breached, total, ratePercent: null, meetsTarget: null };
  return {
    metric,
    met,
    breached,
    total,
    ratePercent: Math.round((met / total) * 1000) / 10,
    // Integer comparison: no floating point surprises at exactly 90 %.
    meetsTarget: met * 100 >= SLA_TARGET_PERCENT * total,
  };
}

export function slaCompliance(cycles: readonly SlaCycle[], now: Date): SlaCompliance {
  const metrics = SLA_METRICS.map((metric) => metricCompliance(metric, cycles, now));
  let goalMet: boolean | null = true;
  if (metrics.some((m) => m.meetsTarget === false)) goalMet = false;
  else if (metrics.some((m) => m.meetsTarget === null)) goalMet = null;
  return { metrics, goalMet };
}
