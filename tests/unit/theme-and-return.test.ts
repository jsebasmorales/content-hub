import { describe, expect, it } from 'vitest';
import { safeReturnPath, safeReturnTarget } from '@presentation/return-target';
import { parseThemeChoice } from '@presentation/theme';

describe('parseThemeChoice', () => {
  it('accepts the three choices and nothing else', () => {
    expect(parseThemeChoice('light')).toBe('light');
    expect(parseThemeChoice('dark')).toBe('dark');
    expect(parseThemeChoice('system')).toBe('system');
    expect(parseThemeChoice('blue')).toBeNull();
    expect(parseThemeChoice('')).toBeNull();
    expect(parseThemeChoice(undefined)).toBeNull();
    expect(parseThemeChoice('toString')).toBeNull();
  });
});

describe('safeReturnTarget (a form can only send a person back to a page of this site)', () => {
  it('keeps the page and its filters', () => {
    expect(safeReturnTarget('/tareas?tipo=Edit&pagina=2')).toBe('/tareas?tipo=Edit&pagina=2');
    expect(safeReturnTarget('/sla?desde=2026-01-01&hasta=2026-03-31')).toBe(
      '/sla?desde=2026-01-01&hasta=2026-03-31',
    );
    expect(safeReturnTarget('/')).toBe('/');
  });

  it('drops one-shot messages so they do not come back', () => {
    expect(safeReturnTarget('/?sync=started')).toBe('/');
    expect(safeReturnTarget('/tareas?sync=wait&tipo=Edit')).toBe('/tareas?tipo=Edit');
    expect(safeReturnTarget('/permisos?ok=invited')).toBe('/permisos');
  });

  it.each([
    ['another site', 'https://evil.example/'],
    ['a protocol-relative address', '//evil.example'],
    ['a backslash trick', '/\\evil.example'],
    ['a javascript address', 'javascript:alert(1)'],
    ['an unregistered page', '/no-existe'],
    ['the sign-in page', '/login'],
    ['an API route', '/api/sync'],
    ['a relative path', 'tareas'],
    ['nothing', ''],
    ['something far too long', `/tareas?x=${'a'.repeat(600)}`],
  ])('falls back to the home page for %s', (_name, value) => {
    expect(safeReturnTarget(value)).toBe('/');
  });

  it('falls back when there is no value', () => {
    expect(safeReturnTarget(undefined)).toBe('/');
  });

  it('agrees with the path-only version about which pages exist', () => {
    expect(safeReturnPath('/sla')).toBe('/sla');
    expect(safeReturnPath('/sla?x=1')).toBe('/');
  });
});
