import type { PermissionGrant } from '@domain/access/permission-set';
import { LEADER_ROLE_NAME } from '@domain/access/role';
import type { User, UserStatus } from '@domain/access/user';
import type {
  NewSession,
  NewUser,
  RoleRecord,
  RoleRepository,
  SessionRepository,
  SessionWithUser,
  UserRepository,
} from '@application/ports/repositories';
import { newId } from '@shared/ids';
import type { InMemoryStore } from './in-memory-store';

export class InMemoryUserRepository implements UserRepository {
  constructor(private readonly store: InMemoryStore) {}

  findByEmail(email: string): Promise<User | null> {
    const found = [...this.store.users.values()].find((user) => user.email === email);
    return Promise.resolve(found ? this.store.toUser(found) : null);
  }

  findById(id: string): Promise<User | null> {
    const found = this.store.users.get(id);
    return Promise.resolve(found ? this.store.toUser(found) : null);
  }

  list(): Promise<User[]> {
    const all = [...this.store.users.values()].sort((a, b) => a.email.localeCompare(b.email));
    return Promise.resolve(all.map((user) => this.store.toUser(user)));
  }

  create(input: NewUser): Promise<User> {
    const stored = {
      id: newId(),
      email: input.email,
      name: null,
      status: input.status,
      roleId: input.roleId,
      lastLoginAt: null,
    };
    this.store.users.set(stored.id, stored);
    return Promise.resolve(this.store.toUser(stored));
  }

  markLoggedIn(id: string, name: string | null, at: Date): Promise<void> {
    const user = this.store.users.get(id);
    if (user) {
      user.status = 'activo';
      user.lastLoginAt = at;
      if (name) user.name = name;
    }
    return Promise.resolve();
  }

  setRole(id: string, roleId: string): Promise<void> {
    const user = this.store.users.get(id);
    if (user) user.roleId = roleId;
    return Promise.resolve();
  }

  setStatus(id: string, status: UserStatus): Promise<void> {
    const user = this.store.users.get(id);
    if (user) user.status = status;
    return Promise.resolve();
  }

  countActiveLeaders(): Promise<number> {
    const count = [...this.store.users.values()].filter((user) => {
      const role = this.store.roles.get(user.roleId);
      return user.status === 'activo' && role?.isSystem === true && role.name === LEADER_ROLE_NAME;
    }).length;
    return Promise.resolve(count);
  }
}

export class InMemoryRoleRepository implements RoleRepository {
  constructor(private readonly store: InMemoryStore) {}

  findByName(name: string): Promise<RoleRecord | null> {
    return Promise.resolve([...this.store.roles.values()].find((r) => r.name === name) ?? null);
  }

  findById(id: string): Promise<RoleRecord | null> {
    return Promise.resolve(this.store.roles.get(id) ?? null);
  }

  list(): Promise<RoleRecord[]> {
    return Promise.resolve(
      [...this.store.roles.values()].sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  listGrants(roleId: string): Promise<PermissionGrant[]> {
    const grants = this.store.grants.get(roleId) ?? new Map<string, boolean>();
    return Promise.resolve(
      [...grants.entries()].map(([permissionKey, granted]) => ({ permissionKey, granted })),
    );
  }

  setGrant(roleId: string, permissionKey: string, granted: boolean): Promise<void> {
    const grants = this.store.grants.get(roleId) ?? new Map<string, boolean>();
    grants.set(permissionKey, granted);
    this.store.grants.set(roleId, grants);
    return Promise.resolve();
  }
}

export class InMemorySessionRepository implements SessionRepository {
  constructor(private readonly store: InMemoryStore) {}

  create(input: NewSession): Promise<void> {
    this.store.sessions.set(input.tokenHash, {
      tokenHash: input.tokenHash,
      userId: input.userId,
      expiresAt: input.expiresAt,
      lastSeenAt: input.now,
    });
    return Promise.resolve();
  }

  findWithUser(tokenHash: string): Promise<SessionWithUser | null> {
    const session = this.store.sessions.get(tokenHash);
    const user = session ? this.store.users.get(session.userId) : undefined;
    if (!session || !user) return Promise.resolve(null);
    return Promise.resolve({
      tokenHash: session.tokenHash,
      expiresAt: session.expiresAt,
      lastSeenAt: session.lastSeenAt,
      user: this.store.toUser(user),
    });
  }

  touch(tokenHash: string, at: Date): Promise<void> {
    const session = this.store.sessions.get(tokenHash);
    if (session) session.lastSeenAt = at;
    return Promise.resolve();
  }

  delete(tokenHash: string): Promise<void> {
    this.store.sessions.delete(tokenHash);
    return Promise.resolve();
  }

  deleteAllForUser(userId: string): Promise<void> {
    for (const [hash, session] of this.store.sessions) {
      if (session.userId === userId) this.store.sessions.delete(hash);
    }
    return Promise.resolve();
  }
}
