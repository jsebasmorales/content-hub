import type { AstroCookies } from 'astro';
import { describe, expect, it } from 'vitest';
import { resolveGlobalFilter } from '@domain/jira/global-filter';
import { hasFilterParams, otherParams, rawFilterFromParams } from '@presentation/filter-query';
import {
  filterCookieName,
  filterQuery,
  readFilterRequest,
  settleFilter,
} from '@presentation/filter-request';

const now = new Date('2026-11-13T15:00:00Z');
const known = ['Email', 'Blog', 'Push'];
const resolve = (query: string) =>
  resolveGlobalFilter(rawFilterFromParams(new URLSearchParams(query)), {
    now,
    knownTypes: known,
    compareAvailable: false,
  });

/** The few things of Astro's cookie jar the filter uses, kept in a map so a test can inspect it. */
function fakeCookies(initial: Record<string, string> = {}) {
  const jar = new Map(Object.entries(initial));
  const cookies = {
    get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  } as unknown as AstroCookies;
  return { cookies, jar };
}
const url = (path: string): URL => new URL(`https://hub.test${path}`);

describe('rawFilterFromParams', () => {
  it('reads the period, the repeated types and the comparison', () => {
    const raw = rawFilterFromParams(
      new URLSearchParams('periodo=T3&anio=2026&tipos=Email&tipos=Blog&comparar=1'),
    );
    expect(raw).toMatchObject({
      period: 'T3',
      year: '2026',
      types: ['Email', 'Blog'],
      compare: '1',
    });
  });

  it('reads the old links: trimestre and a single tipo', () => {
    const raw = rawFilterFromParams(new URLSearchParams('trimestre=2026-T3&tipo=Email'));
    expect(raw).toMatchObject({ legacyQuarter: '2026-T3', types: ['Email'] });
  });

  it('drops oversized values, repeated types and any type beyond the limit', () => {
    const raw = rawFilterFromParams(
      new URLSearchParams(
        `periodo=${'x'.repeat(100)}&tipos=${'y'.repeat(300)}&tipos=Email&tipos=Email`,
      ),
    );
    expect(raw.period).toBeNull();
    expect(raw.types).toEqual(['Email']);
    const many = new URLSearchParams(
      Array.from({ length: 200 }, (_, i) => ['tipos', `T${String(i)}`]),
    );
    expect(rawFilterFromParams(many).types).toHaveLength(60);
  });

  it("tells the filter's own parameters from the page's", () => {
    const params = new URLSearchParams('periodo=T1&metrica=done&pagina=2&tipos=Blog');
    expect(hasFilterParams(params)).toBe(true);
    expect(hasFilterParams(new URLSearchParams('metrica=done&pagina=2'))).toBe(false);
    expect(otherParams(params)).toEqual([
      ['metrica', 'done'],
      ['pagina', '2'],
    ]);
    expect(otherParams(params, ['pagina'])).toEqual([['metrica', 'done']]);
  });
});

