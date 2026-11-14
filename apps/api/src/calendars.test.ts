import { type Calendar, calendarListSchema, calendarSchema, eventsResponseSchema } from '@ogarniacz/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import { createUser } from './auth/users';
import { parseEncryptionKey } from './calendars/crypto';
import { DEFAULT_ALLOWED_HOSTS } from './calendars/fetch';
import { type CalendarSettings, retryDelayMs, runCalendarSync } from './calendars/sync';
import { type Db, openDatabase } from './db/client';
import { calendarEvents, calendars } from './db/schema';

const GOOGLE = 'https://calendar.google.com/calendar/ical/rodzina/private-SEKRET123/basic.ics';
const ICLOUD = 'webcal://p12-caldav.icloud.com/published/2/SEKRET456';
const ICLOUD_HTTPS = 'https://p12-caldav.icloud.com/published/2/SEKRET456';

const ics = (...events: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//t//EN', ...events, 'END:VCALENDAR', ''].join('\r\n');
const vevent = (uid: string, ...lines: string[]) => ['BEGIN:VEVENT', `UID:${uid}`, ...lines, 'END:VEVENT'].join('\r\n');

const FAMILY_FEED = ics(
  vevent('basen', 'DTSTART;TZID=Europe/Warsaw:20261110T180000', 'DTEND;TZID=Europe/Warsaw:20261110T190000', 'SUMMARY:Basen', 'LOCATION:Pływalnia'),
  vevent('urodziny', 'DTSTART;VALUE=DATE:20261110', 'DTEND;VALUE=DATE:20261111', 'SUMMARY:Urodziny babci'),
  vevent('wycieczka', 'DTSTART;VALUE=DATE:20261111', 'DTEND;VALUE=DATE:20261114', 'SUMMARY:Wycieczka'),
  vevent('jutro', 'DTSTART;TZID=Europe/Warsaw:20261111T090000', 'DTEND;TZID=Europe/Warsaw:20261111T100000', 'SUMMARY:Dentysta'),
);
const PRIVATE_FEED = ics(vevent('praca', 'DTSTART;TZID=Europe/Warsaw:20261110T100000', 'DTEND;TZID=Europe/Warsaw:20261110T110000', 'SUMMARY:Spotkanie w pracy'));

let db: Db;
let close: () => void;
let app: ReturnType<typeof createApp>;
let clock: number;
let tata: string;
let mama: string;
let kid: string;
let settings: CalendarSettings;
let feeds: Map<string, () => Response>;
let requests: { url: string; headers: Headers }[];

const setClock = (iso: string) => {
  clock = Date.parse(iso);
};
const now = () => new Date(clock);

function serve(url: string, body: string, init: ResponseInit = {}) {
  feeds.set(url, () => new Response(body, init));
}

function send(method: string, path: string, session: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: session },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function logIn(login: string, password: string) {
  const response = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login, password }) });
  return (response.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';
}

async function addCalendar(session: string, input: { name: string; url: string; scope: 'family' | 'private' }): Promise<Calendar> {
  const response = await send('POST', '/api/calendars', session, input);
  expect(response.status).toBe(201);
  return calendarSchema.parse(await response.json());
}

async function eventsFor(session: string, query = '') {
  const response = await send('GET', `/api/events${query}`, session);
  expect(response.status).toBe(200);
  return eventsResponseSchema.parse(await response.json());
}

let parent: string;
let otherParent: string;
let child: string;

beforeEach(async () => {
  ({ db, close } = openDatabase(':memory:', './drizzle'));
  setClock('2026-11-10T10:00:00Z');
  feeds = new Map();
  requests = [];
  settings = {
    key: parseEncryptionKey(Buffer.alloc(32, 3).toString('base64')),
    fetch: {
      allowedHosts: DEFAULT_ALLOWED_HOSTS,
      resolve: async () => ['142.250.1.1'],
      fetchImpl: (async (input: URL | string, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, headers: new Headers(init?.headers) });
        const make = feeds.get(url);
        return make ? make() : new Response('', { status: 404 });
      }) as unknown as typeof fetch,
    },
  };
  app = createApp({ db, now, calendars: settings });
  tata = (await createUser(db, { login: 'tata', name: 'Tata', role: 'parent', password: 'haslo-rodzica' })).id;
  mama = (await createUser(db, { login: 'mama', name: 'Mama', role: 'parent', password: 'haslo-rodzica2' })).id;
  kid = (await createUser(db, { login: 'zosia', name: 'Zosia', role: 'child', password: 'haslo-dziecka' })).id;
  parent = await logIn('tata', 'haslo-rodzica');
  otherParent = await logIn('mama', 'haslo-rodzica2');
  child = await logIn('zosia', 'haslo-dziecka');
  serve(GOOGLE, FAMILY_FEED);
  serve(ICLOUD_HTTPS, PRIVATE_FEED);
});

