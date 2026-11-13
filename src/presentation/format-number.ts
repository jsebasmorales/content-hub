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

const MONTH_NAMES = new Intl.DateTimeFormat('es', { month: 'short', timeZone: 'UTC' });

/** "nov" for { year: 2026, month: 11 }. The date is built in UTC so the server's zone cannot shift it. */
export const monthShortName = (year: number, month: number): string =>
  MONTH_NAMES.format(new Date(Date.UTC(year, month - 1, 15)));
