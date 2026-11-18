import { describe, expect, it } from 'vitest';
import { formatDue } from './format';

describe('formatDue', () => {
  it('dziś, jutro i wczoraj słowami, także na przełomie miesiąca i roku', () => {
    expect(formatDue('2026-11-18', '2026-11-18')).toBe('dziś');
    expect(formatDue('2027-01-01', '2026-12-31')).toBe('jutro');
    expect(formatDue('2026-11-30', '2026-12-01')).toBe('wczoraj');
  });

  it('inne dni z dniem tygodnia, niezależnie od strefy telefonu', () => {
    expect(formatDue('2026-11-10', '2026-11-18')).toBe('wt., 10 lis');
  });
});
