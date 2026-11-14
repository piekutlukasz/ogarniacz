import { addDays, warsawDate } from '@ogarniacz/shared';
import ICAL from 'ical.js';
import { DEFAULT_ZONE, type WallClock, resolveZone, zonedToInstant } from './zones';

/** Wystąpienie wydarzenia gotowe do zapisania w `calendar_events`. */
export type ParsedEvent = {
  uid: string;
  /** Odróżnia wystąpienia jednej serii. Puste przy wydarzeniu jednorazowym. */
  instance: string;
  title: string;
  location: string | null;
  allDay: boolean;
  /** Chwile UTC. Puste przy wydarzeniach całodniowych. */
  startsAt: Date | null;
  endsAt: Date | null;
  /** Dni RRRR-MM-DD w czasie polskim, obie granice włącznie. */
  startOn: string;
  endOn: string;
};

export type ParseResult = {
  events: ParsedEvent[];
  /** Serie pominięte z powodu limitu kroków albo czasu. Tylko licznik, bez treści. */
  skippedSeries: number;
  /** Wydarzenia ze strefą, której nie znamy; liczone jako czas polski. */
  unknownZones: number;
};

export class IcsFormatError extends Error {}
/** Po odrzuceniu starych wydarzeń plik nadal jest za duży na bezpieczne parsowanie w głównym wątku. */
export class IcsTooLargeError extends Error {}

export const MAX_PARSE_CHARS = 2_000_000;

export const WINDOW_DAYS_BACK = 1;
export const WINDOW_DAYS_AHEAD = 45;
export const MAX_EVENTS = 3000;
export const MAX_ITERATION_STEPS = 20_000;
export const MAX_SERIES_MS = 2000;
const MAX_TITLE = 200;
const MAX_LOCATION = 120;

