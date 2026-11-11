import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERMISSION_CATALOG } from '@domain/access/permissions';
import { ROUTES } from '@presentation/routes';

const ROOT = process.cwd();
const HTTP_METHOD_EXPORT = /export const (GET|POST|PUT|PATCH|DELETE)\b/;

function filesUnder(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const asEntrypoint = (file: string): string => `./${relative(ROOT, file).replaceAll('\\', '/')}`;
const registered = new Set(ROUTES.map((route) => route.entrypoint));

describe('route registry (SDD §11.2: every route declares what it needs)', () => {
  it.each(ROUTES.map((route) => [route.pattern, route] as const))(
    '%s declares a valid access requirement',
    (_pattern, route) => {
      const { access } = route;
      expect(['public', 'authenticated', 'permission']).toContain(access.kind);
      if (access.kind === 'permission') {
        expect(PERMISSION_CATALOG).toContain(access.permission);
      }
    },
  );

  it('has unique, well-formed patterns', () => {
    const patterns = ROUTES.map((route) => route.pattern);
    expect(new Set(patterns).size).toBe(patterns.length);
    for (const route of ROUTES) {
      expect(route.pattern.startsWith('/')).toBe(true);
      expect(route.kind === 'api').toBe(route.pattern.startsWith('/api/'));
    }
  });

  it('only exposes the intended public routes (changing this list is a security decision)', () => {
    const publicPatterns = ROUTES.filter((route) => route.access.kind === 'public')
      .map((route) => route.pattern)
      .sort();
    expect(publicPatterns).toEqual([
      '/api/auth/callback',
      '/api/auth/login',
      '/api/auth/start',
      '/login',
    ]);
  });

  it('rate limits every public API route', () => {
    for (const route of ROUTES.filter((r) => r.kind === 'api' && r.access.kind === 'public')) {
      expect(route.rateLimit, route.pattern).toBeDefined();
    }
  });

  it('points every entrypoint at a file that exists', () => {
    for (const route of ROUTES) {
      expect(existsSync(join(ROOT, route.entrypoint)), route.entrypoint).toBe(true);
    }
  });

  it('leaves src/pages empty so no route can bypass the registry', () => {
    const stray = filesUnder(join(ROOT, 'src', 'pages')).filter((f) => !f.endsWith('.gitkeep'));
    expect(stray).toEqual([]);
  });

  it('registers every page file', () => {
    const pages = filesUnder(join(ROOT, 'src', 'presentation', 'pages')).filter((f) =>
      f.endsWith('.astro'),
    );
    for (const file of pages) expect(registered.has(asEntrypoint(file)), file).toBe(true);
  });

  it('registers every endpoint file (any file exporting an HTTP method)', () => {
    const apiFiles = filesUnder(join(ROOT, 'src', 'presentation', 'api')).filter((f) =>
      f.endsWith('.ts'),
    );
    for (const file of apiFiles) {
      if (!HTTP_METHOD_EXPORT.test(readFileSync(file, 'utf8'))) continue;
      expect(registered.has(asEntrypoint(file)), file).toBe(true);
    }
  });
});
