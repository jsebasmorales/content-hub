import type { AccessRequirement } from '@domain/access/route-access';

export interface RateLimitSpec {
  /** `ip` applies before sign-in; `user` after it. */
  readonly scope: 'ip' | 'user';
  readonly limit: number;
  readonly windowMs: number;
}

export interface RouteDefinition {
  /** URL pattern, e.g. `/permisos`. */
  readonly pattern: string;
  /** File that renders the route, relative to the project root. */
  readonly entrypoint: string;
  /** `api` routes answer 404 with an empty body when hidden or unauthenticated. */
  readonly kind: 'page' | 'api';
  /** Mandatory. There is no default: deny by default means every route states what it needs. */
  readonly access: AccessRequirement;
  readonly rateLimit?: RateLimitSpec;
  /** Spanish label shown in the navigation menu when the user may see this route. */
  readonly menuLabel?: string;
}

const MINUTE = 60_000;

/**
 * The only list of routes in the application (docs/DECISIONES.md D-010). A local Astro
 * integration injects exactly these, and the middleware refuses anything not listed.
 */
export const ROUTES: readonly RouteDefinition[] = [
  {
    pattern: '/',
    entrypoint: './src/presentation/pages/index.astro',
    kind: 'page',
    access: { kind: 'permission', permission: 'section.exec' },
    menuLabel: 'Resumen ejecutivo',
  },
  {
    pattern: '/permisos',
    entrypoint: './src/presentation/pages/permisos.astro',
    kind: 'page',
    access: { kind: 'permission', permission: 'admin.roles' },
    menuLabel: 'Permisos',
  },
  {
    pattern: '/login',
    entrypoint: './src/presentation/pages/login.astro',
    kind: 'page',
    access: { kind: 'public' },
  },
  {
    pattern: '/api/auth/login',
    entrypoint: './src/presentation/api/auth-login.ts',
    kind: 'api',
    access: { kind: 'public' },
    rateLimit: { scope: 'ip', limit: 10, windowMs: MINUTE },
  },
  {
    pattern: '/api/auth/start',
    entrypoint: './src/presentation/api/auth-start.ts',
    kind: 'api',
    access: { kind: 'public' },
    rateLimit: { scope: 'ip', limit: 20, windowMs: MINUTE },
  },
  {
    pattern: '/api/auth/callback',
    entrypoint: './src/presentation/api/auth-callback.ts',
    kind: 'api',
    access: { kind: 'public' },
    rateLimit: { scope: 'ip', limit: 20, windowMs: MINUTE },
  },
  {
    pattern: '/api/auth/logout',
    entrypoint: './src/presentation/api/auth-logout.ts',
    kind: 'api',
    access: { kind: 'authenticated' },
  },
  {
    pattern: '/api/admin/users',
    entrypoint: './src/presentation/api/admin-users.ts',
    kind: 'api',
    access: { kind: 'permission', permission: 'admin.roles' },
    rateLimit: { scope: 'user', limit: 30, windowMs: MINUTE },
  },
];

const BY_PATTERN: ReadonlyMap<string, RouteDefinition> = new Map(
  ROUTES.map((route) => [route.pattern, route]),
);

export function findRoute(pattern: string): RouteDefinition | undefined {
  return BY_PATTERN.get(pattern);
}
