import { randomUUID } from 'node:crypto';
import { validate } from '../validate';
import {
  CALENDAR_ERROR_MESSAGES,
  CALENDAR_STALE_MINUTES,
  type Calendar,
  type CalendarErrorCode,
  addDays,
  createCalendarSchema,
  eventsQuerySchema,
  type EventsResponse,
  updateCalendarSchema,
  warsawDate,
} from '@ogarniacz/shared';
import { and, asc, count, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { type AppEnv, requireRole } from '../auth/middleware';
import type { UserRow } from '../auth/users';
import { encryptUrl } from '../calendars/crypto';
import { type CalendarRow, type CalendarSettings, errorCode, probeCalendar, replaceEvents, syncCalendar } from '../calendars/sync';
import type { Db } from '../db/client';
import { calendarEvents, calendars } from '../db/schema';

/** Najczęściej odświeżenie ręczne: raz na minutę na kalendarz. */
const MANUAL_SYNC_GAP_MS = 60_000;

type Options = { db: Db; now: () => Date; settings?: CalendarSettings; demo: boolean };

function visibleTo(user: UserRow, row: Pick<CalendarRow, 'scope' | 'ownerId'>): boolean {
  return row.scope === 'family' || row.ownerId === user.id;
}

/** Komunikat przy dodawaniu: tam błąd sieci znaczy „spróbuj jeszcze raz”, a nie „czekaj na kolejną synchronizację”. */
function addMessage(code: CalendarErrorCode): string {
  return code === 'network' || code === 'rate_limited'
    ? 'Nie udało się teraz pobrać kalendarza. Sprawdź link i spróbuj ponownie za chwilę.'
    : CALENDAR_ERROR_MESSAGES[code];
}

/** Zarządzanie kalendarzami. Tylko rodzic (PROJEKT.md, rozdział 6). Link nigdy nie wraca w odpowiedzi. */
export function calendarRoutes({ db, now, settings, demo }: Options) {
  const toCalendar = (row: CalendarRow, eventCount: number): Calendar => ({
    id: row.id,
    name: row.name,
    host: row.urlHost,
    scope: row.scope,
    ownerId: row.ownerId,
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
    error: row.lastError,
    errorMessage: row.lastError ? CALENDAR_ERROR_MESSAGES[row.lastError] : null,
    eventCount,
    createdAt: row.createdAt.toISOString(),
  });

  const countEvents = (id: string) =>
    db.select({ total: count() }).from(calendarEvents).where(eq(calendarEvents.calendarId, id)).get()?.total ?? 0;
  const find = (id: string) => db.select().from(calendars).where(and(eq(calendars.id, id), isNull(calendars.archivedAt))).get();

  return new Hono<AppEnv>()
    .use('*', requireRole('parent'))
    .get('/', (c) => {
      const user = c.get('user');
      const rows = db.select().from(calendars).where(isNull(calendars.archivedAt)).orderBy(asc(calendars.createdAt)).all();
      return c.json(rows.filter((row) => visibleTo(user, row)).map((row) => toCalendar(row, countEvents(row.id))));
    })
    .post('/', validate('json', createCalendarSchema), async (c) => {
      // W demo każdy jest rodzicem, więc pobieranie podanych adresów to byłby otwarty serwer pośredniczący.
      if (demo) return c.json({ error: 'W wersji demo nie można dodawać kalendarzy' }, 403);
      if (!settings) return c.json({ error: 'Kalendarze nie są skonfigurowane na serwerze' }, 503);
      const input = c.req.valid('json');
      const user = c.get('user');
      const at = now();

      let probe: Awaited<ReturnType<typeof probeCalendar>>;
      try {
        probe = await probeCalendar(input.url, settings, at);
      } catch (error) {
        return c.json({ error: addMessage(errorCode(error)) }, 400);
      }

      const id = randomUUID();
      const row = db.transaction((tx) => {
        const created = tx
          .insert(calendars)
          .values({
            id,
            name: input.name,
            urlEnc: encryptUrl(probe.url.toString(), settings.key, id),
            urlHost: probe.url.hostname,
            scope: input.scope,
            ownerId: user.id,
            lastAttemptAt: at,
            lastSuccessAt: at,
            nextSyncAt: new Date(at.getTime() + 10 * 60_000),
            etag: probe.etag,
            lastModified: probe.lastModified,
            contentHash: probe.hash,
            syncedDay: warsawDate(at),
            createdAt: at,
            updatedAt: at,
          })
          .returning()
          .get();
        replaceEvents(tx, id, probe.parsed);
        return created;
      });
      return c.json(toCalendar(row, probe.parsed.events.length), 201);
    })
    .patch('/:id', validate('json', updateCalendarSchema), async (c) => {
      const row = find(c.req.param('id'));
      const user = c.get('user');
      if (!row || !visibleTo(user, row)) return c.json({ error: 'Nie ma takiego kalendarza' }, 404);
      const change = c.req.valid('json');
      const at = now();

      if (change.archived) {
        // Link to poświadczenie, nie dana historyczna: po odpięciu go nie trzymamy, a wydarzenia znikają z „Dziś”.
        db.transaction((tx) => {
          tx.delete(calendarEvents).where(eq(calendarEvents.calendarId, row.id)).run();
          tx.update(calendars).set({ archivedAt: at, urlEnc: '', etag: null, lastModified: null, contentHash: null, updatedAt: at }).where(eq(calendars.id, row.id)).run();
        });
        return c.body(null, 204);
      }

      if (change.url !== undefined) {
        if (demo) return c.json({ error: 'W wersji demo nie można zmieniać linków' }, 403);
        if (!settings) return c.json({ error: 'Kalendarze nie są skonfigurowane na serwerze' }, 503);
        let probe: Awaited<ReturnType<typeof probeCalendar>>;
        try {
          probe = await probeCalendar(change.url, settings, at);
        } catch (error) {
          return c.json({ error: addMessage(errorCode(error)) }, 400);
        }
        db.transaction((tx) => {
          tx.update(calendars)
            .set({
              urlEnc: encryptUrl(probe.url.toString(), settings.key, row.id),
              urlHost: probe.url.hostname,
              lastAttemptAt: at,
              lastSuccessAt: at,
              lastError: null,
              failures: 0,
              nextSyncAt: new Date(at.getTime() + 10 * 60_000),
              etag: probe.etag,
              lastModified: probe.lastModified,
              contentHash: probe.hash,
              syncedDay: warsawDate(at),
              updatedAt: at,
            })
            .where(eq(calendars.id, row.id))
            .run();
          replaceEvents(tx, row.id, probe.parsed);
        });
      }
      if (change.name !== undefined || change.scope !== undefined) {
        db.update(calendars)
          .set({ ...(change.name !== undefined && { name: change.name }), ...(change.scope !== undefined && { scope: change.scope }), updatedAt: at })
          .where(eq(calendars.id, row.id))
          .run();
      }
      const updated = find(row.id) as CalendarRow;
      return c.json(toCalendar(updated, countEvents(row.id)));
    })
    .post('/:id/sync', async (c) => {
      const row = find(c.req.param('id'));
      const user = c.get('user');
      if (!row || !visibleTo(user, row)) return c.json({ error: 'Nie ma takiego kalendarza' }, 404);
      if (demo || row.urlEnc === '') return c.json({ error: 'Ten kalendarz nie ma linku do odświeżenia' }, 400);
      if (!settings) return c.json({ error: 'Kalendarze nie są skonfigurowane na serwerze' }, 503);
      const at = now();
      if (row.lastAttemptAt && at.getTime() - row.lastAttemptAt.getTime() < MANUAL_SYNC_GAP_MS) {
        return c.json({ error: 'Kalendarz był odświeżony przed chwilą. Spróbuj za minutę.' }, 429);
      }
      await syncCalendar(db, settings, row.id, at, true);
      const updated = find(row.id) as CalendarRow;
      return c.json(toCalendar(updated, countEvents(row.id)));
    });
}

/** Wydarzenia dla każdej zalogowanej osoby: kalendarze rodzinne oraz własne prywatne. */
export function eventRoutes({ db, now }: Pick<Options, 'db' | 'now'>) {
  return new Hono<AppEnv>().get('/', validate('query', eventsQuerySchema), (c) => {
    const user = c.get('user');
    const query = c.req.valid('query');
    const at = now();
    const date = query.date ?? warsawDate(at);
    const last = addDays(date, query.days - 1);
    const visible = or(eq(calendars.scope, 'family'), eq(calendars.ownerId, user.id));

    const rows = db
      .select({ event: calendarEvents, calendarName: calendars.name })
      .from(calendarEvents)
      .innerJoin(calendars, eq(calendars.id, calendarEvents.calendarId))
      .where(and(isNull(calendars.archivedAt), visible, lte(calendarEvents.startOn, last), gte(calendarEvents.endOn, date)))
      .orderBy(asc(calendarEvents.startOn), asc(calendarEvents.startsAt), asc(calendarEvents.title))
      .all();

    const sources = db.select().from(calendars).where(and(isNull(calendars.archivedAt), visible)).all();
    // Kalendarz bez linku (przykład z demo) nie jest synchronizowany, więc nie może się „zestarzeć”.
    const synced = sources.filter((row) => row.urlEnc !== '');
    const limit = at.getTime() - CALENDAR_STALE_MINUTES * 60_000;
    const successes = synced.map((row) => row.lastSuccessAt?.getTime()).filter((time): time is number => time !== undefined);
    const failing = synced.filter((row) => row.lastError !== null).length;
    const stale = synced.some((row) => row.lastSuccessAt === null || row.lastSuccessAt.getTime() < limit) || failing > 0;

    const body: EventsResponse = {
      date,
      days: query.days,
      // Całodniowe najpierw w obrębie dnia; zapytanie sortuje po dniu i godzinie, a puste godziny wychodzą pierwsze.
      events: rows.map(({ event, calendarName }) => ({
        id: event.id,
        calendarId: event.calendarId,
        calendarName,
        title: event.title,
        location: event.location,
        allDay: event.allDay,
        startOn: event.startOn,
        endOn: event.endOn,
        startsAt: event.startsAt?.toISOString() ?? null,
        endsAt: event.endsAt?.toISOString() ?? null,
      })),
      sync: {
        lastSuccessAt: successes.length > 0 && successes.length === synced.length ? new Date(Math.min(...successes)).toISOString() : null,
        stale,
        failing,
        calendars: sources.length,
      },
    };
    return c.json(body);
  });
}

