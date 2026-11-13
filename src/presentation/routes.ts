import type { AccessRequirement } from '@domain/access/route-access';
import type { IconName } from './icons';

/** The heading a menu entry sits under. Order here is the order in the menu. */
export const MENU_GROUPS = [
  'Resumen',
  'Trabajo',
  'Impacto y planeación',
  'Ayuda y ajustes',
] as const;
export type MenuGroup = (typeof MENU_GROUPS)[number];

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
  /** Heading and icon of the menu entry; both are required whenever `menuLabel` is set. */
  readonly menuGroup?: MenuGroup;
  readonly menuIcon?: IconName;
  /** The page shows and applies the global filter (period, request types), so menu links carry it. */
  readonly globalFilter?: true;
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
    menuGroup: 'Resumen',
    menuIcon: 'dashboard',
    globalFilter: true,
  },
  {
    pattern: '/resumen',
    entrypoint: './src/presentation/pages/resumen.astro',
    kind: 'page',
    access: { kind: 'permission', permission: 'section.summary' },
    menuLabel: 'Resumen',
    menuGroup: 'Resumen',
    menuIcon: 'list',
    globalFilter: true,
  },
  {
    pattern: '/tareas',
    entrypoint: './src/presentation/pages/tareas.astro',
    kind: 'page',
    access: { kind: 'permission', permission: 'section.work' },
    menuLabel: 'Tareas',
    menuGroup: 'Trabajo',
    menuIcon: 'tasks',
  },
  {
    pattern: '/sla',
    entrypoint: './src/presentation/pages/sla.astro',
    kind: 'page',
    access: { kind: 'permission', permission: 'section.sla' },
    menuLabel: 'SLAs',
    menuGroup: 'Trabajo',
    menuIcon: 'clock',
    globalFilter: true,
  },
  {
    pattern: '/incumplimientos',
    entrypoint: './src/presentation/pages/incumplimientos.astro',
    kind: 'page',
    access: { kind: 'permission', permission: 'section.breach' },
    menuLabel: 'SLAs incumplidos',
    menuGroup: 'Trabajo',
    menuIcon: 'breach',
    globalFilter: true,
  },
  {
    pattern: '/capacidad',
    entrypoint: './src/presentation/pages/capacidad.astro',
    kind: 'page',
    access: { kind: 'permission', permission: 'section.capacity' },
    menuLabel: 'Capacidad',
    menuGroup: 'Impacto y planeación',
    menuIcon: 'capacity',
  },
  {
    pattern: '/trimestres',
    entrypoint: './src/presentation/pages/trimestres.astro',
    kind: 'page',
    access: { kind: 'permission', permission: 'section.qoq' },
    menuLabel: 'Trimestre a trimestre',
    menuGroup: 'Impacto y planeación',
    menuIcon: 'trend',
  },
  {
    pattern: '/aprendido',
    entrypoint: './src/presentation/pages/aprendido.astro',
    kind: 'page',
    access: { kind: 'permission', permission: 'section.learn' },
    menuLabel: 'Lo aprendido',
    menuGroup: 'Impacto y planeación',
    menuIcon: 'lightbulb',
  },
  {
    pattern: '/definiciones',
    entrypoint: './src/presentation/pages/definiciones.astro',
    kind: 'page',
    access: { kind: 'permission', permission: 'section.defs' },
    menuLabel: 'Definiciones',
    menuGroup: 'Ayuda y ajustes',
    menuIcon: 'book',
  },
  {
    // Shown to whoever may request a sync (the Leader by default): they are the ones who act on it.
    pattern: '/estado',
    entrypoint: './src/presentation/pages/estado.astro',
    kind: 'page',
    access: { kind: 'permission', permission: 'action.sync' },
    menuLabel: 'Estado',
    menuGroup: 'Ayuda y ajustes',
    menuIcon: 'pulse',
  },
  {
    pattern: '/permisos',
    entrypoint: './src/presentation/pages/permisos.astro',
    kind: 'page',
    access: { kind: 'permission', permission: 'admin.roles' },
    menuLabel: 'Permisos',
    menuGroup: 'Ayuda y ajustes',
    menuIcon: 'shield',
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
    pattern: '/api/time-zone',
    entrypoint: './src/presentation/api/time-zone.ts',
    kind: 'api',
    access: { kind: 'authenticated' },
    rateLimit: { scope: 'user', limit: 30, windowMs: MINUTE },
  },
  {
    pattern: '/api/theme',
    entrypoint: './src/presentation/api/theme.ts',
    kind: 'api',
    access: { kind: 'authenticated' },
    rateLimit: { scope: 'user', limit: 30, windowMs: MINUTE },
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
  {
    // Writing needs its own permission: seeing the page is not enough to change what it says (D-061).
    pattern: '/api/learned',
    entrypoint: './src/presentation/api/learned-save.ts',
    kind: 'api',
    access: { kind: 'permission', permission: 'action.learnedit' },
    rateLimit: { scope: 'user', limit: 30, windowMs: MINUTE },
  },
  {
    // The 1-per-minute limit lives in the handler so the person gets a clear message, not a bare 429.
    pattern: '/api/sync',
    entrypoint: './src/presentation/api/sync-request.ts',
    kind: 'api',
    access: { kind: 'permission', permission: 'action.sync' },
  },
];

const BY_PATTERN: ReadonlyMap<string, RouteDefinition> = new Map(
  ROUTES.map((route) => [route.pattern, route]),
);

export function findRoute(pattern: string): RouteDefinition | undefined {
  return BY_PATTERN.get(pattern);
}
