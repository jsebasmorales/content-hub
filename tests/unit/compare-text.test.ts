import { describe, expect, it } from 'vitest';
import { COMPARE_DEFINITIONS } from '@presentation/definitions';
import { planComparison } from '@domain/jira/comparison';
import { MIN_RELIABLE_SAMPLE, resolveWindow } from '@domain/jira/period-window';
import {
  boxHeadline,
  cardNote,
  compareNote,
  coverageNote,
  referenceName,
  sampleNote,
} from '../../src/presentation/compare-text';

const ok = { coverage: 'ok', since: null } as const;
const none = { coverage: 'none', since: null } as const;
const partial = { coverage: 'partial', since: { year: 2025, month: 4, day: 8 } } as const;

describe('the words of the comparison', () => {
  it('flags a small sample exactly below the threshold, with the number', () => {
    expect(sampleNote(MIN_RELIABLE_SAMPLE - 1)?.text).toBe('Pocos datos del año previo (n = 29)');
    expect(sampleNote(MIN_RELIABLE_SAMPLE)).toBeNull();
    expect(sampleNote(0)?.text).toBe('Pocos datos del año previo (n = 0)');
    expect(sampleNote(null)).toBeNull();
  });

  it('says where the data begins when it only reaches part of the previous side', () => {
    expect(coverageNote(partial)?.text).toBe('Datos del año previo desde el 8 abr 2025.');
    expect(coverageNote(none)?.text).toBe('Sin datos del año previo.');
    expect(coverageNote(ok)).toBeNull();
  });

  it('puts no data before partial data before a small sample', () => {
    expect(compareNote(none, 5)?.kind).toBe('none');
    expect(compareNote(partial, 5)?.kind).toBe('partial');
    expect(compareNote(ok, 5)?.kind).toBe('small');
  });

  it('a card never repeats what the section or its own delta already says', () => {
    expect(cardNote(none, 3)).toBeNull();
    expect(cardNote(partial, 40)).toBeNull();
    expect(cardNote(ok, 12)?.kind).toBe('small');
  });

  it('names the reference and the box from the window, never from typed dates', () => {
    const window = resolveWindow(
      {
        kind: 'custom',
        from: { year: 2026, month: 10, day: 15 },
        to: { year: 2026, month: 11, day: 13 },
      },
      new Date('2026-11-13T17:00:00Z'),
    );
    if (!window) throw new Error('a window was expected');
    const empty = { tickets: null, cycles: null };
    const on = planComparison(window, true, empty);
    expect(referenceName(on)).toBe('año previo');
    expect(referenceName(planComparison(window, false, empty))).toBe('período anterior');
    expect(boxHeadline(on)).toBe('Sin datos suficientes del año previo');
    const covered = planComparison(window, true, {
      tickets: new Date('2025-04-08T15:00:00Z'),
      cycles: new Date('2025-04-08T15:00:00Z'),
    });
    expect(boxHeadline(covered)).toBe('15 oct 2025 – 13 nov 2025');
  });
});

describe('the definitions of the comparison', () => {
  it('state the threshold from the constant and the exact words of the note', () => {
    const text = COMPARE_DEFINITIONS.map((item) => item.meaning).join(' ');
    expect(text).toContain(`Con menos de ${String(MIN_RELIABLE_SAMPLE)} casos`);
    expect(text).toContain('Pocos datos del año previo (n = …)');
    expect(COMPARE_DEFINITIONS.map((item) => item.id)).toEqual([
      'comparar-anio-previo',
      'comparacion-fiable',
    ]);
  });
});
