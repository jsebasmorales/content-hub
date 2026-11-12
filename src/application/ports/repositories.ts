import type { PermissionGrant } from '@domain/access/permission-set';
import type { Role } from '@domain/access/role';
import type { SupportedTimeZone } from '@domain/access/time-zone';
import type { User, UserStatus } from '@domain/access/user';

export interface RoleRecord extends Role {
  readonly id: string;
}

export interface NewUser {
  readonly email: string;
  readonly roleId: string;
  readonly status: UserStatus;
  readonly invitedBy: string | null;
}

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  list(): Promise<User[]>;
  create(input: NewUser): Promise<User>;
  /** Marks the first/next successful login: status becomes "activo". */
  markLoggedIn(id: string, name: string | null, at: Date): Promise<void>;
  setRole(id: string, roleId: string): Promise<void>;
  setStatus(id: string, status: UserStatus): Promise<void>;
  setTimeZone(id: string, timeZone: SupportedTimeZone): Promise<void>;
  countActiveLeaders(): Promise<number>;
}

export interface RoleRepository {
  findByName(name: string): Promise<RoleRecord | null>;
  findById(id: string): Promise<RoleRecord | null>;
  list(): Promise<RoleRecord[]>;
  listGrants(roleId: string): Promise<PermissionGrant[]>;
  setGrant(roleId: string, permissionKey: string, granted: boolean): Promise<void>;
}

export interface NewSession {
  readonly tokenHash: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly now: Date;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export interface SessionWithUser {
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly lastSeenAt: Date;
  readonly user: User;
}

export interface SessionRepository {
  create(input: NewSession): Promise<void>;
  findWithUser(tokenHash: string): Promise<SessionWithUser | null>;
  touch(tokenHash: string, at: Date): Promise<void>;
  delete(tokenHash: string): Promise<void>;
  /** Revokes every session of a user immediately (deactivation, SDD §11.2). */
  deleteAllForUser(userId: string): Promise<void>;
}
