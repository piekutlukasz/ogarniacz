import { describe, expect, it } from 'vitest';
import { formatDay, formatWeek, formatWeekday, taskCount } from './format';

describe('daty kieszonkowego', () => {
  it('dzień i dzień tygodnia', () => {
    expect(formatDay('2026-11-16')).toBe('16 lis');
    expect(formatWeekday('2026-11-17')).toBe('wt.');
  });

  it('tydzień w jednym miesiącu i na przełomie miesięcy', () => {
    expect(formatWeek('2026-11-02')).toBe('2–8 lis');
    expect(formatWeek('2026-10-26')).toBe('26 paź – 1 lis');
  });
});

describe('taskCount', () => {
  it.each([
    [1, '1 zadanie'],
    [2, '2 zadania'],
    [4, '4 zadania'],
    [5, '5 zadań'],
    [12, '12 zadań'],
    [14, '14 zadań'],
    [22, '22 zadania'],
    [0, '0 zadań'],
    [112, '112 zadań'],
    [124, '124 zadania'],
  ])('%i → %s', (count, expected) => {
    expect(taskCount(count)).toBe(expected);
  });
});
