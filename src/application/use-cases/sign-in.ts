import { LEADER_ROLE_NAME } from '@domain/access/role';
import { sessionExpiry } from '@domain/access/session-policy';
import type { User } from '@domain/access/user';
import { canSignIn } from '@domain/access/user';
import { isAllowedEmail, normalizeEmail } from '@domain/access/user-rules';
import { err, ok, type Result } from '@shared/result';
import type { ExternalIdentity } from '../ports/auth-provider';
import type { RoleRepository, SessionRepository, UserRepository } from '../ports/repositories';
import type { AuditLog, Clock, TokenService } from '../ports/services';

export interface SignInConfig {
  readonly allowedEmailDomain: string;
  readonly bootstrapLeaderEmail: string;
}

export interface SignInDeps {
  readonly users: UserRepository;
  readonly roles: RoleRepository;
  readonly sessions: SessionRepository;
  readonly audit: AuditLog;
  readonly tokens: TokenService;
  readonly clock: Clock;
  readonly config: SignInConfig;
}

export interface SignInRequest {
  readonly identity: ExternalIdentity;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export interface SignInSuccess {
  readonly token: string;
  readonly expiresAt: Date;
}

/** Why access was denied. Recorded in the audit log, never shown to the visitor. */
export type SignInDenial = 'domain-not-allowed' | 'not-invited' | 'deactivated';

/**
 * Turns a verified external identity into a session, but only for people a Leader invited
 * (SDD §10.2). The very first Leader is created from BOOTSTRAP_LEADER_EMAIL while none exists.
 */
export class SignIn {
  constructor(private readonly deps: SignInDeps) {}

  async execute(request: SignInRequest): Promise<Result<SignInSuccess, SignInDenial>> {
    const email = normalizeEmail(request.identity.email);
    if (!isAllowedEmail(email, this.deps.config.allowedEmailDomain)) {
      return this.deny(request, email, 'domain-not-allowed', null);
    }
    const user = await this.findOrBootstrap(email);
    if (!user) return this.deny(request, email, 'not-invited', null);
    if (!canSignIn(user)) return this.deny(request, email, 'deactivated', user.id);
    return ok(await this.startSession(user, request));
  }

  private async findOrBootstrap(email: string): Promise<User | null> {
    const { users, roles, config } = this.deps;
    const existing = await users.findByEmail(email);
    const isBootstrapEmail = email === normalizeEmail(config.bootstrapLeaderEmail);
    if (!isBootstrapEmail || (await users.countActiveLeaders()) > 0) return existing;
    const leaderRole = await roles.findByName(LEADER_ROLE_NAME);
    if (!leaderRole) return existing;
    if (existing) {
      await users.setRole(existing.id, leaderRole.id);
      await users.setStatus(existing.id, 'activo');
    } else {
      await users.create({ email, roleId: leaderRole.id, status: 'activo', invitedBy: null });
    }
    await this.deps.audit.record({
      actorId: null,
      action: 'auth.bootstrap_leader',
      targetType: 'user',
      after: { email },
    });
    return users.findByEmail(email);
  }

  private async startSession(user: User, request: SignInRequest): Promise<SignInSuccess> {
    const { users, sessions, tokens, clock, audit } = this.deps;
    const now = clock.now();
    await users.markLoggedIn(user.id, request.identity.name, now);
    // A brand-new token on every login: no session fixation (SDD §11.2).
    const { token, tokenHash } = tokens.issue();
    const expiresAt = sessionExpiry(now);
    await sessions.create({
      tokenHash,
      userId: user.id,
      expiresAt,
      now,
      ip: request.ip,
      userAgent: request.userAgent,
    });
    await audit.record({
      actorId: user.id,
      action: 'auth.login',
      targetType: 'user',
      targetId: user.id,
      ip: request.ip,
    });
    return { token, expiresAt };
  }

  private async deny(
    request: SignInRequest,
    email: string,
    reason: SignInDenial,
    userId: string | null,
  ): Promise<Result<never, SignInDenial>> {
    await this.deps.audit.record({
      actorId: userId,
      action: 'auth.login_denied',
      targetType: 'user',
      targetId: userId,
      after: { email, reason },
      ip: request.ip,
    });
    return err(reason);
  }
}
