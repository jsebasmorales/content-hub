import { MONTHS_IN_TREND, monthPoint, type MonthPoint } from './executive-summary';
import { REPORTING_TIME_ZONE, addMonths, monthOf } from './quarter';
import { normalizeForSearch } from './task-list';
import { isDone, type Ticket } from './ticket';

const DAY_MS = 86_400_000;

/**
 * The people whose workload the capacity page studies (D-056). Everyone else who appears as an
 * assignee belongs to another team and is left out of the figures, though the page still names them.
 * A name matches an assignee when every one of its words is a word of the assignee's name, ignoring
 * case and accents, so "Paula Yeyati" finds "Paula Yeyati Preiss".
 */
export const TEAM_MEMBERS: readonly string[] = [
  'Paula Yeyati',
  'Sebastian Hernandez',
  'Andres Montagut',
  'Maria Fernanda Barrera',
  'Bon Thatthana',
  'Juan José Gabelo',
];

/** How far from the team average a person may be and still count as balanced (D-055). */
export const BALANCE_TOLERANCE = 0.25;
/** The band never shrinks below this many tasks, so with small numbers one task is not "unbalanced". */
export const MIN_BAND = 1;
/** Window used to count what each person finished recently. */
export const RECENT_DAYS = 90;
/** Complete months averaged to estimate the pace of arrivals and of finished work. */
export const PACE_MONTHS = 3;

/**
 * The weight one ticket puts on a person. Today every task weighs the same (D-037); when the team
 * adopts story points this is the only place that changes.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the ticket is the input story points will read
export const loadOf = (_ticket: Ticket): number => 1;

export type Balance = 'above' | 'balanced' | 'below';

export interface PersonLoad {
  /** Jira account of the person, or null when none of their tickets is in the Hub yet. */
  readonly assigneeId: string | null;
  readonly name: string;
  /** Tasks not done yet. */
  readonly open: number;
  /** Open tasks Jira groups as "in progress" (working or waiting on something). */
  readonly inProgress: number;
  /** Open tasks nobody has started. */
  readonly notStarted: number;
  /** Tasks this person finished in the last 90 days. */
  readonly resolvedRecent: number;
  /** Open work measured with `loadOf`. */
  readonly load: number;
  /** Load minus the team average, one decimal. */
  readonly deviation: number;
  readonly balance: Balance;
}

export interface WorkFlow {
  /** Average tasks that arrived per month, over the last complete months. Null with no history. */
  readonly arrivedPerMonth: number | null;
  readonly finishedPerMonth: number | null;
  /** Arrived minus finished: positive means the queue is growing. */
  readonly difference: number | null;
  readonly openNow: number;
  /** Months to empty the queue at the current finishing pace; null if nothing is finishing. */
  readonly monthsToClear: number | null;
}

/** Someone outside the studied team who holds open tasks: named so nothing is hidden. */
export interface OutsideAssignee {
  readonly name: string;
  readonly open: number;
}

export interface CapacityReport {
  /** The team, most loaded first. Every member is listed, even with nothing open. */
  readonly people: readonly PersonLoad[];
  /** Average load of the team; null when the team is empty. */
  readonly averageLoad: number | null;
  /** How far from the average still counts as balanced. */
  readonly band: number;
  /** Open work that nobody owns. It belongs to the team's queue but to no person. */
  readonly unassignedOpen: number;
  /** Arrivals and finished work of the team's tasks and the ones nobody owns. */
  readonly flow: WorkFlow;
  /** The same, month by month, oldest first, ending with the current month. */
  readonly months: readonly MonthPoint[];
  /** People outside the team with open tasks, left out of every figure above. */
  readonly outside: readonly OutsideAssignee[];
}

const oneDecimal = (value: number): number => Math.round(value * 10) / 10;

function classify(load: number, average: number, band: number): Balance {
  if (load > average + band) return 'above';
  if (load < average - band) return 'below';
  return 'balanced';
}

const wordsOf = (value: string): string[] => normalizeForSearch(value).split(/\s+/).filter(Boolean);

/** The configured member an assignee name stands for, or null when it is someone else. */
export function memberOf(assigneeName: string | null, team: readonly string[]): string | null {
  if (assigneeName === null) return null;
  const words = new Set(wordsOf(assigneeName));
  return team.find((member) => wordsOf(member).every((word) => words.has(word))) ?? null;
}

interface Tally {
  assigneeId: string | null;
  name: string;
  open: number;
  inProgress: number;
  notStarted: number;
  resolvedRecent: number;
  load: number;
}

const emptyTally = (name: string): Tally => ({
  assigneeId: null,
  name,
  open: 0,
  inProgress: 0,
  notStarted: 0,
  resolvedRecent: 0,
  load: 0,
});

