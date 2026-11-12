import { SUPPORTED_TIME_ZONES, type SupportedTimeZone } from '@domain/access/time-zone';

const formatters = new Map<SupportedTimeZone, Intl.DateTimeFormat>();

function formatterFor(zone: SupportedTimeZone): Intl.DateTimeFormat {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('es', {
      timeZone: zone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(zone, formatter);
  }
  return formatter;
}

export function zoneLabel(zone: SupportedTimeZone): string {
  return SUPPORTED_TIME_ZONES.find((candidate) => candidate.id === zone)?.label ?? zone;
}

const dayFormatters = new Map<SupportedTimeZone, Intl.DateTimeFormat>();

/** Just the day, "12 nov 2026", in the person's zone. For lists, where the hour is noise. */
export function formatDay(moment: Date, zone: SupportedTimeZone): string {
  let formatter = dayFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('es', {
      timeZone: zone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    dayFormatters.set(zone, formatter);
  }
  return formatter.format(moment);
}

const calendarDay = new Intl.DateTimeFormat('es', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** A plain calendar day ("5 oct 2026") that no time zone can shift: it has no hour to move. */
export const formatCalendarDay = (day: { year: number; month: number; day: number }): string =>
  calendarDay.format(new Date(Date.UTC(day.year, day.month - 1, day.day)));

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A length of time in the unit that reads best: "20 min", "5 h", "6 días". */
export function formatSpan(ms: number): string {
  if (ms < HOUR) return `${String(Math.max(1, Math.round(ms / MINUTE)))} min`;
  if (ms < 2 * DAY) return `${String(Math.round(ms / HOUR))} h`;
  return `${String(Math.round(ms / DAY))} días`;
}

/** How long something took: "menos de 1 s", "12 s", "3 min". For runs that last seconds. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return 'menos de 1 s';
  if (ms < MINUTE) return `${String(Math.round(ms / 1000))} s`;
  return formatSpan(ms);
}

/** "Vence en 5 h" or "Venció hace 3 días": how far a limit is from now, in plain words. */
export function describeLimit(breachAt: Date | null, now: Date): string {
  if (breachAt === null) return 'Sin fecha límite';
  const difference = breachAt.getTime() - now.getTime();
  return difference > 0
    ? `Vence en ${formatSpan(difference)}`
    : `Venció hace ${formatSpan(-difference)}`;
}

/**
 * A moment as the person reads it in their own zone, e.g. "12 nov 2026, 14:05 (Colombia · Bogotá)".
 * Always names the zone, so a screenshot shared with a colleague in Madrid is not misread (D-043).
 */
export function formatMoment(moment: Date, zone: SupportedTimeZone): string {
  return `${formatMomentPlain(moment, zone)} (${zoneLabel(zone)})`;
}

/**
 * The same moment without naming the zone, for a table whose heading already says it
 * ("Límite (Colombia · Bogotá)"), so the zone is not repeated on every row.
 */
export function formatMomentPlain(moment: Date, zone: SupportedTimeZone): string {
  return formatterFor(zone).format(moment);
}
