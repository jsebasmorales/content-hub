import type { Bucket } from '@domain/jira/chart-buckets';
import type { DayWindow, Granularity, PeriodWindow } from '@domain/jira/period-window';
import { quarterLabel, type YearMonthDay } from '@domain/jira/quarter';
import { formatCalendarDay } from './format-moment';
import { monthShortName } from './format-number';

/** "15 oct – 13 nov 2026": two days, each in full, the way the team reads a range. */
export const describeDays = (window: DayWindow): string =>
  `${formatCalendarDay(window.from)} – ${formatCalendarDay(window.to)}`;

/**
 * Names the period for a title ("Cumplimiento de SLA en …"). A period cut at today says so, because
 * "T4 2026" alone would suggest a whole quarter of data.
 */
export function describeWindow(window: PeriodWindow): string {
  const { preset } = window;
  if (preset.kind === 'rolling') return `los últimos ${String(preset.days)} días`;
  const name = preset.kind === 'quarter' ? quarterLabel(preset.quarter) : describeDays(window);
  return window.partial ? `${name} (hasta hoy)` : name;
}

const shortDay = (day: YearMonthDay): string =>
  `${String(day.day)} ${monthShortName(day.year, day.month)}`;

/**
 * The label under one bar of a chart: "13 nov" for a day, "13–19 nov" or "30 oct – 5 nov" for a
 * week, "nov 26" for a month. Short on purpose: the bar is narrow.
 */
export function bucketLabel(bucket: Bucket, granularity: Granularity): string {
  const { from, to } = bucket;
  if (granularity === 'monthly') {
    return `${monthShortName(from.year, from.month)} ${String(from.year).slice(2)}`;
  }
  if (from.year === to.year && from.month === to.month && from.day === to.day)
    return shortDay(from);
  if (from.month === to.month && from.year === to.year) {
    return `${String(from.day)}–${shortDay(to)}`;
  }
  return `${shortDay(from)} – ${shortDay(to)}`;
}

/** What the volume chart says it shows, for screen readers: "por día", "por semana", "por mes". */
export const granularityNoun = (granularity: Granularity): string =>
  ({ daily: 'por día', weekly: 'por semana', monthly: 'por mes' })[granularity];
