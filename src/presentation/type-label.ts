/**
 * The name of a request type as the filter's dropdown shows it. Jira names often end with a gloss in
 * parentheses ("Edit or Change Content (Characteristics, Content)"); the list reads better without it.
 * Display only: the name that travels in the address, the cookie and the domain is always the full one.
 */
export function typeDisplayLabel(name: string): string {
  const short = name.replace(/\s*\([^()]*\)\s*$/, '').trim();
  return short === '' ? name : short;
}

/**
 * The label to draw for each name of a list. If two names would end up with the same short label
 * (or a short label equals another full name), those keep their full name, so no two rows look alike.
 */
export function typeDisplayLabels(names: readonly string[]): Map<string, string> {
  const shorts = names.map(typeDisplayLabel);
  const taken = new Map<string, number>();
  for (const label of [...shorts, ...names]) taken.set(label, (taken.get(label) ?? 0) + 1);
  const result = new Map<string, string>();
  names.forEach((name, i) => {
    const short = shorts[i] ?? name;
    // Its own short label appears once among all shorts and fulls, unless it IS the full name.
    const clash = short !== name && (taken.get(short) ?? 0) > 1;
    result.set(name, clash ? name : short);
  });
  return result;
}
