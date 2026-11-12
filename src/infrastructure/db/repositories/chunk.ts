/** Splits a list into consecutive pieces of at most `size` items. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const pieces: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    pieces.push(items.slice(start, start + size));
  }
  return pieces;
}
