import { addDays } from '@ogarniacz/shared';

// Datę RRRR-MM-DD traktujemy jako północ UTC i formatujemy w UTC, żeby strefa telefonu jej nie przesunęła.
const dayAndMonth = new Intl.DateTimeFormat('pl-PL', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const dayOnly = new Intl.DateTimeFormat('pl-PL', { timeZone: 'UTC', day: 'numeric' });
const weekdayShort = new Intl.DateTimeFormat('pl-PL', { timeZone: 'UTC', weekday: 'short' });

const utc = (date: string) => new Date(`${date}T00:00:00Z`);

/** Dzień po ludzku, np. „16 lis”. */
export function formatDay(date: string): string {
  return dayAndMonth.format(utc(date));
}

/** Dzień tygodnia, np. „wt.”. */
export function formatWeekday(date: string): string {
  return weekdayShort.format(utc(date));
}

/** Tydzień od poniedziałku do niedzieli, np. „2–8 lis” albo „26 paź – 1 lis”. */
export function formatWeek(weekStart: string): string {
  const end = addDays(weekStart, 6);
  return weekStart.slice(0, 7) === end.slice(0, 7)
    ? `${dayOnly.format(utc(weekStart))}–${formatDay(end)}`
    : `${formatDay(weekStart)} – ${formatDay(end)}`;
}

/** „1 zadanie”, „2 zadania”, „5 zadań”. */
export function taskCount(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (count === 1) return '1 zadanie';
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${count} zadania`;
  return `${count} zadań`;
}
