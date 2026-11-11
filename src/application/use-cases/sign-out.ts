import type { SessionRepository } from '../ports/repositories';
import type { AuditLog, TokenService } from '../ports/services';

export interface SignOutDeps {
  readonly sessions: SessionRepository;
  readonly tokens: TokenService;
  readonly audit: AuditLog;
}

/** Revokes the session on the server, so a stolen cookie stops working (SDD §11.2). */
export class SignOut {
  constructor(private readonly deps: SignOutDeps) {}

  async execute(
    token: string | undefined,
    actorId: string | null,
    ip: string | null,
  ): Promise<void> {
    if (!token) return;
    await this.deps.sessions.delete(this.deps.tokens.hash(token));
    await this.deps.audit.record({ actorId, action: 'auth.logout', targetType: 'session', ip });
  }
}
