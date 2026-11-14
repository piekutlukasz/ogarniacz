import { createHash } from 'node:crypto';
import { type CalendarErrorCode, warsawDate } from '@ogarniacz/shared';
import { and, eq, isNull, ne, or, lte } from 'drizzle-orm';
import type { Db } from '../db/client';
import { calendarEvents, calendars } from '../db/schema';
import { CalendarKeyError, decryptUrl } from './crypto';
import { CalendarError, type FetchOptions, checkCalendarUrl, fetchCalendar } from './fetch';
import { IcsFormatError, IcsTooLargeError, type ParseResult, parseIcs } from './ics';

export type CalendarSettings = {
  /** Klucz szyfrujący linki. Bez niego kalendarze są wyłączone. */
  key: Buffer;
  fetch: FetchOptions;
};

export type CalendarRow = typeof calendars.$inferSelect;

const MINUTE = 60_000;
/** Po udanej synchronizacji następna może ruszyć za 10 minut, więc cron co 15 minut nie gubi kalendarza przez jitter. */
export const SUCCESS_INTERVAL_MS = 10 * MINUTE;
const BASE_RETRY_MIN = 15;
const MAX_RETRY_MIN = 240;
const INSERT_CHUNK = 200;

/** Odstęp do następnej próby: 15, 30, 60, 120, najwyżej 240 minut. */
export function retryDelayMs(failures: number): number {
  return Math.min(BASE_RETRY_MIN * 2 ** Math.max(0, failures - 1), MAX_RETRY_MIN) * MINUTE;
}

/** Kalendarze w trakcie synchronizacji. Aplikacja ma jedną instancję, więc pamięć procesu wystarcza. */
const running = new Set<string>();

