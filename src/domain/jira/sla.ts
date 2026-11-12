/** The two SLA metrics the Hub reports (docs/jira-mapping.md, D-039). */
export const SLA_METRICS = ['first_response', 'done'] as const;
export type SlaMetric = (typeof SLA_METRICS)[number];

/**
 * One SLA cycle as Jira calculated it. The Hub never recomputes calendars or pauses: Jira applies
 * them, and the Hub only reads the result.
 */
export interface SlaCycle {
  readonly metric: SlaMetric;
  readonly state: 'completed' | 'ongoing';
  readonly startedAt: Date;
  /** Present for completed cycles. */
  readonly stoppedAt: Date | null;
  readonly breachAt: Date | null;
  readonly breached: boolean;
  /** Ongoing cycles only: a paused clock is not running toward its limit. */
  readonly paused: boolean;
}

export type CycleOutcome = 'met' | 'breached' | 'excluded';

/**
 * How a cycle counts toward compliance (D-042, D-038 amendment):
 * - completed: met or breached according to Jira.
 * - ongoing and already breached: breached.
 * - ongoing and paused: excluded. Its breach time is a projection that moves while paused.
 * - ongoing and running past its breach time: breached (Jira's flag can lag one sync behind).
 * - any other ongoing cycle: excluded, it has not been decided yet.
 */
export function cycleOutcome(cycle: SlaCycle, now: Date): CycleOutcome {
  if (cycle.state === 'completed') return cycle.breached ? 'breached' : 'met';
  if (cycle.breached) return 'breached';
  if (cycle.paused) return 'excluded';
  const pastLimit = cycle.breachAt !== null && cycle.breachAt.getTime() <= now.getTime();
  return pastLimit ? 'breached' : 'excluded';
}