afterEach(() => {
  close();
  vi.restoreAllMocks();
});

describe('dodawanie kalendarza', () => {
  it('sprawdza link od razu, pokazuje liczbę wydarzeń i nie zwraca linku', async () => {
    const response = await send('POST', '/api/calendars', parent, { name: 'Rodzina', url: GOOGLE, scope: 'family' });
    expect(response.status).toBe(201);
    const text = await response.text();
    expect(text).not.toContain('SEKRET123');
    const calendar = calendarSchema.parse(JSON.parse(text));
    expect(calendar).toMatchObject({ name: 'Rodzina', host: 'calendar.google.com', scope: 'family', ownerId: tata, error: null, eventCount: 4 });

    const list = await (await send('GET', '/api/calendars', parent)).text();
    expect(list).not.toContain('SEKRET123');
    expect(calendarListSchema.parse(JSON.parse(list))).toHaveLength(1);
  });

  it('zapisuje link tylko zaszyfrowany', async () => {
    await addCalendar(parent, { name: 'Rodzina', url: GOOGLE, scope: 'family' });
    const row = db.select().from(calendars).get();
    expect(row?.urlEnc.startsWith('v1:')).toBe(true);
    expect(JSON.stringify(row)).not.toContain('SEKRET123');
    expect(JSON.stringify(row)).not.toContain('calendar/ical');
  });

  it('przyjmuje webcal z iCloud', async () => {
    const calendar = await addCalendar(parent, { name: 'Szkoła', url: ICLOUD, scope: 'family' });
    expect(calendar.host).toBe('p12-caldav.icloud.com');
  });

  it('odrzuca link spoza listy hostów, nie pobierając go', async () => {
    for (const url of ['https://example.com/a.ics', 'http://127.0.0.1:3001/api/health', 'https://169.254.169.254/latest/meta-data/']) {
      const response = await send('POST', '/api/calendars', parent, { name: 'Obcy', url, scope: 'family' });
      expect(response.status, url).toBe(400);
      expect((await response.json()).error).toContain('nie jest dozwolony');
    }
    expect(requests).toHaveLength(0);
    expect(db.select().from(calendars).all()).toHaveLength(0);
  });

  it('odrzuca stronę zamiast kalendarza, martwy link i brak sieci, bez zapisu', async () => {
    serve(GOOGLE, '<html>Zaloguj się</html>');
    let response = await send('POST', '/api/calendars', parent, { name: 'Rodzina', url: GOOGLE, scope: 'family' });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('nie ma kalendarza');

    feeds.set(GOOGLE, () => new Response('', { status: 404 }));
    response = await send('POST', '/api/calendars', parent, { name: 'Rodzina', url: GOOGLE, scope: 'family' });
    expect((await response.json()).error).toContain('nie ma już kalendarza');

    feeds.set(GOOGLE, () => new Response('', { status: 503 }));
    response = await send('POST', '/api/calendars', parent, { name: 'Rodzina', url: GOOGLE, scope: 'family' });
    expect(response.status).toBe(400);
    expect(db.select().from(calendars).all()).toHaveLength(0);
  });

  it('wymaga nazwy, linku i widoczności', async () => {
    expect((await send('POST', '/api/calendars', parent, { name: ' ', url: GOOGLE, scope: 'family' })).status).toBe(400);
    expect((await send('POST', '/api/calendars', parent, { name: 'x', url: '', scope: 'family' })).status).toBe(400);
    expect((await send('POST', '/api/calendars', parent, { name: 'x', url: GOOGLE, scope: 'wszyscy' })).status).toBe(400);
  });

  it('bez klucza na serwerze odpowiada 503, a wydarzenia nadal działają', async () => {
    const bare = createApp({ db, now });
    const post = await bare.request('/api/calendars', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: parent }, body: JSON.stringify({ name: 'x', url: GOOGLE, scope: 'family' }) });
    expect(post.status).toBe(503);
    expect((await bare.request('/api/events', { headers: { Cookie: parent } })).status).toBe(200);
  });

  it('w trybie demo nie pobiera żadnych adresów', async () => {
    const demo = createApp({ db, now, calendars: settings, demo: true });
    const response = await demo.request('/api/calendars', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: parent }, body: JSON.stringify({ name: 'x', url: GOOGLE, scope: 'family' }) });
    expect(response.status).toBe(403);
    expect(requests).toHaveLength(0);
  });
});

