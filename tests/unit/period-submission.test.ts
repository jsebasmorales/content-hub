import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRESET,
  presetFromSubmission,
  type SubmittedPeriod,
} from '@domain/jira/period-window';

const today = { year: 2026, month: 11, day: 13 };
const day = (year: number, month: number, d: number) => ({ year, month, day: d });

/** What the page drew: T4 chosen and its dates in the date field. */
const base: SubmittedPeriod = {
  chip: 'T4',
  year: 2026,
  from: day(2026, 10, 1),
  to: day(2026, 12, 31),
  shownFrom: day(2026, 10, 1),
  shownTo: day(2026, 12, 31),
};
const quarter = (year: number, q: 1 | 2 | 3 | 4) => ({
  kind: 'quarter' as const,
  quarter: { year, quarter: q },
});

describe('presetFromSubmission: what an "Aplicar" without script means', () => {
  it('lets the chip win when the dates were left as they were drawn', () => {
    expect(presetFromSubmission({ ...base, chip: 'T1' }, today)).toEqual(quarter(2026, 1));
  });

  it('lets the year win when only the year changed', () => {
    expect(presetFromSubmission({ ...base, year: 2025 }, today)).toEqual(quarter(2025, 4));
  });

  it('takes the 30-day chip as the rolling default', () => {
    expect(presetFromSubmission({ ...base, chip: '30d' }, today)).toEqual({
      kind: 'rolling',
      days: 30,
    });
  });

  it('uses the current year when a quarter chip comes with no year', () => {
    expect(presetFromSubmission({ ...base, chip: 'T2', year: null }, today)).toEqual(
      quarter(2026, 2),
    );
  });

  it('makes a custom range when the person typed other dates, whatever the chip says', () => {
    expect(
      presetFromSubmission({ ...base, from: day(2026, 10, 5), to: day(2026, 10, 20) }, today),
    ).toEqual({ kind: 'custom', from: day(2026, 10, 5), to: day(2026, 10, 20) });
  });

  it('counts a single changed date as typed, as long as both dates came', () => {
    expect(presetFromSubmission({ ...base, to: day(2026, 12, 15) }, today)).toEqual({
      kind: 'custom',
      from: day(2026, 10, 1),
      to: day(2026, 12, 15),
    });
  });

  it('treats dates as typed when the page did not send the ones it had drawn', () => {
    const noShown = {
      ...base,
      shownFrom: null,
      shownTo: null,
      from: day(2026, 9, 1),
      to: day(2026, 9, 30),
    };
    expect(presetFromSubmission(noShown, today)).toEqual({
      kind: 'custom',
      from: day(2026, 9, 1),
      to: day(2026, 9, 30),
    });
  });

  it('falls back to the default for anything unusable', () => {
    const empty = { chip: null, year: null, from: null, to: null, shownFrom: null, shownTo: null };
    expect(presetFromSubmission(empty, today)).toEqual(DEFAULT_PRESET);
    expect(presetFromSubmission({ ...base, chip: 'T5' }, today)).toEqual(DEFAULT_PRESET);
    expect(presetFromSubmission({ ...base, chip: 'nope', year: null }, today)).toEqual(
      DEFAULT_PRESET,
    );
  });

  it('ignores a lone date and lets the chip decide', () => {
    expect(presetFromSubmission({ ...base, chip: '30d', from: null }, today)).toEqual(
      DEFAULT_PRESET,
    );
    expect(presetFromSubmission({ ...base, chip: 'T3', to: null }, today)).toEqual(
      quarter(2026, 3),
    );
  });

  it('falls back to the default for a year outside the range the address bar accepts', () => {
    expect(presetFromSubmission({ ...base, year: 1900 }, today)).toEqual(DEFAULT_PRESET);
    expect(presetFromSubmission({ ...base, year: 99999 }, today)).toEqual(DEFAULT_PRESET);
    expect(presetFromSubmission({ ...base, year: 2000 }, today)).toEqual(quarter(2000, 4));
  });

  it('keeps a custom range when the page showed no chip and the dates were left alone', () => {
    expect(presetFromSubmission({ ...base, chip: null }, today)).toEqual({
      kind: 'custom',
      from: day(2026, 10, 1),
      to: day(2026, 12, 31),
    });
  });
});
