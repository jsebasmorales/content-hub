export type LogFields = Readonly<Record<string, string | number | boolean | null | undefined>>;

/**
 * One JSON line per event (SDD §14). Callers pass identifiers only: never tokens, cookies,
 * emails in bulk or request bodies.
 */
export function logEvent(level: 'warn' | 'error', event: string, fields: LogFields = {}): void {
  const line = JSON.stringify({ at: new Date().toISOString(), level, event, ...fields });
  if (level === 'error') console.error(line);
  else console.warn(line);
}
