import { z } from 'zod';
import { dueOnSchema, rewardSchema, titleInputSchema } from './tasks';
import { addDays } from './time';

/** Dni tygodnia jak w ISO 8601: 1 to poniedziałek, 7 to niedziela. */
export const weekdaySchema = z.number().int().min(1).max(7);

export const recurrencePatternSchema = z.discriminatedUnion('kind', [
  /** Co tydzień w wybrane dni, np. śmieci w poniedziałek i czwartek. */
  z.object({
    kind: z.literal('weekly'),
    weekdays: z
      .array(weekdaySchema)
      .min(1)
      .max(7)
      .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
  }),
  /** Co N dni, licząc od dnia startu, np. kwiaty co 3 dni. */
  z.object({ kind: z.literal('interval'), days: z.number().int().min(1).max(365) }),
  /** Co miesiąc w wybrany dzień. W krótszym miesiącu wypada ostatniego dnia, np. 31 → 28 lutego. */
  z.object({ kind: z.literal('monthly'), day: z.number().int().min(1).max(31) }),
]);
export type RecurrencePattern = z.infer<typeof recurrencePatternSchema>;


export const recurrenceSchema = z.object({
  id: z.uuid(),
  /** Zapisany tytuł; reguły sprzed limitu 3 znaków mogą mieć krótszy. */
  title: z.string().min(1),
  assigneeId: z.uuid().nullable(),
  pattern: recurrencePatternSchema,
  /** Nagroda dla każdego tworzonego zadania; `null` bez nagrody. */
  reward: rewardSchema.nullable(),
  /** Od tego dnia reguła działa. Wzorzec „co N dni” liczy się od niego. */
  startOn: dueOnSchema,
  paused: z.boolean(),
  /** Ostatni dzień pauzy. `null` przy pauzie bez końca albo bez pauzy. */
  pausedUntil: dueOnSchema.nullable(),
  /** Najbliższy dzień, w którym powstanie zadanie; `null` przy pauzie bez końca. */
  nextOn: dueOnSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Recurrence = z.infer<typeof recurrenceSchema>;

export const recurrenceListSchema = z.array(recurrenceSchema);

export const createRecurrenceSchema = z.object({
  title: titleInputSchema,
  assigneeId: z.uuid().nullable().optional(),
  pattern: recurrencePatternSchema,
  reward: rewardSchema.nullable().optional(),
  /** Pominięty: od dziś. */
  startOn: dueOnSchema.optional(),
});
export type CreateRecurrence = z.input<typeof createRecurrenceSchema>;

export const updateRecurrenceSchema = z
  .object({
    title: titleInputSchema,
    assigneeId: z.uuid().nullable(),
    pattern: recurrencePatternSchema,
    /** Dotyczy zadań tworzonych od teraz; już utworzone zachowują swoją nagrodę. */
    reward: rewardSchema.nullable(),
    startOn: dueOnSchema,
    /** Pauza: `{ until: null }` bez końca, `{ until: data }` do tego dnia włącznie, `null` wznawia. */
    pause: z.object({ until: dueOnSchema.nullable() }).nullable(),
    /** Usunięcie reguły. Utworzone już zadania zostają. */
    archived: z.literal(true),
  })
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: 'Podaj co najmniej jedno pole do zmiany',
  });
export type UpdateRecurrence = z.input<typeof updateRecurrenceSchema>;

const DAY_MS = 24 * 60 * 60 * 1000;

function utc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** Liczba dni od `from` do `to`. Liczona w UTC, więc zmiana czasu jej nie zaburza. */
export function daysBetween(from: string, to: string): number {
  return Math.round((utc(to).getTime() - utc(from).getTime()) / DAY_MS);
}

/** Dzień tygodnia daty RRRR-MM-DD, 1–7 od poniedziałku. */
export function isoWeekday(date: string): number {
  return utc(date).getUTCDay() || 7;
}

function lastDayOfMonth(date: string): number {
  const moment = utc(date);
  return new Date(Date.UTC(moment.getUTCFullYear(), moment.getUTCMonth() + 1, 0)).getUTCDate();
}

/** Czy reguła wypada w danym dniu. Dni przed startem nigdy nie pasują. */
export function occursOn(pattern: RecurrencePattern, startOn: string, date: string): boolean {
  if (date < startOn) return false;
  switch (pattern.kind) {
    case 'weekly':
      return pattern.weekdays.includes(isoWeekday(date));
    case 'interval':
      return daysBetween(startOn, date) % pattern.days === 0;
    case 'monthly':
      return utc(date).getUTCDate() === Math.min(pattern.day, lastDayOfMonth(date));
  }
}

/** Najdłuższa przerwa między wystąpieniami: 365 dni przy „co N dni”, 31 przy pozostałych. */
const MAX_GAP_DAYS = 366;

/** Najpóźniejszy dzień wystąpienia w przedziale (`after`, `upTo`], albo `undefined`. */
export function latestOccurrence(
  pattern: RecurrencePattern,
  startOn: string,
  after: string,
  upTo: string,
): string | undefined {
  const lowest = daysBetween(after, upTo) > MAX_GAP_DAYS ? addDays(upTo, -MAX_GAP_DAYS) : after;
  for (let date = upTo; date > lowest; date = addDays(date, -1)) {
    if (occursOn(pattern, startOn, date)) return date;
  }
  return undefined;
}

/** Najwcześniejszy dzień wystąpienia od `from` włącznie. */
export function nextOccurrence(pattern: RecurrencePattern, startOn: string, from: string): string | undefined {
  const first = from < startOn ? startOn : from;
  for (let offset = 0; offset <= MAX_GAP_DAYS; offset += 1) {
    const date = addDays(first, offset);
    if (occursOn(pattern, startOn, date)) return date;
  }
  return undefined;
}

const WEEKDAY_SHORT = ['pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.', 'niedz.'];

/** Wzorzec po ludzku, np. „co tydzień: pon., czw.” albo „co 3 dni”. */
export function describePattern(pattern: RecurrencePattern): string {
  switch (pattern.kind) {
    case 'weekly':
      return pattern.weekdays.length === 7
        ? 'codziennie'
        : `co tydzień: ${pattern.weekdays.map((day) => WEEKDAY_SHORT[day - 1]).join(', ')}`;
    case 'interval':
      return pattern.days === 1 ? 'codziennie' : `co ${pattern.days} dni`;
    case 'monthly':
      return `co miesiąc, ${pattern.day}. dnia`;
  }
}
