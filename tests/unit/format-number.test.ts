import { describe, expect, it } from 'vitest';
import {
  describeChange,
  formatNumber,
  formatPercent,
  monthShortName,
} from '@presentation/format-number';

describe('number formatting (Spanish)', () => {
  it('uses a decimal comma and at most one decimal', () => {
    expect(formatNumber(84.5)).toBe('84,5');
    expect(formatNumber(90)).toBe('90');
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