describe('uprawnienia i widoczność', () => {
  it('dziecko nie zarządza kalendarzami, ale widzi wydarzenia rodzinne', async () => {
    await addCalendar(parent, { name: 'Rodzina', url: GOOGLE, scope: 'family' });
    expect((await send('GET', '/api/calendars', child)).status).toBe(403);
    expect((await send('POST', '/api/calendars', child, { name: 'x', url: GOOGLE, scope: 'family' })).status).toBe(403);
    const { events } = await eventsFor(child);
    expect(events.map((e) => e.title)).toContain('Basen');
  });

  it('kalendarz prywatny widzi tylko osoba, która go dodała', async () => {
    const mine = await addCalendar(parent, { name: 'Praca', url: ICLOUD, scope: 'private' });
    expect((await eventsFor(parent)).events.map((e) => e.title)).toContain('Spotkanie w pracy');
    for (const session of [otherParent, child]) {
      const result = await eventsFor(session);
      expect(result.events).toEqual([]);
      expect(result.sync.calendars).toBe(0);
    }
    const list = calendarListSchema.parse(await (await send('GET', '/api/calendars', otherParent)).json());
    expect(list).toEqual([]);
    expect((await send('PATCH', `/api/calendars/${mine.id}`, otherParent, { name: 'Moje' })).status).toBe(404);
    expect((await send('POST', `/api/calendars/${mine.id}/sync`, otherParent)).status).toBe(404);
  });

  it('wymaga logowania', async () => {
    expect((await app.request('/api/events')).status).toBe(401);
    expect((await app.request('/api/calendars')).status).toBe(401);
  });
});

describe('wydarzenia dnia', () => {
  beforeEach(async () => {
    await addCalendar(parent, { name: 'Rodzina', url: GOOGLE, scope: 'family' });
  });

  it('zwraca dzisiejsze wydarzenia z nazwą kalendarza, całodniowe przed godzinami', async () => {
    const { date, events, sync } = await eventsFor(child);
    expect(date).toBe('2026-11-10');
    expect(events.map((e) => [e.title, e.allDay, e.calendarName])).toEqual([
      ['Urodziny babci', true, 'Rodzina'],
      ['Basen', false, 'Rodzina'],
    ]);
    expect(events[1]).toMatchObject({ location: 'Pływalnia', startsAt: '2026-11-10T17:00:00.000Z', endsAt: '2026-11-10T18:00:00.000Z' });
    expect(sync).toMatchObject({ stale: false, failing: 0, calendars: 1 });
  });

  it('wydarzenie wielodniowe jest widoczne każdego dnia', async () => {
    for (const day of ['2026-11-11', '2026-11-12', '2026-11-13']) {
      expect((await eventsFor(parent, `?date=${day}`)).events.map((e) => e.title), day).toContain('Wycieczka');
    }
    expect((await eventsFor(parent, '?date=2026-11-14')).events.map((e) => e.title)).not.toContain('Wycieczka');
  });

  it('parametr days obejmuje kilka dni, a zły zakres jest odrzucony', async () => {
    const { events } = await eventsFor(parent, '?days=2');
    expect(events.map((e) => e.title)).toEqual(['Urodziny babci', 'Basen', 'Wycieczka', 'Dentysta']);
    expect((await send('GET', '/api/events?days=0', parent)).status).toBe(400);
    expect((await send('GET', '/api/events?days=15', parent)).status).toBe(400);
    expect((await send('GET', '/api/events?date=jutro', parent)).status).toBe(400);
  });

  it('dane starsze niż godzina są oznaczone jako nieaktualne', async () => {
    setClock('2026-11-10T10:30:00Z');
    expect((await eventsFor(parent)).sync.stale).toBe(false);
    setClock('2026-11-10T11:05:00Z');
    const result = await eventsFor(parent);
    expect(result.sync.stale).toBe(true);
    expect(result.sync.lastSuccessAt).toBe('2026-11-10T10:00:00.000Z');
    expect(result.events.length).toBeGreaterThan(0);
  });
});

