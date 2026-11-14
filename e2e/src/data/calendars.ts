/** Serwer kalendarzy ICS z `src/setup/icsServer.mjs`. Dozwolony w konfiguracji serwera testowego. */
const ICS_ORIGIN = 'http://127.0.0.1:5199';

/** Link do kalendarza z dwoma wydarzeniami na dziś: 18:00–19:00 o podanym tytule i całodniowym z dopiskiem „(cały dzień)”. */
export function feedUrl(eventTitle: string): string {
  return `${ICS_ORIGIN}/feed/${encodeURIComponent(eventTitle)}.ics`;
}

/** Link, pod którym nie ma kalendarza, tylko strona HTML. */
export const NOT_A_CALENDAR_URL = `${ICS_ORIGIN}/not-ics`;
/** Link do nieistniejącego pliku (404). */
export const MISSING_CALENDAR_URL = `${ICS_ORIGIN}/gone.ics`;
/** Adres spoza listy dozwolonych hostów. */
export const FOREIGN_URL = 'https://example.com/kalendarz.ics';
