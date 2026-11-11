import type { PermissionSet } from './permission-set';
import type { PermissionKey } from './permissions';

/** What a route demands. Every route must declare one; there is no implicit default. */
export type AccessRequirement =
  | { readonly kind: 'public' }
  | { readonly kind: 'authenticated' }
  | { readonly kind: 'permission'; readonly permission: PermissionKey };

export type AccessDecision = 'allow' | 'unauthenticated' | 'hidden';

/** Who is asking: nobody, or someone with a set of permissions. */
export interface Requester {
  readonly permissions: PermissionSet;
}

/**
 * The single "may this request see this route?" decision (SDD §10.3).
 *  - "hidden" must be answered like a missing page (404), never 403, so the route's existence
 *    is not revealed.
 *  - "unauthenticated" lets the UI send a visitor to the login page.
 */
export function decideAccess(
  requirement: AccessRequirement,
  requester: Requester | null,
): AccessDecision {
  if (requirement.kind === 'public') return 'allow';
  if (!requester) return 'unauthenticated';
  if (requirement.kind === 'authenticated') return 'allow';
  return requester.permissions.has(requirement.permission) ? 'allow' : 'hidden';
}
