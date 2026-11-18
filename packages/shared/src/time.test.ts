import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { daysBetween, isoWeekday } from './recurrences';
import { addDays, warsawDate, weekStart } from './time';

/** Dowolny dzień RRRR-MM-DD z lat 2000–2099. */
const anyDay = fc
  .date({ min: new Date('2000-01-01T00:00:00Z'), max: new Date('2099-12-31T00:00:00Z'), noInvalidDate: true })
  .map((moment) => moment.toISOString().slice(0, 10));

describe('warsawDate', () => {
  it.each([
    // Zmiana na czas letni 29 marca 2026: o 2:00 CET zegar skacze na 3:00 CEST.
    ['2026-03-28T22:59:59Z', '2026-03-28'],
    ['2026-03-28T23:00:00Z', '2026-03-29'],
    ['2026-03-29T00:59:59Z', '2026-03-29'],
    ['2026-03-29T21:59:59Z', '2026-03-29'],
    ['2026-03-29T22:00:00Z', '2026-03-30'],
    // Powrót do czasu zimowego 25 października 2026: o 3:00 CEST zegar cofa się na 2:00 CET.
    ['2026-10-24T21:59:59Z', '2026-10-24'],
    ['2026-10-24T22:00:00Z', '2026-10-25'],
    ['2026-10-25T22:59:59Z', '2026-10-25'],
    ['2026-10-25T23:00:00Z', '2026-10-26'],
    // Sylwester: w Polsce nowy rok zaczyna się godzinę przed UTC.
    ['2026-12-31T22:59:59Z', '2026-12-31'],
    ['2026-12-31T23:00:00Z', '2027-01-01'],
    // Rok przestępny.
    ['2028-02-28T23:00:00Z', '2028-02-29'],
  ])('%s to w Polsce %s', (moment, expected) => {
    expect(warsawDate(new Date(moment))).toBe(expected);
  });

  it('daje dzień UTC przesunięty o godzinę albo dwie, nigdy inny', () => {
    fc.assert(
      fc.property(fc.date({ min: new Date('2000-01-01T00:00:00Z'), max: new Date('2099-12-31T00:00:00Z'), noInvalidDate: true }), (moment) => {
        const plusOne = new Date(moment.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
        const plusTwo = new Date(moment.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
        expect([plusOne, plusTwo]).toContain(warsawDate(moment));
      }),
    );
  });
});

describe('addDays', () => {
  it('przechodzi przez koniec miesiąca, roku i 29 lutego', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('nie zmienia się przy zmianie czasu', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
  });

  it('jest odwracalne i zgodne z daysBetween', () => {
    fc.assert(
      fc.property(anyDay, fc.integer({ min: -1000, max: 1000 }), (day, days) => {
        const moved = addDays(day, days);
        expect(moved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(addDays(moved, -days)).toBe(day);
        expect(daysBetween(day, moved)).toBe(days);
      }),
    );
  });

  it('dodawanie po kawałku daje to samo co naraz', () => {
    fc.assert(
      fc.property(anyDay, fc.integer({ min: -400, max: 400 }), fc.integer({ min: -400, max: 400 }), (day, a, b) => {
        expect(addDays(addDays(day, a), b)).toBe(addDays(day, a + b));
      }),
    );
  });
});

describe('weekStart', () => {
  it('to poniedziałek tego samego tygodnia', () => {
    expect(weekStart('2026-11-16')).toBe('2026-11-16');
    expect(weekStart('2026-11-22')).toBe('2026-11-16');
    expect(weekStart('2026-11-23')).toBe('2026-11-23');
    // Tydzień na przełomie roku.
    expect(weekStart('2027-01-01')).toBe('2026-12-28');
  });

  it('dla każdego dnia: poniedziałek, najwyżej 6 dni wcześniej, stały w obrębie tygodnia', () => {
    fc.assert(
      fc.property(anyDay, (day) => {
        const start = weekStart(day);
        expect(isoWeekday(start)).toBe(1);
        const offset = daysBetween(start, day);
        expect(offset).toBeGreaterThanOrEqual(0);
        expect(offset).toBeLessThanOrEqual(6);
        expect(weekStart(addDays(start, 6))).toBe(start);
        expect(weekStart(addDays(start, 7))).toBe(addDays(start, 7));
      }),
    );
  });
});
