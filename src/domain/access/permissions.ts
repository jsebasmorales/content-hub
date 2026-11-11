/** Dashboard and ecosystem sections that can be shown to a role (SDD §10.1). */
export const SECTION_IDS = [
  'exec',
  'summary',
  'eco',
  'work',
  'sla',
  'breach',
  'goals',
  'capacity',
  'qoq',
  'learn',
  'defs',
] as const;

export type SectionId = (typeof SECTION_IDS)[number];
export type SectionPermission = `section.${SectionId}`;
export type ActionPermission = 'action.sync' | 'action.ecoedit';
export type AdminPermission = 'admin.roles';
export type PermissionKey = SectionPermission | ActionPermission | AdminPermission;

export const SECTION_PERMISSIONS: readonly SectionPermission[] = SECTION_IDS.map(
  (id): SectionPermission => `section.${id}`,
);

/** The fixed permission catalog. Leaders assign these; they cannot invent new ones (SDD §10.1). */
export const PERMISSION_CATALOG: readonly PermissionKey[] = [
  ...SECTION_PERMISSIONS,
  'action.sync',
  'action.ecoedit',
  'admin.roles',
];

/** `admin.roles` belongs to Leaders only and can never be granted to another role. */
export const LEADER_ONLY_PERMISSIONS: readonly PermissionKey[] = ['admin.roles'];

/** Permissions a Leader may switch on or off for a non-leader role. */
export const ASSIGNABLE_PERMISSIONS: readonly PermissionKey[] = PERMISSION_CATALOG.filter(
  (key) => !LEADER_ONLY_PERMISSIONS.includes(key),
);

const CATALOG_SET: ReadonlySet<string> = new Set(PERMISSION_CATALOG);

export function isPermissionKey(value: string): value is PermissionKey {
  return CATALOG_SET.has(value);
}
