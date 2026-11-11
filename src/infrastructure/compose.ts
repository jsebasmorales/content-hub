import type { AuthProvider } from '@application/ports/auth-provider';
import type { Clock } from '@application/ports/services';
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

/** Wires adapters to use cases. Contains no Astro code, so tests can build the same app. */
export function composeApp(db: Database, env: ComposeEnv, clock: Clock = new SystemClock()) {
  const users = new DbUserRepository(db);
  const roles = new DbRoleRepository(db);
  const sessions = new DbSessionRepository(db);
  const audit = new DbAuditLog(db);
  const tokens = new CryptoTokenService();

  const admin = { users, roles, sessions, audit, allowedEmailDomain: env.ALLOWED_EMAIL_DOMAIN };

  return {
    users,
    roles,
    sessions,
    audit,
    rateLimiter: new DbRateLimiter(db, clock),
    csrf: new CsrfService(env.SESSION_SECRET),
    settings: { secureCookies: env.PUBLIC_APP_URL.startsWith('https://') },
    authProvider: chooseAuthProvider(env),
    signIn: new SignIn({
      users,
      roles,
      sessions,
      audit,
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

export type App = ReturnType<typeof composeApp>;
