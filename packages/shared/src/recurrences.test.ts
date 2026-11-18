import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type RecurrencePattern,
  daysBetween,
  describePattern,
  isoWeekday,
  latestOccurrence,
  nextOccurrence,
  occursOn,
  recurrencePatternSchema,
} from './recurrences';
import { addDays } from './time';

const anyDay = fc
  .date({ min: new Date('2020-01-01T00:00:00Z'), max: new Date('2040-12-31T00:00:00Z'), noInvalidDate: true })
  .map((moment) => moment.toISOString().slice(0, 10));

/** Wzorce takie, jakie przepuszcza schemat: dni tygodnia bez powtórzeń i posortowane. */
const weeklyPattern = fc
  .uniqueArray(fc.integer({ min: 1, max: 7 }), { minLength: 1, maxLength: 7 })
  .map((weekdays) => ({ kind: 'weekly' as const, weekdays: [...weekdays].sort((a, b) => a - b) }));
const anyPattern: fc.Arbitrary<RecurrencePattern> = fc.oneof(
  weeklyPattern,
  fc.integer({ min: 1, max: 365 }).map((days) => ({ kind: 'interval' as const, days })),
  fc.integer({ min: 1, max: 31 }).map((day) => ({ kind: 'monthly' as const, day })),
);

/** Wszystkie dni wystąpień w przedziale [from, to], wyliczone wprost z `occursOn`. */
function occurrences(pattern: RecurrencePattern, startOn: string, from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (occursOn(pattern, startOn, day)) days.push(day);
  }
  return days;
}

describe('occursOn', () => {
  it('co miesiąc 31. wypada ostatniego dnia krótszego miesiąca', () => {
    const pattern = { kind: 'monthly', day: 31 } as const;
    expect(occurrences(pattern, '2027-01-01', '2027-01-01', '2027-04-30')).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
    ]);
    expect(occursOn(pattern, '2028-01-01', '2028-02-29')).toBe(true);
  });

  it('co 3 dni liczy od dnia startu, także przez zmianę czasu', () => {
    const pattern = { kind: 'interval', days: 3 } as const;
    expect(occurrences(pattern, '2026-03-27', '2026-03-20', '2026-04-05')).toEqual([
      '2026-03-27',
      '2026-03-30',
      '2026-04-02',
      '2026-04-05',
    ]);
  });

  it('nigdy przed dniem startu', () => {
    fc.assert(
      fc.property(anyPattern, anyDay, fc.integer({ min: 1, max: 400 }), (pattern, startOn, before) => {
        expect(occursOn(pattern, startOn, addDays(startOn, -before))).toBe(false);
      }),
    );
  });

  it('co tydzień: w każdym pełnym tygodniu tyle wystąpień, ile wybranych dni, i tylko w te dni', () => {
    fc.assert(
      fc.property(weeklyPattern, anyDay, fc.integer({ min: 0, max: 300 }), (pattern, startOn, offset) => {
        const from = addDays(startOn, offset);
        const days = occurrences(pattern, startOn, from, addDays(from, 6));
        expect(days).toHaveLength(pattern.weekdays.length);
        expect(days.map(isoWeekday).sort((a, b) => a - b)).toEqual(pattern.weekdays);
      }),
    );
  });

  it('co N dni: kolejne wystąpienia dzieli dokładnie N dni', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 }), anyDay, (days, startOn) => {
        const found = occurrences({ kind: 'interval', days }, startOn, startOn, addDays(startOn, days * 5));
        expect(found[0]).toBe(startOn);
        for (let index = 1; index < found.length; index += 1) {
          expect(daysBetween(found[index - 1]!, found[index]!)).toBe(days);
        }
      }),
    );
  });

  it('co miesiąc: dokładnie jedno wystąpienie w każdym miesiącu po starcie', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 31 }), anyDay, fc.integer({ min: 1, max: 24 }), (day, startOn, monthsLater) => {
        const start = new Date(`${startOn}T00:00:00Z`);
        const first = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + monthsLater, 1));
        const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
        const iso = (moment: Date) => moment.toISOString().slice(0, 10);
        const found = occurrences({ kind: 'monthly', day }, startOn, iso(first), iso(last));
        expect(found).toHaveLength(1);
        expect(Number(found[0]!.slice(8))).toBe(Math.min(day, last.getUTCDate()));
      }),
    );
  });
});

describe('nextOccurrence', () => {
  it('to najwcześniejsze wystąpienie od podanego dnia i od startu', () => {
    fc.assert(
      fc.property(anyPattern, anyDay, fc.integer({ min: -60, max: 400 }), (pattern, startOn, offset) => {
        const from = addDays(startOn, offset);
        const next = nextOccurrence(pattern, startOn, from);
        // Każdy dopuszczony wzorzec powtarza się najwyżej co 365 dni, więc wystąpienie zawsze jest.
        expect(next).toBeDefined();
        const first = from < startOn ? startOn : from;
        expect(occursOn(pattern, startOn, next!)).toBe(true);
        expect(next! >= first).toBe(true);
        expect(occurrences(pattern, startOn, first, addDays(next!, -1))).toEqual([]);
      }),
    );
  });
});

describe('latestOccurrence', () => {
  it('to ostatnie wystąpienie w przedziale (after, upTo] albo nic, gdy go nie ma', () => {
    fc.assert(
      fc.property(
        anyPattern,
        anyDay,
        fc.integer({ min: -30, max: 200 }),
        fc.integer({ min: 0, max: 120 }),
        (pattern, startOn, afterOffset, length) => {
          const after = addDays(startOn, afterOffset);
          const upTo = addDays(after, length);
          const expected = occurrences(pattern, startOn, addDays(after, 1), upTo).at(-1);
          expect(latestOccurrence(pattern, startOn, after, upTo)).toBe(expected);
        },
      ),
    );
  });

  it('po długiej przerwie (serwer wyłączony) szuka tylko w ostatnim roku', () => {
    const pattern: RecurrencePattern = { kind: 'weekly', weekdays: [1] };
    expect(latestOccurrence(pattern, '2020-01-01', '2020-01-01', '2026-11-18')).toBe('2026-11-16');
  });
});

describe('describePattern', () => {
  it.each([
    [{ kind: 'weekly', weekdays: [1, 4] }, 'co tydzień: pon., czw.'],
    [{ kind: 'weekly', weekdays: [1, 2, 3, 4, 5, 6, 7] }, 'codziennie'],
    [{ kind: 'interval', days: 1 }, 'codziennie'],
    [{ kind: 'interval', days: 3 }, 'co 3 dni'],
    [{ kind: 'monthly', day: 15 }, 'co miesiąc, 15. dnia'],
  ] as const)('%j → %s', (pattern, expected) => {
    expect(describePattern(recurrencePatternSchema.parse(pattern))).toBe(expected);
  });
});

describe('recurrencePatternSchema', () => {
  it('porządkuje dni tygodnia i usuwa powtórzenia', () => {
    expect(recurrencePatternSchema.parse({ kind: 'weekly', weekdays: [4, 1, 4] })).toEqual({ kind: 'weekly', weekdays: [1, 4] });
  });
});
