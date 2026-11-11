import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COLLABORATOR_ROLE_NAME, LEADER_ROLE_NAME } from '@domain/access/role';
import type { Principal } from '@application/use-cases/resolve-session';
import { createTestApp, type TestApp } from '../support/test-app';

let t: TestApp;
let leader: Principal;
let collaborator: Principal;
let collaboratorRoleId = '';
let leaderRoleId = '';

async function principalFor(email: string): Promise<Principal> {
  const login = await t.app.signIn.execute({
    identity: { email, name: null },
    ip: null,
    userAgent: null,
  });
  if (!login.ok) throw new Error(login.error);
  const principal = await t.app.resolveSession.execute(login.value.token);
  if (!principal) throw new Error('no principal');
  return principal;
}

beforeAll(async () => {
  t = await createTestApp();
  collaboratorRoleId = (await t.app.roles.findByName(COLLABORATOR_ROLE_NAME))?.id ?? '';
  leaderRoleId = (await t.app.roles.findByName(LEADER_ROLE_NAME))?.id ?? '';
  leader = await principalFor('lider@holafly.com');
  const invite = await t.app.inviteUser.execute(leader, {
    email: 'ana@holafly.com',
    roleId: collaboratorRoleId,
    confirmLeader: false,
    ip: null,
  });
  expect(invite.ok).toBe(true);
  collaborator = await principalFor('ana@holafly.com');
});

afterAll(async () => {
  await t.handle.close();
});

const invite = (email: string, roleId = collaboratorRoleId, confirmLeader = false) =>
  t.app.inviteUser.execute(leader, { email, roleId, confirmLeader, ip: null });

describe('InviteUser', () => {
  it('rejects non-company emails and duplicates', async () => {
    expect(await invite('x@gmail.com')).toEqual({ ok: false, error: 'invalid-email' });
    expect(await invite('ana@holafly.com')).toEqual({ ok: false, error: 'already-exists' });
  });

  it('rejects unknown roles', async () => {
    expect(await invite('new@holafly.com', 'no-such-role')).toEqual({
      ok: false,
      error: 'unknown-role',
    });
  });

  it('requires confirmation to invite a Leader', async () => {
    expect(await invite('boss@holafly.com', leaderRoleId)).toEqual({
      ok: false,
      error: 'confirmation-required',
    });
    expect((await invite('boss@holafly.com', leaderRoleId, true)).ok).toBe(true);
  });

  it('is forbidden for people without admin.roles', async () => {
    const result = await t.app.inviteUser.execute(collaborator, {
      email: 'sneaky@holafly.com',
      roleId: collaboratorRoleId,
      confirmLeader: false,
      ip: null,
    });
    expect(result).toEqual({ ok: false, error: 'forbidden' });
  });
});

describe('ChangeUserRole', () => {
  it('protects the last Leader and forbids self-demotion', async () => {
    const self = await t.app.users.findByEmail('lider@holafly.com');
    const result = await t.app.changeUserRole.execute(leader, {
      userId: self?.id ?? '',
      roleId: collaboratorRoleId,
      confirmLeader: false,
      ip: null,
    });
    expect(result.ok).toBe(false);
  });

  it('promotes with confirmation and writes before/after to the audit log', async () => {
    const ana = await t.app.users.findByEmail('ana@holafly.com');
    const input = { userId: ana?.id ?? '', roleId: leaderRoleId, ip: null };
    expect(await t.app.changeUserRole.execute(leader, { ...input, confirmLeader: false })).toEqual({
      ok: false,
      error: 'confirmation-required',
    });
    expect((await t.app.changeUserRole.execute(leader, { ...input, confirmLeader: true })).ok).toBe(
      true,
    );
    expect((await t.app.users.findByEmail('ana@holafly.com'))?.role.name).toBe(LEADER_ROLE_NAME);
  });
});

describe('SetUserStatus', () => {
  it('deactivating a user revokes their sessions at once', async () => {
    await invite('temp@holafly.com');
    const temp = await principalFor('temp@holafly.com');
    const result = await t.app.setUserStatus.execute(leader, {
      userId: temp.user.id,
      active: false,
      ip: null,
    });
    expect(result.ok).toBe(true);
    expect(await t.app.sessions.findWithUser(temp.sessionId)).toBeNull();
  });

  it('a Leader cannot deactivate themselves', async () => {
    const result = await t.app.setUserStatus.execute(leader, {
      userId: leader.user.id,
      active: false,
      ip: null,
    });
    expect(result.ok).toBe(false);
  });
});
