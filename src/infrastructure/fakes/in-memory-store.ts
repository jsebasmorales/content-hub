import { DEFAULT_ROLE_GRANTS } from '@domain/access/role';
import type { User, UserStatus } from '@domain/access/user';
import type { RoleRecord } from '@application/ports/repositories';
import { newId } from '@shared/ids';

export interface StoredUser {
  id: string;
  email: string;
  name: string | null;
  status: UserStatus;
  roleId: string;
  lastLoginAt: Date | null;
}

export interface StoredSession {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  lastSeenAt: Date;
}

/** Shared state behind the in-memory fakes, so they can reference one another like tables. */
export class InMemoryStore {
  readonly roles = new Map<string, RoleRecord>();
  readonly grants = new Map<string, Map<string, boolean>>();
  readonly users = new Map<string, StoredUser>();
  readonly sessions = new Map<string, StoredSession>();

  /** Same built-in roles and default grants as the database seed (D-001, D-020). */
  constructor() {
    for (const [name, keys] of Object.entries(DEFAULT_ROLE_GRANTS)) {
      const id = newId();
      this.roles.set(id, { id, name, isSystem: true });
      this.grants.set(id, new Map(keys.map((key) => [key, true])));
    }
  }

  toUser(stored: StoredUser): User {
    const role = this.roles.get(stored.roleId);
    if (!role) throw new Error(`Dangling role ${stored.roleId}`);
    return {
      id: stored.id,
      email: stored.email,
      name: stored.name,
      status: stored.status,
      roleId: stored.roleId,
      role: { name: role.name, isSystem: role.isSystem },
    };
  }
}
