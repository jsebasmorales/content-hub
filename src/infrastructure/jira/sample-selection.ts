import type { SlaCycle } from '@domain/jira/sla';
import { isDone, isObsoleteRequestType, type Ticket } from '@domain/jira/ticket';
import { quarterOf } from '@domain/jira/quarter';

/** A cached ticket with every SLA cycle the Hub holds for it. */
export interface SampleCandidate {
  readonly ticket: Ticket;
  readonly cycles: readonly SlaCycle[];
}

export interface SampleItem {
  readonly key: string;
  /** Why this ticket is in the sample, in the words a person reads in the sheet. */
  readonly reasons: readonly string[];
}

/** How many tickets the sample holds, and so how many a person is asked to look at. */
export const SAMPLE_SIZE = 30;

interface Bucket {
  readonly reason: string;
  readonly take: number;
  readonly matches: (candidate: SampleCandidate, now: Date) => boolean;
}

const completed = (c: SampleCandidate) => c.cycles.filter((cycle) => cycle.state === 'completed');
const ongoing = (c: SampleCandidate) => c.cycles.filter((cycle) => cycle.state === 'ongoing');

const lateRunning = (cycle: SlaCycle, now: Date): boolean =>
  cycle.state === 'ongoing' &&
  !cycle.paused &&
  (cycle.breached || (cycle.breachAt !== null && cycle.breachAt.getTime() <= now.getTime()));

/**
 * The situations worth checking by eye, in priority order. Each takes a few tickets, so the sample
 * covers every kind of SLA outcome and not just the common ones.
 */
const BUCKETS: readonly Bucket[] = [
  {
    reason: 'Cerrado y con las dos métricas cumplidas',
    take: 4,
    matches: (c) =>
      isDone(c.ticket) &&
      completed(c).length >= 2 &&
      ongoing(c).length === 0 &&
      completed(c).every((cycle) => !cycle.breached),
  },
  {
    reason: 'Cerrado con la Resolución incumplida',
    take: 3,
    matches: (c) =>
      isDone(c.ticket) && completed(c).some((cycle) => cycle.metric === 'done' && cycle.breached),
  },
  {
    reason: 'Con la Primera respuesta incumplida',
    take: 3,
    matches: (c) =>
      completed(c).some((cycle) => cycle.metric === 'first_response' && cycle.breached),
  },
  {
    reason: 'Cerrado con un reloj que Jira nunca detuvo',
    take: 2,
    matches: (c) => isDone(c.ticket) && ongoing(c).length > 0,
  },
  {
    reason: 'Abierto con un reloj corriendo y ya vencido',
    take: 3,
    matches: (c, now) => !isDone(c.ticket) && c.cycles.some((cycle) => lateRunning(cycle, now)),
  },
  {
    reason: 'Abierto con un reloj corriendo dentro de plazo',
    take: 2,
    matches: (c, now) =>
      !isDone(c.ticket) && ongoing(c).some((cycle) => !cycle.paused && !lateRunning(cycle, now)),
  },
  {
    reason: 'Abierto con un reloj en pausa',
    take: 2,
    matches: (c) => !isDone(c.ticket) && ongoing(c).some((cycle) => cycle.paused),
  },
  {
    reason: 'Abierto y sin empezar',
    take: 2,
    matches: (c) => c.ticket.statusCategory === 'new',
  },
  {
    reason: 'Reabierto (más de un ciclo de la misma métrica)',
    take: 2,
    matches: (c) =>
      (['first_response', 'done'] as const).some(
        (metric) => c.cycles.filter((cycle) => cycle.metric === metric).length > 1,
      ),
  },
  {
    reason: 'Sin responsable',
    take: 1,
    matches: (c) => c.ticket.assigneeId === null,
  },
  {
    reason: 'De un tipo de solicitud retirado',
    take: 1,
    matches: (c) => isObsoleteRequestType(c.ticket.requestType),
  },
];

/** A stable, well-spread order that does not favour the newest or the oldest tickets. */
function spread(key: string): number {
  let hash = 2166136261;
  for (const char of key) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const quarterKey = (ticket: Ticket): string => {
  const { year, quarter } = quarterOf(ticket.createdAt);
  return `${String(year)}-T${String(quarter)}`;
};

/**
 * Chooses the tickets a person will compare with Jira. Deterministic: the same cache gives the same
 * sample, so a result can be repeated. It first covers each situation in `BUCKETS`, then makes sure
 * every request type and every quarter appears at least once, and stops at `SAMPLE_SIZE`.
 */
export function chooseSample(
  candidates: readonly SampleCandidate[],
  now: Date,
  size: number = SAMPLE_SIZE,
): SampleItem[] {
  const ordered = [...candidates].sort((a, b) => spread(a.ticket.key) - spread(b.ticket.key));
  const chosen = new Map<string, string[]>();
  const add = (candidate: SampleCandidate, reason: string): boolean => {
    const key = candidate.ticket.key;
    if (chosen.has(key)) return false;
    if (chosen.size >= size) return false;
    chosen.set(key, [reason]);
    return true;
  };

  for (const bucket of BUCKETS) {
    let taken = 0;
    for (const candidate of ordered) {
      if (taken >= bucket.take) break;
      if (bucket.matches(candidate, now) && add(candidate, bucket.reason)) taken += 1;
    }
  }
  const coveredTypes = new Set(
    ordered.filter((c) => chosen.has(c.ticket.key)).map((c) => c.ticket.requestType),
  );
  for (const candidate of ordered) {
    const type = candidate.ticket.requestType;
    if (coveredTypes.has(type) || isObsoleteRequestType(type)) continue;
    if (add(candidate, `Tipo de solicitud poco frecuente: ${type}`)) coveredTypes.add(type);
  }
  const coveredQuarters = new Set(
    ordered.filter((c) => chosen.has(c.ticket.key)).map((c) => quarterKey(c.ticket)),
  );
  for (const candidate of ordered) {
    const quarter = quarterKey(candidate.ticket);
    if (coveredQuarters.has(quarter)) continue;
    if (add(candidate, `Creado en ${quarter}`)) coveredQuarters.add(quarter);
  }

  return [...chosen].map(([key, reasons]) => ({ key, reasons }));
}
