import type { PermissionSet } from '@domain/access/permission-set';
import { decideAccess } from '@domain/access/route-access';
import { ROUTES } from './routes';

export interface MenuItem {
  readonly href: string;
  readonly label: string;
}

/**
 * Builds the menu on the server from the route registry, keeping only what the user may
 * see. Hidden sections leave no trace: no link, no lock icon, no "no access" text (SDD §10.3).
 */
export function buildMenu(permissions: PermissionSet): MenuItem[] {
  return ROUTES.filter((route) => route.menuLabel !== undefined)
    .filter((route) => decideAccess(route.access, { permissions }) === 'allow')
    .map((route) => ({ href: route.pattern, label: route.menuLabel ?? route.pattern }));
}
