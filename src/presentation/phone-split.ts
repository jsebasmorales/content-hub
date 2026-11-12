/** Rows a phone shows before "Ver más". The rest wait behind the button (no JavaScript). */
export const PHONE_ROWS = 10;

/**
 * The same list in the two shapes the pages render: all of it for a wide screen, and the first
 * rows plus the remainder for a phone. Keeping the rule here means every page agrees on it.
 */
export function splitForPhone<T>(rows: readonly T[]): { first: readonly T[]; more: readonly T[] } {
  return { first: rows.slice(0, PHONE_ROWS), more: rows.slice(PHONE_ROWS) };
}
