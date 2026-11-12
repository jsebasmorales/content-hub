const numbers = new Intl.NumberFormat('es', { maximumFractionDigits: 1 });

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

const MONTH_NAMES = new Intl.DateTimeFormat('es', { month: 'short', timeZone: 'UTC' });

/** "nov" for { year: 2026, month: 11 }. The date is built in UTC so the server's zone cannot shift it. */
export const monthShortName = (year: number, month: number): string =>
  MONTH_NAMES.format(new Date(Date.UTC(year, month - 1, 15)));
