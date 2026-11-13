import { describe, expect, it } from 'vitest';
import { PermissionSet, resolvePermissions } from '@domain/access/permission-set';
import { COLLABORATOR_ROLE_NAME, DEFAULT_ROLE_GRANTS, LEADER_ROLE_NAME } from '@domain/access/role';
import { SUPPORTED_TIME_ZONES } from '@domain/access/time-zone';
import { BALANCE_TOLERANCE, TEAM_MEMBERS } from '@domain/jira/capacity';
import { SLA_TARGET_PERCENT } from '@domain/jira/sla-compliance';
import {
  buildDefinitionGroups,
  filterDefinitionGroups,
  visibleLinks,
} from '@presentation/definitions';
import { ROUTES } from '@presentation/routes';

const groups = buildDefinitionGroups();
const items = groups.flatMap((group) => group.items);
const textOf = (id: string): string => {
  const item = items.find((entry) => entry.id === id);
  if (!item) throw new Error(`no definition ${id}`);
  return `${item.meaning} ${item.how ?? ''}`;
};

const collaborator = resolvePermissions(
  { name: COLLABORATOR_ROLE_NAME, isSystem: true },
  (DEFAULT_ROLE_GRANTS[COLLABORATOR_ROLE_NAME] ?? []).map((permissionKey) => ({
    permissionKey,
    granted: true,
  })),
);
const leader = resolvePermissions({ name: LEADER_ROLE_NAME, isSystem: true }, []);

describe('the definitions are well formed', () => {
  it('has unique ids for groups and for entries, so every link to one lands in one place', () => {
    const ids = [...groups.map((g) => g.id), ...items.map((i) => i.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every group an introduction and entries, and every entry a term and a meaning', () => {
    for (const group of groups) {
      expect(group.title.trim(), group.id).not.toBe('');
      expect(group.intro.trim(), group.id).not.toBe('');
      expect(group.items.length, group.id).toBeGreaterThan(0);
    }
    for (const item of items) {
      expect(item.term.trim(), item.id).not.toBe('');
      expect(item.meaning.trim(), item.id).not.toBe('');
      expect(item.seenIn.length, item.id).toBeGreaterThan(0);
    }
  });

  it('only points to pages that exist', () => {
    const registered = new Set(ROUTES.map((route) => route.pattern));
    for (const item of items) {
      for (const link of item.seenIn)
        expect(registered.has(link.href), `${item.id} → ${link.href}`).toBe(true);
    }
  });

  it('explains every figure the dashboard shows', () => {
    const terms = items.map((item) => item.term);
    for (const expected of [
      'Fecha de corte',
      'Creados',
      'Completados en el periodo (resueltos)',
      '% de lo creado ya completado',
      'Tipos de solicitud obsoletos',
      'Tiempo típico de resolución',
      'Meta de SLA',
      'Cumplido / incumplido',
      'Retraso',
      'Ciclo en pausa',
      'Ciclo abierto en un ticket cerrado',
      'Carga',
      'El equipo',
      'Lo aprendido',
      'En equilibrio / por encima / por debajo',
      'Entran / salen por mes',
    ]) {
      expect(terms, expected).toContain(expected);
    }
  });
});

describe('the numbers in the text are the numbers the code uses', () => {
  it('states the SLA goal', () => {
    expect(SLA_TARGET_PERCENT).toBe(90);
    expect(textOf('sla-meta')).toContain('90 %');
  });

  it('states how often the data refreshes', () => {
    expect(textOf('fecha-de-corte')).toContain('15 minutos');
    expect(textOf('fecha-de-corte')).toContain('5 minutos');
  });

  it('states the balance margin and its floor', () => {
    expect(Math.round(BALANCE_TOLERANCE * 100)).toBe(25);
    expect(textOf('capacidad-equilibrio')).toContain('±25 %');
    expect(textOf('capacidad-equilibrio')).toContain('1 tarea');
  });

  it('names exactly the people the capacity page studies', () => {
    const text = textOf('capacidad-equipo');
    expect(text).toContain(`${String(TEAM_MEMBERS.length)} personas`);
    for (const member of TEAM_MEMBERS) expect(text).toContain(member);
  });

  it('states the windows used for the recent past', () => {
    expect(textOf('capacidad-terminadas')).toContain('90 días');
    expect(textOf('capacidad-ritmo')).toContain('3 meses');
    expect(textOf('tabla-trimestres')).toContain('8 trimestres');
  });

  it('lists the time zones a person can choose, the same ones the profile offers', () => {
    const text = textOf('zona-horaria');
    for (const zone of SUPPORTED_TIME_ZONES) expect(text).toContain(zone.label);
    expect(text).toContain('Bogotá');
  });

  it('states the protection against mass deletion', () => {
    expect(textOf('tickets-borrados')).toContain('20 %');
  });
});

describe('visibleLinks', () => {
  const statusLink = { label: 'Estado', href: '/estado' };
  const slaLink = { label: 'SLAs', href: '/sla' };

  it('keeps pages the reader may open and drops the ones they may not', () => {
    expect(visibleLinks([slaLink, statusLink], collaborator)).toEqual([slaLink]);
    expect(visibleLinks([slaLink, statusLink], leader)).toEqual([slaLink, statusLink]);
  });

  it('shows nothing to someone with no permissions, and ignores unknown pages', () => {
    expect(visibleLinks([slaLink], PermissionSet.EMPTY)).toEqual([]);
    expect(visibleLinks([{ label: 'Nada', href: '/no-existe' }], leader)).toEqual([]);
  });
});

describe('searching the definitions', () => {
  it('finds a term without caring about accents or case', () => {
    const found = filterDefinitionGroups(groups, 'TIEMPO tipico');
    const terms = found.flatMap((group) => group.items.map((item) => item.term));
    expect(terms).toContain('Tiempo típico de resolución');
  });

  it('needs every word, looks in the meaning and the method, and drops empty groups', () => {
    const found = filterDefinitionGroups(groups, 'reabre completado');
    expect(found.flatMap((group) => group.items.map((item) => item.id))).toContain('completados');
    expect(found.every((group) => group.items.length > 0)).toBe(true);
    expect(filterDefinitionGroups(groups, 'palabra que no existe en ninguna definicion')).toEqual(
      [],
    );
  });

  it('keeps everything for an empty search and ignores a very long one gracefully', () => {
    expect(filterDefinitionGroups(groups, '   ')).toBe(groups);
    expect(() => filterDefinitionGroups(groups, 'x'.repeat(5000))).not.toThrow();
  });
});