function addToTally(tally: Tally, ticket: Ticket, since: number): void {
  tally.assigneeId ??= ticket.assigneeId;
  if (!isDone(ticket)) {
    tally.open += 1;
    tally.load += loadOf(ticket);
    if (ticket.statusCategory === 'indeterminate') tally.inProgress += 1;
    else tally.notStarted += 1;
  } else if (ticket.resolvedAt !== null && ticket.resolvedAt.getTime() >= since) {
    tally.resolvedRecent += 1;
  }
}

/** One tally per team member (all of them, even with no tickets) and the open work of everyone else. */
function tallyTeam(
  tickets: readonly Ticket[],
  team: readonly string[],
  now: Date,
): { members: Map<string, Tally>; outside: Map<string, number> } {
  const since = now.getTime() - RECENT_DAYS * DAY_MS;
  const members = new Map(team.map((member) => [member, emptyTally(member)]));
  const outside = new Map<string, number>();
  for (const ticket of tickets) {
    if (ticket.assigneeId === null) continue;
    const member = memberOf(ticket.assigneeName, team);
    const tally = member === null ? undefined : members.get(member);
    if (tally) {
      // The real name from Jira replaces the configured one as soon as the person has a ticket.
      tally.name = ticket.assigneeName ?? tally.name;
      addToTally(tally, ticket, since);
    } else if (!isDone(ticket)) {
      const name = ticket.assigneeName ?? 'Sin nombre';
      outside.set(name, (outside.get(name) ?? 0) + 1);
    }
  }
  return { members, outside };
}

function workFlow(tickets: readonly Ticket[], now: Date, zone: string): WorkFlow {
  const current = monthOf(now, zone);
  const openNow = tickets.filter((ticket) => !isDone(ticket)).length;
  const points = Array.from({ length: PACE_MONTHS }, (_, i) =>
    monthPoint(tickets, addMonths(current, -(i + 1)), zone),
  );
  const arrived = points.reduce((sum, p) => sum + p.created, 0);
  const finished = points.reduce((sum, p) => sum + p.resolved, 0);
  if (arrived === 0 && finished === 0) {
    return {
      arrivedPerMonth: null,
      finishedPerMonth: null,
      difference: null,
      openNow,
      monthsToClear: null,
    };
  }
  const finishedPerMonth = finished / PACE_MONTHS;
  return {
    arrivedPerMonth: oneDecimal(arrived / PACE_MONTHS),
    finishedPerMonth: oneDecimal(finishedPerMonth),
    difference: oneDecimal((arrived - finished) / PACE_MONTHS),
    openNow,
    monthsToClear: finishedPerMonth > 0 ? oneDecimal(openNow / finishedPerMonth) : null,
  };
}

function toPeople(members: Map<string, Tally>): {
  people: PersonLoad[];
  average: number | null;
  band: number;
} {
  const tallies = [...members.values()];
  const average =
    tallies.length === 0
      ? null
      : oneDecimal(tallies.reduce((sum, tally) => sum + tally.load, 0) / tallies.length);
  const band =
    average === null ? MIN_BAND : Math.max(oneDecimal(average * BALANCE_TOLERANCE), MIN_BAND);
  const people = tallies
    .map((tally): PersonLoad => ({
      assigneeId: tally.assigneeId,
      name: tally.name,
      open: tally.open,
      inProgress: tally.inProgress,
      notStarted: tally.notStarted,
      resolvedRecent: tally.resolvedRecent,
      load: tally.load,
      deviation: average === null ? 0 : oneDecimal(tally.load - average),
      balance: average === null ? 'balanced' : classify(tally.load, average, band),
    }))
    .sort((a, b) => b.load - a.load || a.name.localeCompare(b.name, 'es'));
  return { people, average, band };
}

/**
 * Pure: how the team's open work is spread across its people, and whether work arrives faster than
 * it leaves. Only the people in `team` are studied; their tasks plus the ones nobody owns make up
 * the queue. Anyone else is named in `outside` so nothing is hidden, but counts in no figure.
 */
export function buildCapacityReport(
  input: { tickets: readonly Ticket[]; now: Date; team?: readonly string[] },
  zone: string = REPORTING_TIME_ZONE,
): CapacityReport {
  const { tickets, now, team = TEAM_MEMBERS } = input;
  const { members, outside } = tallyTeam(tickets, team, now);
  const { people, average, band } = toPeople(members);
  const queue = tickets.filter(
    (ticket) => ticket.assigneeId === null || memberOf(ticket.assigneeName, team) !== null,
  );
  const current = monthOf(now, zone);

  return {
    people,
    averageLoad: average,
    band,
    unassignedOpen: tickets.filter((t) => !isDone(t) && t.assigneeId === null).length,
    flow: workFlow(queue, now, zone),
    months: Array.from({ length: MONTHS_IN_TREND }, (_, i) =>
      monthPoint(queue, addMonths(current, i - (MONTHS_IN_TREND - 1)), zone),
    ),
    outside: [...outside]
      .map(([name, open]) => ({ name, open }))
      .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name, 'es')),
  };
}
