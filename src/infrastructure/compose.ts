import type { AuthProvider } from '@application/ports/auth-provider';
import type { RateLimiter } from '@application/ports/rate-limiter';
import type {
  RoleRepository,
  SessionRepository,
  UserRepository,
} from '@application/ports/repositories';
import type { AuditLog, Clock, TokenService } from '@application/ports/services';
import type { AccessUnitOfWork } from '@application/ports/unit-of-work';
import { ChangeUserRole } from '@application/use-cases/admin/change-user-role';
import { GetAccessOverview } from '@application/use-cases/admin/get-access-overview';
import { InviteUser } from '@application/use-cases/admin/invite-user';
import { SetUserStatus } from '@application/use-cases/admin/set-user-status';
import { ResolveSession } from '@application/use-cases/resolve-session';
import { SignIn } from '@application/use-cases/sign-in';
import { SignOut } from '@application/use-cases/sign-out';
import type { AppEnv } from './config/env-rules';
import { AtlassianAuthProvider } from './auth/atlassian-provider';
import { CsrfService } from './auth/csrf';
import { LocalAuthProvider } from './auth/local-provider';
import { CryptoTokenService, SystemClock } from './auth/token-service';
import type { Database } from './db/client';
import { DbAuditLog } from './db/repositories/audit-log';
import { DbRateLimiter } from './db/repositories/rate-limiter';
import { DbRoleRepository } from './db/repositories/role-repository';
import { DbSessionRepository } from './db/repositories/session-repository';
import { DbUserRepository } from './db/repositories/user-repository';
import { DbAccessUnitOfWork } from './db/unit-of-work';

export type ComposeEnv = Pick<
  AppEnv,
  | 'ALLOWED_EMAIL_DOMAIN'
  | 'BOOTSTRAP_LEADER_EMAIL'
  | 'AUTH_PROVIDER'
  | 'SESSION_SECRET'
  | 'PUBLIC_APP_URL'
  | 'ATLASSIAN_CLIENT_ID'
  | 'ATLASSIAN_CLIENT_SECRET'
  | 'ATLASSIAN_REDIRECT_URI'
>;

function chooseAuthProvider(env: ComposeEnv): AuthProvider {
  if (env.AUTH_PROVIDER === 'local') return new LocalAuthProvider();
  // Presence of these three is guaranteed by the configuration rules (env-rules.ts).
  return new AtlassianAuthProvider({
    clientId: env.ATLASSIAN_CLIENT_ID ?? '',
    clientSecret: env.ATLASSIAN_CLIENT_SECRET ?? '',
    redirectUri: env.ATLASSIAN_REDIRECT_URI ?? '',
  });
}

/** Every port the use cases depend on. Real adapters and in-memory fakes both fit. */
export interface Ports {
  readonly users: UserRepository;
  readonly roles: RoleRepository;
  readonly sessions: SessionRepository;
  readonly audit: AuditLog;
  readonly rateLimiter: RateLimiter;
  readonly unitOfWork: AccessUnitOfWork;
  readonly tokens: TokenService;
  readonly authProvider: AuthProvider;
}

/** Wires ports to use cases. No Astro code, so tests build the very same app. */
export function wireApp(ports: Ports, env: ComposeEnv, clock: Clock) {
  const { users, roles, sessions, audit, tokens, unitOfWork } = ports;
  const admin = {
    users,
    roles,
    sessions,
    audit,
    unitOfWork,
    allowedEmailDomain: env.ALLOWED_EMAIL_DOMAIN,
  };

  return {
    users,
    roles,
    sessions,
    audit,
    rateLimiter: ports.rateLimiter,
    csrf: new CsrfService(env.SESSION_SECRET),
    settings: { secureCookies: env.PUBLIC_APP_URL.startsWith('https://') },
    authProvider: ports.authProvider,
    signIn: new SignIn({
      users,
      roles,
      sessions,
      audit,
      unitOfWork,
      tokens,
      clock,
      config: {
        allowedEmailDomain: env.ALLOWED_EMAIL_DOMAIN,
        bootstrapLeaderEmail: env.BOOTSTRAP_LEADER_EMAIL,
      },
    }),
    resolveSession: new ResolveSession({ sessions, roles, tokens, clock }),
    signOut: new SignOut({ sessions, tokens, audit }),
    inviteUser: new InviteUser(admin),
    changeUserRole: new ChangeUserRole(admin),
    setUserStatus: new SetUserStatus(admin),
    getAccessOverview: new GetAccessOverview(admin),
  };
}

/** Production wiring: real adapters over a database. */
export function composeApp(db: Database, env: ComposeEnv, clock: Clock = new SystemClock()) {
  return wireApp(
    {
      users: new DbUserRepository(db),
      roles: new DbRoleRepository(db),
      sessions: new DbSessionRepository(db),
      audit: new DbAuditLog(db),
      rateLimiter: new DbRateLimiter(db, clock),
      unitOfWork: new DbAccessUnitOfWork(db),
      tokens: new CryptoTokenService(),
      authProvider: chooseAuthProvider(env),
    },
    env,
    clock,
  );
}

export type App = ReturnType<typeof composeApp>;
