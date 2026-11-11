export interface Clock {
  now(): Date;
}

/** Creates and hashes opaque session tokens. Only the hash is ever stored (SDD §4.3). */
export interface TokenService {
  issue(): { readonly token: string; readonly tokenHash: string };
  hash(token: string): string;
}

export interface AuditEntry {
  readonly actorId: string | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId?: string | null;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly ip?: string | null;
}

/** Append-only record of security-relevant events (SDD §11.2). */
export interface AuditLog {
  record(entry: AuditEntry): Promise<void>;
}
