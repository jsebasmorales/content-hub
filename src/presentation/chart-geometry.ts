/**
 * Pure helpers for drawing charts on the server. They only measure; they never decide what a
 * number means.
 */

const STEP_FACTORS = [1, 2, 3, 5, 10] as const;

/**
 * Round tick values for a count axis that starts at 0: whole numbers, at most `maxIntervals`
 * gaps, the last one at or above `max`. 119 gives 0, 30, 60, 90, 120.
 */
export function niceTicks(max: number, maxIntervals = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const raw = max / maxIntervals;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step =
    STEP_FACTORS.map((factor) => Math.max(1, factor * magnitude)).find(
      (candidate) => candidate >= raw && Math.ceil(max / candidate) <= maxIntervals,
    ) ?? Math.ceil(raw);
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step);
}
