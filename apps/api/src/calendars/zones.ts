import { TIME_ZONE } from '@ogarniacz/shared';

/** Nazwy stref z Outlooka i Windowsa, które trafiają do plików ICS zamiast nazw IANA. */
const WINDOWS_ZONES: Record<string, string> = {
  'W. Europe Standard Time': 'Europe/Berlin',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Central European Standard Time': 'Europe/Warsaw',
  'Romance Standard Time': 'Europe/Paris',
  'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'E. Europe Standard Time': 'Europe/Chisinau',
  'FLE Standard Time': 'Europe/Kyiv',
  'GTB Standard Time': 'Europe/Bucharest',
  'Russian Standard Time': 'Europe/Moscow',
  'Turkey Standard Time': 'Europe/Istanbul',
  'Eastern Standard Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles',
  UTC: 'UTC',
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  let format = formatters.get(zone);
  if (!format) {
    // Rzuca RangeError dla nieznanej strefy, więc służy też do sprawdzania nazw.
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(zone, format);
  }
  return format;
}

function isIana(zone: string): boolean {
  try {
    formatterFor(zone);
    return true;
  } catch {
    return false;
  }
}

/**
 * Zamienia wartość `TZID` na nazwę IANA albo `null`, gdy strefy nie znamy.
 * Rozumie nazwy IANA, nazwy z Windowsa i warianty z prefiksem, np. `/mozilla.org/20050126_1/Europe/Warsaw`.
 */
export function resolveZone(tzid: string): string | null {
  const name = tzid.trim().replace(/^"|"$/g, '');
  if (isIana(name)) return name;
  const windows = WINDOWS_ZONES[name];
  if (windows) return windows;
  const parts = name.split('/');
  if (parts.length >= 2) {
    const suffix = parts.slice(-2).join('/');
    if (isIana(suffix)) return suffix;
  }
  return null;
}

/** Przesunięcie strefy względem UTC w milisekundach dla danej chwili. */
function offsetAt(instant: number, zone: string): number {
  const values: Record<string, number> = {};
  for (const part of formatterFor(zone).formatToParts(new Date(instant))) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  const local = Date.UTC(values.year as number, (values.month as number) - 1, values.day as number, values.hour, values.minute, values.second);
  return local - Math.floor(instant / 1000) * 1000;
}

export type WallClock = { year: number; month: number; day: number; hour: number; minute: number; second: number };

/**
 * Zamienia czas ścienny w danej strefie na chwilę. Nie zależy od strefy procesu.
 * Godzina, która w dniu zmiany czasu nie istnieje, przesuwa się o godzinę do przodu.
 */
export function zonedToInstant(wall: WallClock, zone: string): number {
  if (zone === 'UTC') return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  const first = guess - offsetAt(guess, zone);
  const second = guess - offsetAt(first, zone);
  return second;
}

export const DEFAULT_ZONE = TIME_ZONE;
