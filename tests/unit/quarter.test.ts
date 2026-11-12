import { describe, expect, it } from 'vitest';
import { REPORTING_TIME_ZONE, quarterOf } from '@domain/jira/quarter';

describe('quarterOf', () => {
  it('reports in Bogota time by default', () => {
    expect(REPORTING_TIME_ZONE).toBe('America/Bogota');
  });

  it('uses the calendar quarter of the local date, not the UTC date', () => {
    // 03:00 UTC on 1 January is still 31 December at 22:00 in Bogota (UTC-5).
    expect(quarterOf(new Date('2026-01-01T03:00:00Z'))).toEqual({ year: 2025, quarter: 4 });
    expect(quarterOf(new Date('2026-01-01T05:00:00Z'))).toEqual({ year: 2026, quarter: 1 });
  });

  it('switches quarter exactly at local midnight', () => {
    expect(quarterOf(new Date('2026-04-01T04:59:59Z'))).toEqual({ year: 2026, quarter: 1 });
    expect(quarterOf(new Date('2026-04-01T05:00:00Z'))).toEqual({ year: 2026, quarter: 2 });
    expect(quarterOf(new Date('2026-07-01T05:00:00Z'))).toEqual({ year: 2026, quarter: 3 });
    expect(quarterOf(new Date('2026-10-01T05:00:00Z'))).toEqual({ year: 2026, quarter: 4 });
  });

  it('puts the last local moments of the year in Q4', () => {
    expect(quarterOf(new Date('2027-01-01T04:59:59Z'))).toEqual({ year: 2026, quarter: 4 });
  });

  it('honours an explicit time zone', () => {
    expect(quarterOf(new Date('2026-04-01T04:59:59Z'), 'UTC')).toEqual({ year: 2026, quarter: 2 });
    expect(quarterOf(new Date('2026-03-31T23:30:00Z'), 'Asia/Tokyo')).toEqual({
      year: 2026,
      quarter: 2,
    });
  });
});