describe('zmiany i odpinanie', () => {
  it('zmienia nazwę i widoczność', async () => {
    const calendar = await addCalendar(parent, { name: 'Rodzina', url: GOOGLE, scope: 'family' });
    const response = await send('PATCH', `/api/calendars/${calendar.id}`, parent, { name: 'Dom', scope: 'private' });
    expect(response.status).toBe(200);
    expect(calendarSchema.parse(await response.json())).toMatchObject({ name: 'Dom', scope: 'private' });
    expect((await eventsFor(child)).events).toEqual([]);
    expect((await send('PATCH', `/api/calendars/${calendar.id}`, parent, {})).status).toBe(400);
  });

  it('wymiana linku podmienia wydarzenia, a zły link nic nie psuje', async () => {
    const calendar = await addCalendar(parent, { name: 'Rodzina', url: GOOGLE, scope: 'family' });
    const nextUrl = 'https://calendar.google.com/calendar/ical/rodzina/private-NOWY999/basic.ics';

    let response = await send('PATCH', `/api/calendars/${calendar.id}`, parent, { url: 'https://example.com/a.ics' });
    expect(response.status).toBe(400);
    expect((await eventsFor(parent)).events.map((e) => e.title)).toContain('Basen');

    serve(nextUrl, ics(vevent('nowe', 'DTSTART;VALUE=DATE:20261110', 'SUMMARY:Z nowego linku')));
    response = await send('PATCH', `/api/calendars/${calendar.id}`, parent, { url: nextUrl });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain('NOWY999');
    expect((await eventsFor(parent)).events.map((e) => e.title)).toEqual(['Z nowego linku']);
  });

  it('wymiana linku czyści błąd po martwym linku', async () => {
    const calendar = await addCalendar(parent, { name: 'Rodzina', url: GOOGLE, scope: 'family' });
    feeds.set(GOOGLE, () => new Response('', { status: 403 }));
    setClock('2026-11-10T10:20:00Z');
    await runCalendarSync(db, settings, now);
    expect(db.select().from(calendars).get()?.lastError).toBe('auth');

    serve(GOOGLE, FAMILY_FEED);
    const response = await send('PATCH', `/api/calendars/${calendar.id}`, parent, { url: GOOGLE });
    expect(calendarSchema.parse(await response.json())).toMatchObject({ error: null, errorMessage: null });
  });

  it('odpięcie kasuje link i wydarzenia, ale zostawia wiersz', async () => {
    const calendar = await addCalendar(parent, { name: 'Rodzina', url: GOOGLE, scope: 'family' });
    const response = await send('PATCH', `/api/calendars/${calendar.id}`, parent, { archived: true });
    expect(response.status).toBe(204);
    const row = db.select().from(calendars).where(eq(calendars.id, calendar.id)).get();
    expect(row).toMatchObject({ urlEnc: '', etag: null, contentHash: null });
    expect(row?.archivedAt).not.toBeNull();
    expect(db.select().from(calendarEvents).all()).toHaveLength(0);
    expect(calendarListSchema.parse(await (await send('GET', '/api/calendars', parent)).json())).toEqual([]);
    expect((await eventsFor(parent)).events).toEqual([]);
    expect((await send('PATCH', `/api/calendars/${calendar.id}`, parent, { name: 'x' })).status).toBe(404);
  });
});

