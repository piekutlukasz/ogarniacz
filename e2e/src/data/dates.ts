import { addDays } from '@ogarniacz/shared';

const WARSAW = 'Europe/Warsaw';

/** Nagłówek zegara testów (`apps/api/src/testClock.ts`): chwila, którą serwer uzna za „teraz”. */
export const TEST_NOW_HEADER = 'X-Test-Now';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ta sama chwila o podaną liczbę dni później (albo wcześniej). */
export function shiftDays(at: Date, days: number): Date {
  return new Date(at.getTime() + days * DAY_MS);
}

const dayAndMonth = new Intl.DateTimeFormat('pl-PL', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const dayOnly = new Intl.DateTimeFormat('pl-PL', { timeZone: 'UTC', day: 'numeric' });
const utc = (date: string) => new Date(`${date}T00:00:00Z`);

/** Tydzień tak, jak pisze go ekran „Kieszonkowe”, np. „2–8 lis” albo „26 paź – 1 lis”. */
export function weekLabel(weekStart: string): string {
  const end = addDays(weekStart, 6);
  return weekStart.slice(0, 7) === end.slice(0, 7)
    ? `${dayOnly.format(utc(weekStart))}–${dayAndMonth.format(utc(end))}`
    : `${dayAndMonth.format(utc(weekStart))} – ${dayAndMonth.format(utc(end))}`;
}

/** Dzisiejsza data w Polsce w formacie RRRR-MM-DD, tak jak liczy ją serwer. */
export function warsawToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: WARSAW }).format(now);
}

/** Dzisiejszy dzień tygodnia w Polsce, jak w przyciskach formularza: „poniedziałek”… */
export function warsawWeekday(now = new Date()): string {
  return new Intl.DateTimeFormat('pl-PL', { timeZone: WARSAW, weekday: 'long' }).format(now);
}
