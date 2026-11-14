import { z } from 'zod';
import { dueOnSchema } from './tasks';

/** Kto widzi wydarzenia kalendarza: cała rodzina albo tylko osoba, która go dodała. */
export const calendarScopeSchema = z.enum(['family', 'private']);
export type CalendarScope = z.infer<typeof calendarScopeSchema>;

/** Powód ostatniej nieudanej synchronizacji. Zapisujemy kod, a komunikat powstaje tutaj, po polsku. */
export const calendarErrorCodeSchema = z.enum(['auth', 'not_found', 'rate_limited', 'network', 'format', 'too_large', 'blocked', 'key']);
export type CalendarErrorCode = z.infer<typeof calendarErrorCodeSchema>;

export const CALENDAR_ERROR_MESSAGES: Record<CalendarErrorCode, string> = {
  auth: 'Link nie działa albo został wyłączony. Wymień link na nowy.',
  not_found: 'Pod tym linkiem nie ma już kalendarza. Wymień link na nowy.',
  rate_limited: 'Serwis kalendarza prosi o przerwę. Spróbuję ponownie później.',
  network: 'Serwis kalendarza nie odpowiada. Spróbuję ponownie, a do tego czasu widać ostatnie dane.',
  format: 'Pod tym linkiem nie ma kalendarza w formacie ICS. Sprawdź, czy skopiowano właściwy link.',
  too_large: 'Plik kalendarza jest za duży. Podłącz mniejszy, osobny kalendarz, np. „Rodzina”.',
  blocked: 'Ten adres nie jest dozwolony. Obsługujemy linki z Google Kalendarza i iCloud.',
  key: 'Nie mogę odczytać zapisanego linku. Dodaj kalendarz ponownie.',
};

/** Po tylu minutach bez udanej synchronizacji dane uznajemy za nieaktualne. */
export const CALENDAR_STALE_MINUTES = 60;
export const EVENTS_MAX_DAYS = 14;

const nameSchema = z.string().trim().min(1, 'Wpisz nazwę kalendarza').max(60, 'Nazwa może mieć najwyżej 60 znaków');
const urlSchema = z.string().trim().min(1, 'Wklej link do kalendarza').max(2000, 'Ten link jest za długi');

export const createCalendarSchema = z.object({
  name: nameSchema,
  url: urlSchema,
  scope: calendarScopeSchema,
});
export type CreateCalendar = z.infer<typeof createCalendarSchema>;

export const updateCalendarSchema = z
  .object({
    name: nameSchema,
    scope: calendarScopeSchema,
    /** Wymiana linku. Nowy link jest od razu sprawdzany. */
    url: urlSchema,
    /** `true` odpina kalendarz i kasuje zapisany link. */
    archived: z.literal(true),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Brak zmian' });
export type UpdateCalendar = z.infer<typeof updateCalendarSchema>;

/** Kalendarz bez linku: tego, co jest w adresie, API nie zwraca nigdy. */
export const calendarSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** Sam serwis, np. `calendar.google.com`. */
  host: z.string(),
  scope: calendarScopeSchema,
  ownerId: z.uuid(),
  lastSuccessAt: z.iso.datetime().nullable(),
  lastAttemptAt: z.iso.datetime().nullable(),
  error: calendarErrorCodeSchema.nullable(),
  errorMessage: z.string().nullable(),
  /** Liczba wydarzeń w oknie od wczoraj do 45 dni. */
  eventCount: z.number().int().min(0),
  createdAt: z.iso.datetime(),
});
export type Calendar = z.infer<typeof calendarSchema>;
export const calendarListSchema = z.array(calendarSchema);

export const calendarEventSchema = z.object({
  id: z.number().int(),
  calendarId: z.uuid(),
  calendarName: z.string(),
  title: z.string(),
  location: z.string().nullable(),
  allDay: z.boolean(),
  /** Pierwszy i ostatni dzień w czasie polskim, włącznie. */
  startOn: dueOnSchema,
  endOn: dueOnSchema,
  /** Puste przy wydarzeniach całodniowych. */
  startsAt: z.iso.datetime().nullable(),
  endsAt: z.iso.datetime().nullable(),
});
export type CalendarEvent = z.infer<typeof calendarEventSchema>;

export const eventsQuerySchema = z.object({
  date: dueOnSchema.optional(),
  days: z.coerce.number().int().min(1).max(EVENTS_MAX_DAYS).default(1),
});

export const eventsResponseSchema = z.object({
  date: dueOnSchema,
  days: z.number().int(),
  events: z.array(calendarEventSchema),
  sync: z.object({
    /** Najstarsze udane pobranie wśród widocznych kalendarzy; `null`, gdy któryś jeszcze nigdy się nie udał. */
    lastSuccessAt: z.iso.datetime().nullable(),
    /** Dane starsze niż `CALENDAR_STALE_MINUTES` albo kalendarz z błędem. */
    stale: z.boolean(),
    /** Ile widocznych kalendarzy ma błąd. */
    failing: z.number().int().min(0),
    /** Ile kalendarzy jest widocznych dla tej osoby. */
    calendars: z.number().int().min(0),
  }),
});
export type EventsResponse = z.infer<typeof eventsResponseSchema>;