describe('readFilterRequest', () => {
  it('lets the address win over the cookie', () => {
    const { cookies } = fakeCookies({ hub_filter: 'periodo=T1&anio=2026' });
    const request = readFilterRequest(url('/sla?periodo=T3&anio=2026'), cookies, false);
    expect(request).toMatchObject({ fromUrl: true, submitted: false, reset: false });
    expect(request.raw.period).toBe('T3');
  });

  it('uses the cookie when the address says nothing about the filter', () => {
    const { cookies } = fakeCookies({ hub_filter: 'periodo=T1&anio=2026&tipos=Blog' });
    const request = readFilterRequest(url('/sla?pagina=2'), cookies, false);
    expect(request.fromUrl).toBe(false);
    expect(request.raw).toMatchObject({ period: 'T1', types: ['Blog'] });
  });

  it('uses the defaults for a new session, and ignores a cookie that is too big', () => {
    expect(readFilterRequest(url('/'), fakeCookies().cookies, false).raw.period).toBeUndefined();
    const { cookies } = fakeCookies({ hub_filter: `periodo=${'T'.repeat(5000)}` });
    expect(readFilterRequest(url('/'), cookies, false).raw.period).toBeUndefined();
  });

  it('reads the cookie with the same strictness as the address', () => {
    const { cookies } = fakeCookies({ hub_filter: `periodo=T9&tipos=${'z'.repeat(400)}` });
    const filter = resolveGlobalFilter(readFilterRequest(url('/'), cookies, false).raw, {
      now,
      knownTypes: known,
      compareAvailable: false,
    });
    expect(filter.notices).toContain('period');
    expect(filter.types).toEqual({ all: true });
  });

  it('recognises "Restablecer" and a submitted form', () => {
    expect(readFilterRequest(url('/sla?restablecer=1'), fakeCookies().cookies, false).reset).toBe(
      true,
    );
    const submitted = readFilterRequest(
      url('/sla?periodo=T3&desde0=2026-07-01&hasta0=2026-09-30'),
      fakeCookies().cookies,
      false,
    );
    expect(submitted.submitted).toBe(true);
  });

  it('prefixes the cookie with __Host- over https only', () => {
    expect(filterCookieName(true)).toBe('__Host-hub_filter');
    expect(filterCookieName(false)).toBe('hub_filter');
  });
});

describe('settleFilter', () => {
  it('remembers a filter the address chose, as its shortest parameters', () => {
    const { cookies, jar } = fakeCookies();
    const target = url('/sla?periodo=T3&anio=2026&tipos=Email');
    const request = readFilterRequest(target, cookies, false);
    const redirect = settleFilter(target, cookies, false, request, resolve(target.search));
    expect(redirect).toBeNull();
    expect(jar.get('hub_filter')).toBe('periodo=T3&anio=2026&tipos=Email');
  });

  it('forgets the filter when the address chose the defaults', () => {
    const { cookies, jar } = fakeCookies({ hub_filter: 'periodo=T3&anio=2026' });
    const target = url('/sla?periodo=30d');
    const request = readFilterRequest(target, cookies, false);
    settleFilter(target, cookies, false, request, resolve(target.search));
    expect(jar.has('hub_filter')).toBe(false);
  });

  it('does not write the cookie when it only read it', () => {
    const { cookies, jar } = fakeCookies({ hub_filter: 'periodo=T3&anio=2026' });
    const target = url('/sla');
    const request = readFilterRequest(target, cookies, false);
    const filter = resolveGlobalFilter(request.raw, {
      now,
      knownTypes: known,
      compareAvailable: false,
    });
    expect(settleFilter(target, cookies, false, request, filter)).toBeNull();
    expect(jar.get('hub_filter')).toBe('periodo=T3&anio=2026');
  });

  it('tidies a form submission to the shortest address, keeping the list filters and not the page', () => {
    const { cookies } = fakeCookies();
    const target = url(
      '/incumplimientos?metrica=done&pagina=3&sync=ok&periodo=T3&anio=2026&desde=2026-07-01&hasta=2026-09-30&desde0=2026-07-01&hasta0=2026-09-30&tipos_form=1&tipos=Email&tipos=Blog&tipos=Push',
    );
    const request = readFilterRequest(target, cookies, false);
    const filter = resolveGlobalFilter(request.raw, {
      now,
      knownTypes: known,
      compareAvailable: false,
    });
    expect(settleFilter(target, cookies, false, request, filter)).toBe(
      '/incumplimientos?metrica=done&periodo=T3&anio=2026',
    );
  });
});

describe('filterQuery', () => {
  it('is empty for the defaults and carries the rest so a menu link keeps it', () => {
    expect(filterQuery(resolve(''))).toBe('');
    expect(filterQuery(resolve('periodo=T2&anio=2026&tipos=Blog'))).toBe(
      '?periodo=T2&anio=2026&tipos=Blog',
    );
  });
});
