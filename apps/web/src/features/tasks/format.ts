import { addDays } from '@ogarniacz/shared';

// Datę RRRR-MM-DD traktujemy jako północ UTC i formatujemy w UTC, żeby strefa telefonu jej nie przesunęła.
const shortDate = new Intl.DateTimeFormat('pl-PL', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });

/** Termin po ludzku: „dziś”, „jutro”, „wczoraj” albo „pon., 10 lis”. */
export function formatDue(dueOn: string, today: string): string {
  if (dueOn === today) return 'dziś';
  if (dueOn === addDays(today, 1)) return 'jutro';
  if (dueOn === addDays(today, -1)) return 'wczoraj';
  return shortDate.format(new Date(`${dueOn}T00:00:00Z`));
}
