import { ASSIGNABLE_PERMISSIONS, SECTION_PERMISSIONS, type PermissionKey } from './permissions';

export const LEADER_ROLE_NAME = 'Líder';
export const COLLABORATOR_ROLE_NAME = 'Colaborador';

export interface Role {
  readonly name: string;
  readonly isSystem: boolean;
}

/** Only the built-in Líder role is a leader; a custom role named "Líder" is not (SDD §10.1). */
export function isLeaderRole(role: Role): boolean {
  return role.isSystem && role.name === LEADER_ROLE_NAME;
}

/** Initial grants for the built-in roles (docs/DECISIONES.md D-001). */
export const DEFAULT_ROLE_GRANTS: Readonly<Record<string, readonly PermissionKey[]>> = {
  [LEADER_ROLE_NAME]: ASSIGNABLE_PERMISSIONS,
  [COLLABORATOR_ROLE_NAME]: SECTION_PERMISSIONS,
};