// Znaki sterujące i sterowanie kierunkiem tekstu (można nimi podszyć nazwę wydarzenia).
const UNSAFE_CHARS = /[\u0000-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/g;

function clean(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(UNSAFE_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

function dayOf(time: ICAL.Time): string {
  return `${pad(time.year, 4)}-${pad(time.month)}-${pad(time.day)}`;
}

function wallOf(time: ICAL.Time): WallClock {
  return { year: time.year, month: time.month, day: time.day, hour: time.hour, minute: time.minute, second: time.second };
}

/**
 * Wstępne odrzucenie starych wydarzeń jednorazowych przed parserem. Google oddaje w pliku całą historię kalendarza,
 * a koszt parsowania rośnie z rozmiarem. Serie, wyjątki i wydarzenia bez dat zostają.
 */
export function dropOldEvents(text: string, fromDay: string): string {
  // Margines doby po obu stronach pokrywa strefy; zostawiamy wszystko, co mogłoby sięgać okna.
  const limit = addDays(fromDay, -2).replaceAll('-', '');
  return text.replace(/BEGIN:VEVENT\r?\n[\s\S]*?END:VEVENT\r?\n?/g, (block) => {
    if (/^(RRULE|RDATE|RECURRENCE-ID|EXRULE)[;:]/m.test(block)) return block;
    const dates = [...block.matchAll(/^(?:DTSTART|DTEND)[^:\r\n]*:(\d{8})/gm)].map((match) => match[1] as string);
    if (dates.length === 0) return block;
    return dates.every((date) => date < limit) ? '' : block;
  });
}

type ZoneInfo = { zone: string; known: boolean };

function zoneOfProperty(property: ICAL.Property | null, fallback: string): ZoneInfo {
  if (!property) return { zone: fallback, known: true };
  const value = property.getFirstValue();
  if (value instanceof ICAL.Time && value.zone === ICAL.Timezone.utcTimezone) return { zone: 'UTC', known: true };
  const tzid = property.getParameter('tzid');
  if (typeof tzid !== 'string') return { zone: fallback, known: true };
  const zone = resolveZone(tzid);
  return zone ? { zone, known: true } : { zone: DEFAULT_ZONE, known: false };
}

type Raw = {
  uid: string;
  instance: string;
  title: string;
  location: string | null;
  start: ICAL.Time;
  end: ICAL.Time | null;
  zone: ZoneInfo;
};

function toParsed(raw: Raw): ParsedEvent {
  const title = raw.title || '(bez tytułu)';
  if (raw.start.isDate) {
    const startOn = dayOf(raw.start);
    // Koniec wydarzenia całodniowego w ICS jest wyłączny.
    let endOn = raw.end?.isDate ? addDays(dayOf(raw.end), -1) : startOn;
    if (endOn < startOn) endOn = startOn;
    return { uid: raw.uid, instance: raw.instance, title, location: raw.location, allDay: true, startsAt: null, endsAt: null, startOn, endOn };
  }
  const startsAt = zonedToInstant(wallOf(raw.start), raw.zone.zone);
  let endsAt = raw.end && !raw.end.isDate ? zonedToInstant(wallOf(raw.end), raw.zone.zone) : startsAt;
  if (endsAt < startsAt) endsAt = startsAt;
  // Wydarzenie kończące się dokładnie o północy należy do poprzedniego dnia.
  const lastMoment = endsAt > startsAt ? endsAt - 1 : endsAt;
  return {
    uid: raw.uid,
    instance: raw.instance,
    title,
    location: raw.location,
    allDay: false,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
    startOn: warsawDate(new Date(startsAt)),
    endOn: warsawDate(new Date(lastMoment)),
  };
}

function isCancelled(component: ICAL.Component): boolean {
  return String(component.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED';
}

function textOf(component: ICAL.Component, name: string, max: number): string {
  return clean(component.getFirstPropertyValue(name), max);
}

/**
 * Zamienia plik ICS na wystąpienia z okna od wczoraj do 45 dni w przód (liczone od `now` w czasie polskim).
 *
 * Czas nie zależy od strefy procesu: dat całodniowych i czasu ściennego nie zamieniamy przez `toJSDate()`.
 * Strefy rozwiązujemy sami (IANA, nazwy Windows), a `VTIMEZONE` z pliku pomijamy. Czas bez strefy
 * liczymy w strefie z `X-WR-TIMEZONE` albo w polskiej. Nieznana strefa daje czas polski.
 */
export function parseIcs(text: string, now: Date): ParseResult {
  if (!/^BEGIN:VCALENDAR/m.test(text)) throw new IcsFormatError('To nie jest plik kalendarza');

  const today = warsawDate(now);
  const fromDay = addDays(today, -WINDOW_DAYS_BACK);
  const toDay = addDays(today, WINDOW_DAYS_AHEAD);

  const trimmed = dropOldEvents(text, fromDay);
  if (trimmed.length > MAX_PARSE_CHARS) throw new IcsTooLargeError('Plik kalendarza jest za duży');

  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(trimmed));
  } catch {
    // Treść błędu parsera może zawierać fragment pliku, więc jej nie przekazujemy.
    throw new IcsFormatError('Nie udało się odczytać pliku kalendarza');
  }

  const calendarZone = resolveZone(String(root.getFirstPropertyValue('x-wr-timezone') ?? '')) ?? DEFAULT_ZONE;
  const result: ParseResult = { events: [], skippedSeries: 0, unknownZones: 0 };
  const found = new Map<string, ParsedEvent>();

  const add = (raw: Raw) => {
    if (!raw.zone.known) result.unknownZones += 1;
    const event = toParsed(raw);
    if (event.endOn < fromDay || event.startOn > toDay) return;
    found.set(`${event.uid}\u0000${event.instance}`, event);
  };

  const components = root.getAllSubcomponents('vevent');
  const exceptionsByUid = new Map<string, ICAL.Component[]>();
  const masters: ICAL.Component[] = [];
  for (const component of components) {
    const uid = String(component.getFirstPropertyValue('uid') ?? '');
    if (!uid || !component.hasProperty('dtstart')) continue;
    if (component.hasProperty('recurrence-id')) {
      exceptionsByUid.set(uid, [...(exceptionsByUid.get(uid) ?? []), component]);
    } else {
      masters.push(component);
    }
  }
  const mastersByUid = new Set(masters.map((component) => String(component.getFirstPropertyValue('uid'))));

  const single = (component: ICAL.Component, instance: string) => {
    if (isCancelled(component)) return;
    const startProperty = component.getFirstProperty('dtstart');
    const start = startProperty?.getFirstValue();
    if (!(start instanceof ICAL.Time)) return;
    const endProperty = component.getFirstProperty('dtend');
    let end = endProperty?.getFirstValue();
    if (!(end instanceof ICAL.Time)) {
      const duration = component.getFirstPropertyValue('duration');
      if (duration instanceof ICAL.Duration) {
        const shifted = start.clone();
        shifted.addDuration(duration);
        end = shifted;
      } else {
        end = null;
      }
    }
    add({
      uid: String(component.getFirstPropertyValue('uid')),
      instance,
      title: textOf(component, 'summary', MAX_TITLE),
      location: textOf(component, 'location', MAX_LOCATION) || null,
      start,
      end: end instanceof ICAL.Time ? end : null,
      zone: zoneOfProperty(startProperty, calendarZone),
    });
  };

  for (const master of masters) {
    const uid = String(master.getFirstPropertyValue('uid'));
    try {
      const event = new ICAL.Event(master);
      if (!event.isRecurring()) {
        single(master, '');
        continue;
      }
      if (isCancelled(master)) continue;

      for (const exception of exceptionsByUid.get(uid) ?? []) event.relateException(new ICAL.Event(exception));
      const zone = zoneOfProperty(master.getFirstProperty('dtstart'), calendarZone);
      const iterator = event.iterator();
      const startedAt = performance.now();
      let steps = 0;
      let next = iterator.next();
      while (next) {
        steps += 1;
        // Przesunięte wystąpienie może wypaść wcześniej niż oryginał, więc zostawiamy dobę zapasu.
        if (dayOf(next) > addDays(toDay, 2)) break;
        if (steps > MAX_ITERATION_STEPS || performance.now() - startedAt > MAX_SERIES_MS) {
          result.skippedSeries += 1;
          break;
        }
        const details = event.getOccurrenceDetails(next);
        const item = details.item;
        const cancelled = item !== event && isCancelled(item.component);
        if (!cancelled) {
          add({
            uid,
            instance: next.toString(),
            title: clean(item.summary, MAX_TITLE),
            location: clean(item.location, MAX_LOCATION) || null,
            start: details.startDate,
            end: details.endDate,
            zone,
          });
        }
        next = iterator.next();
      }
    } catch {
      // Jedna uszkodzona seria nie może zepsuć reszty kalendarza.
      result.skippedSeries += 1;
    }
  }

  // Wyjątek bez głównego wydarzenia (zaproszenie na jedno wystąpienie) traktujemy jak zwykłe wydarzenie.
  for (const [uid, exceptions] of exceptionsByUid) {
    if (mastersByUid.has(uid)) continue;
    for (const exception of exceptions) {
      try {
        const recurrenceId = String(exception.getFirstPropertyValue('recurrence-id') ?? '');
        single(exception, recurrenceId);
      } catch {
        result.skippedSeries += 1;
      }
    }
  }

  result.events = [...found.values()]
    .sort((a, b) => a.startOn.localeCompare(b.startOn) || (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0))
    .slice(0, MAX_EVENTS);
  return result;
}