describe('synchronizacja w tle', () => {
  it('błąd jednego kalendarza nie psuje pozostałych i jest widoczny', async () => {
    const family = await addCalendar(parent, { name: 'Rodzina', url: GOOGLE, scope: 'family' });
    const school = await addCalendar(parent, { name: 'Szkoła', url: ICLOUD, scope: 'family' });

    setClock('2026-11-10T10:20:00Z');
    feeds.set(GOOGLE, () => new Response('', { status: 403 }));
    serve(ICLOUD_HTTPS, ics(vevent('nowe', 'DTSTART;VALUE=DATE:20261110', 'SUMMARY:Zmienione w szkole')));
    const summary = await runCalendarSync(db, settings, now);
    expect(summary).toMatchObject({ failed: 1, ok: 1 });

    const list = calendarListSchema.parse(await (await send('GET', '/api/calendars', parent)).json());
    const byId = Object.fromEntries(list.map((c) => [c.id, c]));
    expect(byId[family.id]).toMatchObject({ error: 'auth', eventCount: 4 });
    expect(byId[family.id]?.errorMessage).toContain('Wymień link');
    expect(byId[school.id]).toMatchObject({ error: null, eventCount: 1 });

    const { events, sync } = await eventsFor(child);
    // Stare dane nieudanego kalendarza zostają na ekranie, ale dane są oznaczone jako nieaktualne.
    expect(events.map((e) => e.title).sort()).toEqual(['Basen', 'Urodziny babci', 'Zmienione w szkole']);
    expect(sync).toMatchObject({ failing: 1, stale: true });
  });

  it('po błędach odstęp rośnie, a po odzyskaniu linku wszystko wraca', async () => {
    const calendar = await addCalendar(parent, { name: 'Rodzina', url: GOOGLE, scope: 'family' });
    feeds.set(GOOGLE, () => new Response('', { status: 503 }));
    const attempts = () => requests.filter((r) => r.url === GOOGLE).length;
    const before = attempts();

    setClock('2026-11-10T10:15:00Z');
    await runCalendarSync(db, settings, now);
    expect(attempts()).toBe(before + 1);
    expect(db.select().from(calendars).get()?.failures).toBe(1);

    // Następna próba dopiero po 15 minutach.
    setClock('2026-11-10T10:20:00Z');
    await runCalendarSync(db, settings, now);
    expect(attempts()).toBe(before + 1);
    setClock('2026-11-10T10:31:00Z');
    await runCalendarSync(db, settings, now);
    expect(attempts()).toBe(before + 2);
    expect(db.select().from(calendars).get()?.failures).toBe(2);

    serve(GOOGLE, FAMILY_FEED);
    setClock('2026-11-10T11:05:00Z');
    await runCalendarSync(db, settings, now);
    expect(db.select().from(calendars).where(eq(calendars.id, calendar.id)).get()).toMatchObject({ failures: 0, lastError: null });
    expect((await eventsFor(parent)).sync.stale).toBe(false);
  });

  it('odstęp po kolejnych błędach to 15, 30, 60, 120 i najwyżej 240 minut', () => {
    expect([1, 2, 3, 4, 5, 6, 20].map((n) => retryDelayMs(n) / 60_000)).toEqual([15, 30, 60, 120, 240, 240, 240]);
  });

  it('powtórzenie zadania nie dubluje wydarzeń i nie pobiera zbędnie', async () => {
    await addCalendar(parent, { name: 'Rodzina', url: GOOGLE, scope: 'family' });
    for (const time of ['2026-11-10T10:12:00Z', '2026-11-10T10:25:00Z', '2026-11-10T10:40:00Z']) {
      setClock(time);
      await runCalendarSync(db, settings, now);
      await runCalendarSync(db, settings, now);
    }
    expect(db.select().from(calendarEvents).all()).toHaveLength(4);
    // Drugie wywołanie w tej samej chwili jest za wcześnie dla kalendarza (odstęp 10 minut po sukcesie).
    expect(requests.filter((r) => r.url === GOOGLE)).toHaveLength(1 + 3);
  });

  it('ten sam plik nie jest parsowany ponownie, ale następnego dnia okno się przesuwa', async () => {
    await addCalendar(parent, { name: 'Rodzina', url: GOOGLE, scope: 'family' });
    const hash = db.select().from(calendars).get()?.contentHash;
    setClock('2026-11-10T10:30:00Z');
    expect((await runCalendarSync(db, settings, now)).unchanged).toBe(1);
    expect(db.select().from(calendars).get()?.contentHash).toBe(hash);

    // Następny dzień: ta sama treść, ale wydarzenie z 11.11 jest już „dziś”, a 10.11 wypada z okna.
    setClock('2026-11-11T10:30:00Z');
    expect((await runCalendarSync(db, settings, now)).ok).toBe(1);
    const titles = (await eventsFor(parent)).events.map((e) => e.title);
    expect(titles).toEqual(['Wycieczka', 'Dentysta']);
    expect(db.select().from(calendars).get()?.syncedDay).toBe('2026-11-11');
  });

  it('wysyła pytanie warunkowe i na 304 tylko odświeża czas sukcesu', async () => {
    feeds.set(GOOGLE, () => new Response(FAMILY_FEED, { headers: { ETag: '"v7"' } }));
    await addCalendar(parent, { name: 'Rodzina', url: GOOGLE, scope: 'family' });
    feeds.set(GOOGLE, () => new Response(null, { status: 304 }));
    setClock('2026-11-10T10:30:00Z');
    await runCalendarSync(db, settings, now);
    const last = requests.filter((r) => r.url === GOOGLE).at(-1);
    expect(last?.headers.get('if-none-match')).toBe('"v7"');
    expect(db.select().from(calendars).get()?.lastSuccessAt?.toISOString()).toBe('2026-11-10T10:30:00.000Z');
    expect(db.select().from(calendarEvents).all()).toHaveLength(4);
  });

  it('niepoprawny plik zostawia poprzednie wydarzenia', async () => {
    await addCalendar(parent, { name: 'Rodzina', url: GOOGLE, scope: 'family' });
    serve(GOOGLE, '<html>Zaloguj się</html>');
    setClock('2026-11-10T10:30:00Z');
    await runCalendarSync(db, settings, now);
    expect(db.select().from(calendars).get()?.lastError).toBe('format');
    expect(db.select().from(calendarEvents).all()).toHaveLength(4);
  });

  it('pusty, ale poprawny kalendarz zastępuje stare wydarzenia', async () => {
    await addCalendar(parent, { name: 'Rodzina', url: GOOGLE, scope: 'family' });
    serve(GOOGLE, ics());
    setClock('2026-11-10T10:30:00Z');
    await runCalendarSync(db, settings, now);
    expect(db.select().from(calendarEvents).all()).toHaveLength(0);
    expect(db.select().from(calendars).get()?.lastError).toBeNull();
  });

  it('zły klucz szyfrujący daje błąd key, a nie awarię', async () => {
    await addCalendar(parent, { name: 'Rodzina', url: GOOGLE, scope: 'family' });
    const other: CalendarSettings = { ...settings, key: parseEncryptionKey(Buffer.alloc(32, 9).toString('base64')) };
    setClock('2026-11-10T10:30:00Z');
    expect((await runCalendarSync(db, other, now)).failed).toBe(1);
    expect(db.select().from(calendars).get()?.lastError).toBe('key');
  });

  it('pomija kalendarze odpięte i bez linku', async () => {
    const calendar = await addCalendar(parent, { name: 'Rodzina', url: GOOGLE, scope: 'family' });
    await send('PATCH', `/api/calendars/${calendar.id}`, parent, { archived: true });
    setClock('2026-11-10T12:30:00Z');
    expect(await runCalendarSync(db, settings, now, { force: true })).toEqual({ ok: 0, unchanged: 0, failed: 0 });
  });

  it('adres kalendarza nie trafia do logów', async () => {
    const logs: string[] = [];
    for (const method of ['log', 'warn', 'error'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => void logs.push(args.map(String).join(' ')));
    }
    await addCalendar(parent, { name: 'Rodzina', url: GOOGLE, scope: 'family' });
    feeds.set(GOOGLE, () => {
      throw new TypeError(`połączenie z ${GOOGLE} nie powiodło się`);
    });
    setClock('2026-11-10T10:30:00Z');
    await runCalendarSync(db, settings, now);
    expect(db.select().from(calendars).get()?.lastError).toBe('network');
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.join('\n')).not.toMatch(/SEKRET|calendar\.google\.com|private-/);
  });
});

