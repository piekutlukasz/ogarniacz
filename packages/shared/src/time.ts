export const TIME_ZONE = 'Europe/Warsaw';

// en-CA formatuje datę jako RRRR-MM-DD, czyli tak jak termin zadania.
const dateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Dzień kalendarzowy w Polsce dla danej chwili, np. `2026-11-08`. */
export function warsawDate(moment: Date): string {
  return dateFormat.format(moment);
}

/** Dodaje dni do daty RRRR-MM-DD. Liczy w UTC, więc zmiana czasu nie przesuwa wyniku. */
export function addDays(date: string, days: number): string {
  const moment = new Date(`${date}T00:00:00Z`);
  moment.setUTCDate(moment.getUTCDate() + days);
  return moment.toISOString().slice(0, 10);
}

/** Poniedziałek tygodnia, w którym leży data RRRR-MM-DD. Tydzień kieszonkowego trwa od poniedziałku do niedzieli. */
export function weekStart(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
  return addDays(date, 1 - weekday);
}
