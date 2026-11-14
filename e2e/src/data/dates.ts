const WARSAW = 'Europe/Warsaw';

/** Dzisiejsza data w Polsce w formacie RRRR-MM-DD, tak jak liczy ją serwer. */
export function warsawToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: WARSAW }).format(now);
}

/** Dzisiejszy dzień tygodnia w Polsce, jak w przyciskach formularza: „poniedziałek”… */
export function warsawWeekday(now = new Date()): string {
  return new Intl.DateTimeFormat('pl-PL', { timeZone: WARSAW, weekday: 'long' }).format(now);
}
