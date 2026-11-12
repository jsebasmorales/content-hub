import { describe, expect, it } from 'vitest';
import { formatMoment } from '@presentation/format-moment';
import { safeReturnPath, syncFlashFromQuery, syncRedirect } from '@presentation/sync-messages';

describe('safeReturnPath (the button cannot bounce a person to another site)', () => {
  it('returns to a registered page', () => {
    expect(safeReturnPath('/')).toBe('/');
    expect(safeReturnPath('/permisos')).toBe('/permisos');
  });

  it.each([
    undefined,
    '',
    'https://evil.example/',
    '//evil.example',
    '/login',
    '/api/sync',
    '/no-existe',
    '/?x=1',
  ])('falls back to the home page for %s', (value) => {
    expect(safeReturnPath(value)).toBe('/');
  });
});

describe('sync messages', () => {
  it('builds a redirect carrying only a known code', () => {
    expect(syncRedirect('/', 'started')).toBe('/?sync=started');
  });

  it('shows text only for known codes, never what the URL says', () => {
    expect(syncFlashFromQuery(new URLSearchParams('sync=wait'))?.kind).toBe('error');
    expect(syncFlashFromQuery(new URLSearchParams('sync=started'))?.kind).toBe('ok');
    expect(syncFlashFromQuery(new URLSearchParams('sync=<b>hola</b>'))).toBeNull();
    expect(syncFlashFromQuery(new URLSearchParams('sync=toString'))).toBeNull();
    expect(syncFlashFromQuery(new URLSearchParams(''))).toBeNull();
  });
});

describe('formatMoment', () => {
  const moment = new Date('2026-11-12T19:05:00Z');

  it('shows the same moment in each person’s own zone, naming the zone', () => {
    expect(formatMoment(moment, 'America/Bogota')).toBe('12 nov 2026, 14:05 (Colombia · Bogotá)');
    expect(formatMoment(moment, 'Europe/Madrid')).toBe('12 nov 2026, 20:05 (España · Madrid)');
    expect(formatMoment(moment, 'Asia/Bangkok')).toBe('13 nov 2026, 02:05 (Tailandia · Bangkok)');
  });
});
