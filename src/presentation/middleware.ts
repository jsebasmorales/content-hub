import type { APIContext, MiddlewareNext } from 'astro';
import { defineMiddleware } from 'astro:middleware';
import { decideAccess } from '@domain/access/route-access';
import { getApp, type App } from '@infrastructure/container';
import { logEvent } from '@shared/log';
import { findRoute, type RouteDefinition } from './routes';
import { notFoundResponse, redirectResponse, tooManyRequestsResponse } from './security/responses';
import { applySecurityHeaders } from './security/security-headers';
import { readSessionToken } from './security/session-cookie';

const MAX_BODY_BYTES = 64 * 1024;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function clientIp(context: APIContext): string {
  try {
    return context.clientAddress;
  } catch {
    return 'unknown';
  }
}

/** Applies a route's rate limit for the given scope. Returns a 429 response when exceeded. */
async function enforceRateLimit(
  app: App,
  route: RouteDefinition,
  scope: 'ip' | 'user',
  subject: string,
): Promise<Response | null> {
  const spec = route.rateLimit;
  if (spec?.scope !== scope) return null;
  const result = await app.rateLimiter.hit(`${scope}:${subject}:${route.pattern}`, spec);
  if (result.allowed) return null;
  logEvent('warn', 'rate_limit.exceeded', { route: route.pattern, scope });
  return tooManyRequestsResponse(result.retryAfterSeconds);
}

function bodyTooLarge(context: APIContext): boolean {
  if (SAFE_METHODS.has(context.request.method)) return false;
  const declared = Number(context.request.headers.get('content-length') ?? 0);
  return declared > MAX_BODY_BYTES;
}

async function authorize(
  context: APIContext,
  next: MiddlewareNext,
  app: App,
  route: RouteDefinition,
): Promise<Response> {
  const token = readSessionToken(context.cookies, app.settings.secureCookies);
  const principal = await app.resolveSession.execute(token);
  context.locals.principal = principal;
  const decision = decideAccess(route.access, principal);

  if (decision === 'unauthenticated') {
    return route.kind === 'page'
      ? redirectResponse('/login')
      : notFoundResponse(context.url.pathname);
  }
  if (decision === 'hidden') {
    logEvent('warn', 'authz.hidden', { route: route.pattern, userId: principal?.user.id });
    await app.audit.record({
      actorId: principal?.user.id ?? null,
      action: 'authz.denied',
      targetType: 'route',
      targetId: route.pattern,
      ip: clientIp(context),
    });
    return notFoundResponse(context.url.pathname);
  }
  const limited = principal ? await enforceRateLimit(app, route, 'user', principal.user.id) : null;
  return limited ?? next();
}

async function handle(context: APIContext, next: MiddlewareNext): Promise<Response> {
  // Deny by default: anything not in the route registry is "not found" (D-010).
  const route = findRoute(context.routePattern);
  if (!route) return notFoundResponse(context.url.pathname);
  if (bodyTooLarge(context)) return new Response(null, { status: 413 });
  const app = await getApp();
  const limited = await enforceRateLimit(app, route, 'ip', clientIp(context));
  return limited ?? authorize(context, next, app, route);
}

export const onRequest = defineMiddleware(async (context, next) => {
  const requestId = crypto.randomUUID();
  context.locals.requestId = requestId;
  context.locals.principal = null;
  const response = await handle(context, next);
  applySecurityHeaders(response.headers);
  response.headers.set('X-Request-Id', requestId);
  return response;
});
