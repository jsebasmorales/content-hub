/**
 * Time zones a person can pick for how dates are shown (D-043). Grouping and reports always use one
 * fixed zone (`REPORTING_TIME_ZONE`), so totals are the same for everybody; this list only changes
 * how a moment is displayed. Ids are IANA city zones, never fixed offsets, so daylight-saving
 * changes (Madrid, Lisbon) are applied automatically.
 */
export const SUPPORTED_TIME_ZONES = [
  { id: 'America/Bogota', label: 'Colombia · Bogotá' },
  { id: 'America/Argentina/Mendoza', label: 'Argentina · Mendoza' },
  { id: 'America/Argentina/Buenos_Aires', label: 'Argentina · Buenos Aires' },
  { id: 'Europe/Madrid', label: 'España · Madrid' },
  { id: 'Europe/Lisbon', label: 'Portugal · Lisboa' },
  { id: 'Asia/Bangkok', label: 'Tailandia · Bangkok' },
] as const;

export type SupportedTimeZone = (typeof SUPPORTED_TIME_ZONES)[number]['id'];

/** Zone shown to a person who has not chosen one. */
export const DEFAULT_TIME_ZONE: SupportedTimeZone = 'America/Bogota';

export function isSupportedTimeZone(value: string): value is SupportedTimeZone {
  return SUPPORTED_TIME_ZONES.some((zone) => zone.id === value);
}

/** The stored zone when it is still on the list, otherwise the default. Never throws. */
export function resolveTimeZone(value: string | null | undefined): SupportedTimeZone {
  return value !== null && value !== undefined && isSupportedTimeZone(value)
    ? value
    : DEFAULT_TIME_ZONE;
}