describe('odświeżanie ręczne', () => {
  it('odświeża od razu, ale najwyżej raz na minutę', async () => {
    const calendar = await addCalendar(parent, { name: 'Rodzina', url: GOOGLE, scope: 'family' });
    serve(GOOGLE, ics(vevent('x', 'DTSTART;VALUE=DATE:20261110', 'SUMMARY:Po odświeżeniu')));

    let response = await send('POST', `/api/calendars/${calendar.id}/sync`, parent);
    expect(response.status).toBe(429);

    setClock('2026-11-10T10:02:00Z');
    response = await send('POST', `/api/calendars/${calendar.id}/sync`, parent);
    expect(response.status).toBe(200);
    expect(calendarSchema.parse(await response.json())).toMatchObject({ eventCount: 1, error: null });
    expect((await send('POST', `/api/calendars/${calendar.id}/sync`, parent)).status).toBe(429);
  });

  it('zwraca błąd kalendarza w odpowiedzi, a nie kod 500', async () => {
    const calendar = await addCalendar(parent, { name: 'Rodzina', url: GOOGLE, scope: 'family' });
    feeds.set(GOOGLE, () => new Response('', { status: 404 }));
    setClock('2026-11-10T10:05:00Z');
    const response = await send('POST', `/api/calendars/${calendar.id}/sync`, parent);
    expect(response.status).toBe(200);
    expect(calendarSchema.parse(await response.json())).toMatchObject({ error: 'not_found' });
  });
});
