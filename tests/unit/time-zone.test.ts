import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIME_ZONE,
  SUPPORTED_TIME_ZONES,
  isSupportedTimeZone,
  resolveTimeZone,
} from '@domain/access/time-zone';

describe('supported time zones (D-043)', () => {
  it('offers the six places the team works from', () => {
    expect(SUPPORTED_TIME_ZONES.map((zone) => zone.label)).toEqual([
      'Colombia · Bogotá',
      'Argentina · Mendoza',
      'Argentina · Buenos Aires',
      'España · Madrid',
      'Portugal · Lisboa',
      'Tailandia · Bangkok',
    ]);
  });

  it('only lists zones the runtime knows, each once', () => {
    const ids = SUPPORTED_TIME_ZONES.map((zone) => zone.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(() => new Intl.DateTimeFormat('en', { timeZone: id })).not.toThrow();
    }
  });

  it('shows the same moment at each place’s own local hour', () => {
    const moment = new Date('2026-07-01T12:00:00Z');
    const hourIn = (timeZone: string): string =>
      new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(
        moment,
      );
    expect(hourIn('America/Bogota')).toBe('07');
    expect(hourIn('America/Argentina/Mendoza')).toBe('09');
    expect(hourIn('America/Argentina/Buenos_Aires')).toBe('09');
    // Summer time in July: Madrid UTC+2, Lisbon UTC+1.
    expect(hourIn('Europe/Madrid')).toBe('14');
    expect(hourIn('Europe/Lisbon')).toBe('13');
    expect(hourIn('Asia/Bangkok')).toBe('19');
  });

  it('follows daylight saving: Madrid is UTC+1 in winter', () => {
    const hour = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date('2026-01-15T12:00:00Z'));
    expect(hour).toBe('13');
  });

  it('recognises only listed zones', () => {
    expect(isSupportedTimeZone('Europe/Lisbon')).toBe(true);
    expect(isSupportedTimeZone('Europe/Paris')).toBe(false);
    expect(isSupportedTimeZone('')).toBe(false);
    expect(isSupportedTimeZone('UTC+5')).toBe(false);
  });

  it('falls back to Bogotá when nothing valid is stored', () => {
    expect(DEFAULT_TIME_ZONE).toBe('America/Bogota');
    expect(resolveTimeZone(null)).toBe('America/Bogota');
    expect(resolveTimeZone(undefined)).toBe('America/Bogota');
    expect(resolveTimeZone('Mars/Olympus')).toBe('America/Bogota');
    expect(resolveTimeZone('Asia/Bangkok')).toBe('Asia/Bangkok');
  });
});