export function errorCode(error: unknown): CalendarErrorCode {
  if (error instanceof CalendarError) return error.code;
  if (error instanceof IcsTooLargeError) return 'too_large';
  if (error instanceof IcsFormatError) return 'format';
  if (error instanceof CalendarKeyError) return 'key';
  // Nieznany błąd: w logu tylko jego nazwa, bo komunikat mógłby zawierać adres.
  console.error(`[kalendarze] nieoczekiwany błąd: ${error instanceof Error ? error.name : typeof error}`);
  return 'network';
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Podmienia wszystkie wystąpienia kalendarza na nowe. Wołać w transakcji. */
export function replaceEvents(tx: Tx, calendarId: string, parsed: ParseResult) {
  tx.delete(calendarEvents).where(eq(calendarEvents.calendarId, calendarId)).run();
  for (let i = 0; i < parsed.events.length; i += INSERT_CHUNK) {
    tx.insert(calendarEvents)
      .values(parsed.events.slice(i, i + INSERT_CHUNK).map((event) => ({ ...event, calendarId })))
      .run();
  }
}

export type Probe = { url: URL; parsed: ParseResult; hash: string; etag: string | null; lastModified: string | null };

/**
 * Sprawdza link bez zapisywania: pobiera i parsuje. Służy do odrzucenia błędnego linku przy dodawaniu
 * i wymianie, zanim cokolwiek trafi do bazy. Rzuca błąd z kodem (`errorCode`).
 */
export async function probeCalendar(rawUrl: string, settings: CalendarSettings, now: Date): Promise<Probe> {
  const url = checkCalendarUrl(rawUrl, settings.fetch);
  const fetched = await fetchCalendar(url.toString(), settings.fetch);
  if (fetched.notModified) throw new CalendarError('network');
  return {
    url,
    parsed: parseIcs(fetched.text, now),
    hash: createHash('sha256').update(fetched.text).digest('hex'),
    etag: fetched.etag,
    lastModified: fetched.lastModified,
  };
}

export type SyncOutcome = 'ok' | 'unchanged' | 'failed' | 'busy' | 'skipped';

/**
 * Synchronizuje jeden kalendarz. Bezpieczne do powtórzenia i do wywołania w dowolnej chwili.
 * Najpierw pobieranie i parsowanie, dopiero potem jedna transakcja: porażka zostawia poprzednie wydarzenia.
 */
export async function syncCalendar(db: Db, settings: CalendarSettings, calendarId: string, now: Date, force = false): Promise<SyncOutcome> {
  if (running.has(calendarId)) return 'busy';
  running.add(calendarId);
  try {
    const row = db.select().from(calendars).where(eq(calendars.id, calendarId)).get();
    if (!row || row.archivedAt || row.urlEnc === '') return 'skipped';
    return await run(db, settings, row, now, force);
  } finally {
    running.delete(calendarId);
  }
}

async function run(db: Db, settings: CalendarSettings, row: CalendarRow, now: Date, force: boolean): Promise<SyncOutcome> {
  const today = warsawDate(now);
  try {
    const url = decryptUrl(row.urlEnc, settings.key, row.id);
    // Pytanie warunkowe tylko, gdy okno nie wymaga ponownego rozwinięcia: 304 nie niesie treści do przeliczenia.
    const conditional = !force && row.syncedDay === today ? { etag: row.etag, lastModified: row.lastModified } : undefined;
    const fetched = await fetchCalendar(url, settings.fetch, conditional);

    if (fetched.notModified) {
      markSuccess(db, row, now, {});
      return 'unchanged';
    }
    const hash = createHash('sha256').update(fetched.text).digest('hex');
    const fresh = { etag: fetched.etag, lastModified: fetched.lastModified, contentHash: hash, syncedDay: today };
    if (!force && hash === row.contentHash && row.syncedDay === today) {
      markSuccess(db, row, now, fresh);
      return 'unchanged';
    }

    const parsed = parseIcs(fetched.text, now);
    if (parsed.skippedSeries > 0 || parsed.unknownZones > 0) {
      console.warn(`[kalendarze] ${row.id.slice(0, 8)}: pominięte serie ${parsed.skippedSeries}, nieznane strefy ${parsed.unknownZones}`);
    }
    db.transaction((tx) => {
      replaceEvents(tx, row.id, parsed);
      markSuccess(tx, row, now, fresh);
    });
    return 'ok';
  } catch (error) {
    const code = errorCode(error);
    const failures = row.failures + 1;
    db.update(calendars)
      .set({ lastAttemptAt: now, lastError: code, failures, nextSyncAt: new Date(now.getTime() + retryDelayMs(failures)), updatedAt: now })
      .where(eq(calendars.id, row.id))
      .run();
    // Log tylko przy zmianie stanu, żeby martwy link nie zalewał logów co kilka godzin.
    if (row.lastError !== code) console.error(`[kalendarze] ${row.id.slice(0, 8)}: błąd ${code}`);
    return 'failed';
  }
}

export function markSuccess(
  db: Pick<Db, 'update'>,
  row: CalendarRow,
  now: Date,
  extra: Partial<Pick<CalendarRow, 'etag' | 'lastModified' | 'contentHash' | 'syncedDay'>>,
) {
  db.update(calendars)
    .set({
      lastAttemptAt: now,
      lastSuccessAt: now,
      lastError: null,
      failures: 0,
      nextSyncAt: new Date(now.getTime() + SUCCESS_INTERVAL_MS),
      updatedAt: now,
      ...extra,
    })
    .where(eq(calendars.id, row.id))
    .run();
}

export type SyncSummary = { ok: number; unchanged: number; failed: number };

/** Zadanie w tle: kalendarze po kolei, każdy osobno, więc błąd jednego nie psuje pozostałych. */
export async function runCalendarSync(db: Db, settings: CalendarSettings, now: () => Date, options: { force?: boolean } = {}): Promise<SyncSummary> {
  const summary: SyncSummary = { ok: 0, unchanged: 0, failed: 0 };
  const at = now();
  const due = db
    .select({ id: calendars.id })
    .from(calendars)
    .where(
      and(
        isNull(calendars.archivedAt),
        ne(calendars.urlEnc, ''),
        options.force ? undefined : or(isNull(calendars.nextSyncAt), lte(calendars.nextSyncAt, at)),
      ),
    )
    .all();
  for (const { id } of due) {
    const outcome = await syncCalendar(db, settings, id, now(), options.force);
    if (outcome === 'ok') summary.ok += 1;
    else if (outcome === 'unchanged') summary.unchanged += 1;
    else if (outcome === 'failed') summary.failed += 1;
  }
  return summary;
}
