import { describe, expect, it } from 'vitest';
import {
  describeChange,
  describeComparedDelta,
  describeDelta,
  formatNumber,
  formatPercent,
  monthShortName,
} from '@presentation/format-number';

describe('number formatting (Spanish)', () => {
  it('uses a decimal comma and at most one decimal', () => {
    expect(formatNumber(84.5)).toBe('84,5');
    expect(formatNumber(90)).toBe('90');
    expect(formatNumber(1046)).toBe('1.046');
    expect(formatNumber(12345.6)).toBe('12.345,6');
    expect(formatPercent(84.5)).toBe('84,5 %');
    expect(formatPercent(null)).toBe('Sin datos');
  });

  it('names months in Spanish regardless of the server zone', () => {
    expect(monthShortName(2026, 11)).toBe('nov');
    expect(monthShortName(2026, 1)).toBe('ene');
  });
});

describe('describeChange', () => {
  it('words the direction, so it never depends on color', () => {
    expect(describeChange(5, 3, 'T3 2026')).toBe('▲ +2 frente a T3 2026');
    expect(describeChange(3, 5, 'T3 2026')).toBe('▼ −2 frente a T3 2026');
    expect(describeChange(4, 4, 'T3 2026')).toBe('Igual que T3 2026');
    expect(describeChange(11.5, 41, 'T3 2026', ' días')).toBe('▼ −29,5 días frente a T3 2026');
  });

  it('says so when there is nothing to compare', () => {
    expect(describeChange(null, 3, 'T3 2026')).toBe('Sin datos todavía');
    expect(describeChange(3, null, 'T3 2026')).toBe('Sin dato de T3 2026 para comparar');
  });
});

describe('describeDelta', () => {
  it('splits the move into direction, tone and plain text', () => {
    expect(describeDelta(152, 150, 'T3 2026', 'better')).toEqual({
      direction: 'up',
      tone: 'good',
      text: '+2 frente a T3 2026',
    });
    expect(describeDelta(7.8, 6.9, 'T3 2026', 'worse', ' días')).toEqual({
      direction: 'up',
      tone: 'bad',
      text: '+0,9 días frente a T3 2026',
    });
    expect(describeDelta(3, 5, 'T3 2026', 'better')).toMatchObject({
      direction: 'down',
      tone: 'bad',
    });
    expect(describeDelta(3, 5, 'T3 2026', 'worse')).toMatchObject({
      direction: 'down',
      tone: 'good',
    });
  });

  it('keeps volumes neutral when more or less is not good or bad in itself', () => {
    expect(describeDelta(149, 120, 'T3 2026', 'neutral')).toMatchObject({
      direction: 'up',
      tone: 'neutral',
    });
    expect(describeDelta(149, 149, 'T3 2026', 'neutral')).toEqual({
      direction: 'flat',
      tone: 'neutral',
      text: 'Igual que T3 2026',
    });
  });

  it('says so when there is nothing to compare', () => {
    expect(describeDelta(null, 3, 'T3 2026', 'better').text).toBe('Sin datos todavía');
    expect(describeDelta(3, null, 'T3 2026', 'better').text).toBe(
      'Sin dato de T3 2026 para comparar',
    );
  });
});

describe('describeComparedDelta', () => {
  const base = { reference: 'período anterior', higherIs: 'better' as const };

  it('says a count moved as a percentage, with the previous value in brackets', () => {
    expect(describeComparedDelta({ ...base, kind: 'count', current: 118, previous: 102 })).toEqual({
      direction: 'up',
      tone: 'good',
      text: '+16 % vs período anterior (102)',
    });
    expect(describeComparedDelta({ ...base, kind: 'count', current: 80, previous: 100 }).text).toBe(
      '−20 % vs período anterior (100)',
    );
  });

  it('says a rate moved in points and a time in days', () => {
    expect(describeComparedDelta({ ...base, kind: 'rate', current: 87.2, previous: 84 }).text).toBe(
      '+3,2 pp vs período anterior (84 %)',
    );
    const days = describeComparedDelta({
      reference: 'año previo',
      higherIs: 'worse',
      kind: 'days',
      current: 10.5,
      previous: 12,
    });
    expect(days).toEqual({
      direction: 'down',
      tone: 'good',
      text: '−1,5 días vs año previo (12 días)',
    });
  });

  it('shows the plain gap, not a percentage, when the previous side has too few cases', () => {
    const small = { ...base, kind: 'count' as const, current: 100, previous: 12 };
    expect(describeComparedDelta({ ...small, previousSample: 12 }).text).toBe(
      '+88 vs período anterior (12)',
    );
    expect(describeComparedDelta({ ...small, previousSample: 29 }).text).toContain('+88 vs');
    expect(describeComparedDelta({ ...small, previousSample: 30 }).text).toBe(
      '+733 % vs período anterior (12)',
    );
    expect(describeComparedDelta({ ...small, previousSample: null }).text).toContain('%');
  });

  it('does not divide by zero', () => {
    expect(describeComparedDelta({ ...base, kind: 'count', current: 5, previous: 0 }).text).toBe(
      '— vs período anterior (0)',
    );
  });

  it('says so when there is nothing to compare, or nothing moved', () => {
    expect(describeComparedDelta({ ...base, kind: 'count', current: null, previous: 3 }).text).toBe(
      'Sin datos todavía',
    );
    expect(describeComparedDelta({ ...base, kind: 'count', current: 3, previous: null }).text).toBe(
      'Sin datos del período anterior',
    );
    expect(describeComparedDelta({ ...base, kind: 'count', current: 3, previous: 3 })).toEqual({
      direction: 'flat',
      tone: 'neutral',
      text: 'Igual que período anterior (3)',
    });
  });

  it('is neutral when more is neither better nor worse', () => {
    expect(
      describeComparedDelta({
        ...base,
        higherIs: 'neutral',
        kind: 'count',
        current: 9,
        previous: 3,
      }).tone,
    ).toBe('neutral');
  });
});
