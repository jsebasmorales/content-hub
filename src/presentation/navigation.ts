import type { PermissionSet } from '@domain/access/permission-set';
import { decideAccess } from '@domain/access/route-access';
import type { IconName } from './icons';
import { MENU_GROUPS, ROUTES, type MenuGroup } from './routes';

export interface MenuItem {
  readonly href: string;
  readonly label: string;
  readonly group: MenuGroup;
  readonly icon: IconName;
  /** The page shows the global filter, so a link to it carries the filter along. */
  readonly globalFilter: boolean;
}

export interface MenuSection {
  readonly title: MenuGroup;
  readonly items: readonly MenuItem[];
}

/**
 * Builds the menu on the server from the route registry, keeping only what the user may
 * see. Hidden sections leave no trace: no link, no lock icon, no "no access" text (SDD §10.3).
 */
export function buildMenu(permissions: PermissionSet): MenuItem[] {
  return ROUTES.flatMap((route) =>
    route.menuLabel !== undefined &&
    route.menuGroup !== undefined &&
    route.menuIcon !== undefined &&
    decideAccess(route.access, { permissions }) === 'allow'
      ? [
          {
            href: route.pattern,
            label: route.menuLabel,
            group: route.menuGroup,
            icon: route.menuIcon,
            globalFilter: route.globalFilter === true,
          },
        ]
      : [],
  );
}

/**
 * The visible entries under their headings. A heading with no visible entry is not drawn at all:
 * an empty "Ayuda y ajustes" would tell the person that something exists there.
 */
export function groupMenu(items: readonly MenuItem[]): MenuSection[] {
  return MENU_GROUPS.map((title) => ({
    title,
    items: items.filter((item) => item.group === title),
  })).filter((section) => section.items.length > 0);
}

/** The entry that follows `current` in the menu, for the "Siguiente" link; null at the end. */
export function nextMenuItem(items: readonly MenuItem[], current: string): MenuItem | null {
  const index = items.findIndex((item) => item.href === current);
  return index === -1 ? null : (items[index + 1] ?? null);
}
