import { MIN_RELIABLE_SAMPLE } from '@domain/jira/period-window';
// `always`: Spanish leaves four-digit numbers ungrouped by default (1046); DESIGN.md §10 wants 1.046.
const numbers = new Intl.NumberFormat('es', { maximumFractionDigits: 1, useGrouping: 'always' });

export const formatNumber = (value: number): string => numbers.format(value);

/** "84,5 %", or "Sin datos" when nothing was measured. */
export const formatPercent = (value: number | null): string =>
  value === null ? 'Sin datos' : `${formatNumber(value)} %`;

/**
 * How a figure moved against the previous period, in words and with an arrow, so the direction
 * never depends on color alone.
 */
export function describeChange(
  current: number | null,
  previous: number | null,
  previousLabel: string,
  unit = '',
): string {
  if (current === null) return 'Sin datos todavía';
  if (previous === null) return `Sin dato de ${previousLabel} para comparar`;
  const difference = Math.round((current - previous) * 10) / 10;
  if (difference === 0) return `Igual que ${previousLabel}`;
  const sign = difference > 0 ? '▲ +' : '▼ −';
  return `${sign}${formatNumber(Math.abs(difference))}${unit} frente a ${previousLabel}`;
}

export type DeltaDirection = 'up' | 'down' | 'flat' | 'none';
/** Whether the move is good news, bad news, or only information. Never the only signal: the text and the arrow say it too. */
export type DeltaTone = 'good' | 'bad' | 'neutral';

export interface Delta {
  readonly direction: DeltaDirection;
  readonly tone: DeltaTone;
  /** Worded without an arrow: the card draws the arrow as an icon. */
  readonly text: string;
}

/**
 * Same comparison as `describeChange`, split into a direction (for the arrow icon), a tone (for
 * the color) and plain text. `higherIs` says what a rise means for this figure: more resolved
 * tickets is better, a longer resolution time is worse, more created tickets is only information.
 */
export function describeDelta(
  current: number | null,
  previous: number | null,
  previousLabel: string,
  higherIs: 'better' | 'worse' | 'neutral',
  unit = '',
): Delta {
  if (current === null) return { direction: 'none', tone: 'neutral', text: 'Sin datos todavía' };
  if (previous === null) {
    return {
      direction: 'none',
      tone: 'neutral',
      text: `Sin dato de ${previousLabel} para comparar`,
    };
  }
  const difference = Math.round((current - previous) * 10) / 10;
  if (difference === 0) {
    return { direction: 'flat', tone: 'neutral', text: `Igual que ${previousLabel}` };
  }
  const rose = difference > 0;
  const tone: DeltaTone =
    higherIs === 'neutral' ? 'neutral' : rose === (higherIs === 'better') ? 'good' : 'bad';
  return {
    direction: rose ? 'up' : 'down',
    tone,
    text: `${rose ? '+' : '−'}${formatNumber(Math.abs(difference))}${unit} frente a ${previousLabel}`,
  };
}

export type ChangeKind = 'count' | 'rate' | 'days';

const signed = (value: number): string => (value > 0 ? '+' : '−') + formatNumber(Math.abs(value));
const oneDecimal = (value: number): number => Math.round(value * 10) / 10;

/** A value the way its kind is read: "84,5 %", "12 días", "102". */
const shownValue = (value: number, kind: ChangeKind): string =>
  kind === 'rate'
    ? formatPercent(value)
    : kind === 'days'
      ? `${formatNumber(value)} días`
      : formatNumber(value);

const isSmallSample = (sample: number | null | undefined, minimum = MIN_RELIABLE_SAMPLE): boolean =>
  sample !== undefined && sample !== null && sample < minimum;

/** The change itself: points for a rate, days for a time, a percentage (or the plain gap) for a count. */
function changeText(input: {
  current: number;
  previous: number;
  difference: number;
  kind: ChangeKind;
  small: boolean;
}): string {
  const { current, previous, difference, kind, small } = input;
  if (kind === 'rate') return `${signed(difference)} pp`;
  if (kind === 'days') return `${signed(difference)} días`;
  if (previous === 0) return '—';
  if (small) return signed(difference);
  return `${signed(Math.round(((current - previous) / previous) * 100))} %`;
}

/**
 * How a figure moved against another period, with the previous value in brackets (docs/PLAN_FILTROS.md
 * §5.5): a percentage for counts, points for rates, days for times. With fewer than
 * `minSample` cases on the previous side, a count shows the plain difference instead of a
 * percentage; the page adds the "Pocos datos" note. The arrow and the words say the direction, the
 * tone only says whether it is good news.
 */
export function describeComparedDelta(input: {
  current: number | null;
  previous: number | null;
  kind: ChangeKind;
  higherIs: 'better' | 'worse' | 'neutral';
  /** What it is set against, in the words of the screen: "período anterior" or "año previo". */
  reference: string;
  /** Cases behind the previous value; null when it is not a sample (a time, say). */
  previousSample?: number | null;
  minSample?: number;
}): Delta {
  const { current, previous, kind, higherIs, reference } = input;
  if (current === null) return { direction: 'none', tone: 'neutral', text: 'Sin datos todavía' };
  if (previous === null) {
    return { direction: 'none', tone: 'neutral', text: `Sin datos del ${reference}` };
  }
  const shownPrevious = shownValue(previous, kind);
  const difference = oneDecimal(current - previous);
  if (difference === 0) {
    return {
      direction: 'flat',
      tone: 'neutral',
      text: `Igual que ${reference} (${shownPrevious})`,
    };
  }
  const rose = difference > 0;
  const tone: DeltaTone =
    higherIs === 'neutral' ? 'neutral' : rose === (higherIs === 'better') ? 'good' : 'bad';
  const direction: DeltaDirection = rose ? 'up' : 'down';
  const small = isSmallSample(input.previousSample, input.minSample);
  const change = changeText({ current, previous, difference, kind, small });
  return { direction, tone, text: `${change} vs ${reference} (${shownPrevious})` };
}

const MONTH_NAMES = new Intl.DateTimeFormat('es', { month: 'short', timeZone: 'UTC' });

/** "nov" for { year: 2026, month: 11 }. The date is built in UTC so the server's zone cannot shift it. */
export const monthShortName = (year: number, month: number): string =>
  MONTH_NAMES.format(new Date(Date.UTC(year, month - 1, 15)));
