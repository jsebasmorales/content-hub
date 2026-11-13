import type { ComparisonPlan, SideCoverage } from '@domain/jira/comparison';
import { MIN_RELIABLE_SAMPLE } from '@domain/jira/period-window';
import { formatCalendarDay } from './format-moment';
import { describeDays } from './period-labels';

/**
 * The words that go with a figure set against the previous year (docs/PLAN_FILTROS.md §0.3, §5.4).
 * One place, so every card, chart and table says the same thing in the same way.
 */
export type CompareMessageKind = 'none' | 'partial' | 'small' | 'today';

export interface CompareMessage {
  readonly kind: CompareMessageKind;
  readonly text: string;
}

/** What a figure is set against, in the words of the screen. */
export const referenceName = (plan: ComparisonPlan): string =>
  plan.yearOn ? 'año previo' : 'período anterior';

/** "15 oct 2025 – 13 nov 2025": the days the previous side covers, from the same window the figures use. */
export const describePrevious = (plan: ComparisonPlan): string => describeDays(plan.previous);

/**
 * With fewer than `MIN_RELIABLE_SAMPLE` cases on the previous side a percentage misleads (twelve
 * tickets a year ago against a hundred now is not "+800 %"). A count then shows the plain gap, rates
 * and times keep their points and days, and the figure carries this short note. Why, and the 30, are
 * in Definiciones ("Cuándo es fiable la comparación con el año previo"): with the previous year at a
 * tenth of today's volume the note is on most cards, so it stays short.
 */
export function sampleNote(sample: number | null | undefined): CompareMessage | null {
  if (sample === null || sample === undefined || sample >= MIN_RELIABLE_SAMPLE) return null;
  return { kind: 'small', text: `Pocos datos del año previo (n = ${String(sample)})` };
}

/** No data behind the previous side, or only from some day on. */
export function coverageNote(side: SideCoverage): CompareMessage | null {
  if (side.coverage === 'none') return { kind: 'none', text: 'Sin datos del año previo.' };
  if (side.coverage === 'partial' && side.since !== null) {
    return {
      kind: 'partial',
      text: `Datos del año previo desde el ${formatCalendarDay(side.since)}.`,
    };
  }
  return null;
}

/** A photo of today (open now, running cycles) has no previous year: it is not compared. */
export const todayNote: CompareMessage = { kind: 'today', text: 'Estado de hoy, no se compara.' };

/** The one note a figure carries: no data beats partial data beats a small sample. */
export const compareNote = (
  side: SideCoverage,
  sample: number | null | undefined,
): CompareMessage | null => coverageNote(side) ?? sampleNote(sample);

/**
 * The note of one card. Whether the data reaches the previous side is told once per section (and in
 * the box), not on every card: a card only adds its own small sample. With no data at all its delta
 * already says "Sin datos del año previo", so nothing is repeated.
 */
export const cardNote = (
  side: SideCoverage,
  sample: number | null | undefined,
): CompareMessage | null => (side.coverage === 'none' ? null : sampleNote(sample));

/** The headline of the previous-year box: its days, or why there is nothing to show. */
export function boxHeadline(plan: ComparisonPlan): string {
  return plan.volume.coverage === 'none' && plan.sla.coverage === 'none'
    ? 'Sin datos suficientes del año previo'
    : describePrevious(plan);
}
