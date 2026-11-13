import { describe, expect, it } from 'vitest';
import { PermissionSet } from '@domain/access/permission-set';
import { buildMenu, groupMenu, nextMenuItem } from '@presentation/navigation';

describe('menu sections', () => {
  it('draws no heading whose entries are all hidden', () => {
    const permissions = PermissionSet.of(['section.exec', 'section.summary', 'section.work']);
    const sections = groupMenu(buildMenu(permissions));
    expect(sections.map((section) => section.title)).toEqual(['Resumen', 'Trabajo']);
    // Nothing of the groups the person cannot reach: no title, no entry.
    const text = JSON.stringify(sections);
    for (const hidden of ['Ayuda y ajustes', 'Impacto y planeación', 'Permisos', 'Estado']) {
      expect(text).not.toContain(hidden);
    }
  });

  it('keeps the order of the groups and of the entries', () => {
    const permissions = PermissionSet.of([
      'section.defs',
      'section.exec',
      'section.capacity',
      'section.sla',
    ]);
    const sections = groupMenu(buildMenu(permissions));
    expect(sections.map((section) => section.title)).toEqual([
      'Resumen',
      'Trabajo',
      'Impacto y planeación',
      'Ayuda y ajustes',
    ]);
    expect(sections.flatMap((section) => section.items.map((item) => item.label))).toEqual([
      'Resumen ejecutivo',
      'SLAs',
      'Capacidad',
      'Definiciones',
    ]);
  });

  it('offers as the next page only one the person can open', () => {
    const items = buildMenu(PermissionSet.of(['section.exec', 'section.work']));
    expect(nextMenuItem(items, '/')?.href).toBe('/tareas');
    expect(nextMenuItem(items, '/tareas')).toBeNull();
    expect(nextMenuItem(items, '/no-existe')).toBeNull();
  });
});
