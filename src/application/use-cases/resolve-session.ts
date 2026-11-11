import type { PermissionSet } from '@domain/access/permission-set';
import { resolvePermissions } from '@domain/access/permission-set';
import { evaluateSession, needsTouch } from '@domain/access/session-policy';
import type { User } from '@domain/access/user';
import type { RoleRepository, SessionRepository } from '../ports/repositories';
import type { Clock, TokenService } from '../ports/services';

export interface ResolveSessionDeps {
  readonly sessions: SessionRepository;
  readonly roles: RoleRepository;
  readonly tokens: TokenService;
  readonly clock: Clock;
}

/** Who is making this request and what they may do. */
export interface Principal {
  readonly user: User;
  readonly permissions: PermissionSet;
  /** Hash of the session token; also the basis of the anti-CSRF token. */
  readonly sessionId: string;
}

/**
 * Validates a session cookie on every request. Permissions are read fresh from the database
 * each time, never from the cookie, so role changes apply immediately (SDD §10.3).
 */
export class ResolveSession {
  constructor(private readonly deps: ResolveSessionDeps) {}

  async execute(token: string | undefined): Promise<Principal | null> {
    if (!token) return null;
    const { sessions, roles, tokens, clock } = this.deps;
    const tokenHash = tokens.hash(token);
    const session = await sessions.findWithUser(tokenHash);
    if (!session) return null;
    const now = clock.now();
    if (evaluateSession(session, now) !== 'valid' || session.user.status !== 'activo') {
      await sessions.delete(tokenHash);
      return null;
    }
    if (needsTouch(session, now)) await sessions.touch(tokenHash, now);
    const grants = await roles.listGrants(session.user.roleId);
    return {
      user: session.user,
      permissions: resolvePermissions(session.user.role, grants),
      sessionId: tokenHash,
    };
  }
}
