import { type NotificationPrefs, type PushConfig, notificationPrefsSchema, pushConfigSchema } from '@ogarniacz/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import { createUser } from './auth/users';
import { type Db, openDatabase } from './db/client';
import { calendarEvents, calendars, notifications, pushSubscriptions, shoppingItems, tasks } from './db/schema';
import { runDueReminders, runMorningSummaries } from './push/jobs';
import type { PushPayload, PushResult, PushSettings, PushTarget } from './push/sender';

const APPLE = 'https://web.push.apple.com/abc';
const GOOGLE = 'https://fcm.googleapis.com/fcm/send/xyz';
const KEYS = { p256dh: 'klucz-p256dh', auth: 'klucz-auth' };

let db: Db;
let close: () => void;
let clock: number;
let sent: { target: PushTarget; payload: PushPayload }[];
let nextResult: (target: PushTarget) => PushResult;
let push: PushSettings;
let app: ReturnType<typeof createApp>;
let parentCookie: string;
let childCookie: string;
let parentId: string;
let childId: string;

const at = (iso: string) => {
  clock = Date.parse(iso);
};
const now = () => new Date(clock);

function call(method: string, path: string, body?: unknown, session = parentCookie) {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: session },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function logIn(login: string, password: string) {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password }),
  });
  return (response.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';
}

async function subscribe(endpoint: string, session = parentCookie) {
  const response = await call('POST', '/api/push/subscriptions', { endpoint, keys: KEYS }, session);
  expect(response.status).toBeLessThan(300);
}

/** Wysyłka w tle po zapisie zadania kończy się po chwili, więc czekamy na efekt. */
const flush = () => vi.waitFor(() => expect(sent.length).toBeGreaterThan(0));

beforeEach(async () => {
  ({ db, close } = openDatabase(':memory:', './drizzle'));
  // 10 listopada 2026, 12:00 w Polsce.
  at('2026-11-10T11:00:00Z');
  sent = [];
  nextResult = () => ({ ok: true });
  push = {
    publicKey: 'publiczny-klucz-vapid',
    send: async (target, payload) => {
      sent.push({ target, payload });
      return nextResult(target);
    },
  };
  app = createApp({ db, now, push });
  parentId = (await createUser(db, { login: 'tata', name: 'Tata', role: 'parent', password: 'haslo-rodzica' })).id;
  childId = (await createUser(db, { login: 'zosia', name: 'Zosia', role: 'child', password: 'haslo-dziecka' })).id;
  parentCookie = await logIn('tata', 'haslo-rodzica');
  childCookie = await logIn('zosia', 'haslo-dziecka');
});

afterEach(() => close());

describe('subskrypcje', () => {
  it('podają klucz publiczny i liczbę urządzeń osoby', async () => {
    await subscribe(APPLE);
    const config = pushConfigSchema.parse(await (await call('GET', '/api/push/config')).json());
    expect(config).toEqual({ enabled: true, publicKey: 'publiczny-klucz-vapid', devices: 1 } satisfies PushConfig);
    const child = pushConfigSchema.parse(await (await call('GET', '/api/push/config', undefined, childCookie)).json());
    expect(child.devices).toBe(0);
  });

  it('odrzucają adres spoza znanych usług push', async () => {
    const response = await call('POST', '/api/push/subscriptions', { endpoint: 'https://example.com/push', keys: KEYS });
    expect(response.status).toBe(400);
    expect(await db.select().from(pushSubscriptions).all()).toHaveLength(0);
  });

  it('bez kluczy VAPID na serwerze odpowiadają 503, a konfiguracja mówi, że powiadomień nie ma', async () => {
    const bare = createApp({ db, now });
    const response = await bare.request('/api/push/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: parentCookie },
      body: JSON.stringify({ endpoint: APPLE, keys: KEYS }),
    });
    expect(response.status).toBe(503);
    const config = pushConfigSchema.parse(await (await bare.request('/api/push/config', { headers: { Cookie: parentCookie } })).json());
    expect(config.enabled).toBe(false);
  });

  it('przepinają telefon na nową osobę po zmianie konta i nie dublują wiersza', async () => {
    await subscribe(APPLE, parentCookie);
    await subscribe(APPLE, childCookie);
    const rows = db.select().from(pushSubscriptions).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(childId);
  });

  it('pozwalają wyłączyć tylko własne urządzenie', async () => {
    await subscribe(APPLE, parentCookie);
    await call('DELETE', '/api/push/subscriptions', { endpoint: APPLE }, childCookie);
    expect(db.select().from(pushSubscriptions).all()).toHaveLength(1);
    const response = await call('DELETE', '/api/push/subscriptions', { endpoint: APPLE }, parentCookie);
    expect(response.status).toBe(204);
    expect(db.select().from(pushSubscriptions).all()).toHaveLength(0);
  });

  it('wymagają zalogowania', async () => {
    const response = await app.request('/api/push/config');
    expect(response.status).toBe(401);
  });

  it('wysyłają test tylko na własne urządzenia i z odstępem', async () => {
    expect((await call('POST', '/api/push/test')).status).toBe(400);
    await subscribe(APPLE);
    await subscribe(GOOGLE, childCookie);
    const first = await call('POST', '/api/push/test');
    expect(await first.json()).toEqual({ sent: 1, devices: 1 });
    expect(sent.map((item) => item.target.endpoint)).toEqual([APPLE]);
    expect((await call('POST', '/api/push/test')).status).toBe(429);
  });
});

describe('ustawienia powiadomień', () => {
  it('mają wartości domyślne i zapamiętują zmiany częściowo', async () => {
    const defaults = notificationPrefsSchema.parse(await (await call('GET', '/api/push/prefs')).json());
    expect(defaults).toMatchObject({ morning: true, assigned: true, due: true, morningHour: 7, quietFrom: 21, quietTo: 7 });

    const response = await call('PATCH', '/api/push/prefs', { due: false, morningHour: 8 });
    expect(response.status).toBe(200);
    const saved: NotificationPrefs = notificationPrefsSchema.parse(await (await call('GET', '/api/push/prefs')).json());
    expect(saved).toMatchObject({ morning: true, due: false, morningHour: 8 });
    // Ustawienia są osobne dla każdej osoby.
    const child = notificationPrefsSchema.parse(await (await call('GET', '/api/push/prefs', undefined, childCookie)).json());
    expect(child.morningHour).toBe(7);
  });

  it('odrzucają godzinę poza listą i pusty wniosek', async () => {
    expect((await call('PATCH', '/api/push/prefs', { morningHour: 14 })).status).toBe(400);
    expect((await call('PATCH', '/api/push/prefs', {})).status).toBe(400);
  });
});

describe('powiadomienie o przypisaniu', () => {
  it('trafia do osoby, której rodzic przypisał zadanie', async () => {
    await subscribe(APPLE, childCookie);
    await call('POST', '/api/tasks', { title: 'Odkurzyć pokój', assigneeId: childId, dueOn: '2026-11-12' });
    await flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload).toMatchObject({ title: 'Nowe zadanie od Tata', body: 'Odkurzyć pokój. Termin: 12.11.2026', url: '/?ekran=board' });
  });

  it('wychodzi też przy zmianie osoby w istniejącym zadaniu, ale nie przy samodzielnym braniu', async () => {
    await subscribe(APPLE, childCookie);
    const free = await (await call('POST', '/api/tasks', { title: 'Wyrzucić śmieci', assigneeId: null })).json();
    expect(sent).toHaveLength(0);

    // Dziecko bierze zadanie samo: sobie nie przypomina.
    await call('PATCH', `/api/tasks/${free.id}`, { status: 'in_progress' }, childCookie);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sent).toHaveLength(0);

    await call('PATCH', `/api/tasks/${free.id}`, { assigneeId: parentId });
    await call('PATCH', `/api/tasks/${free.id}`, { assigneeId: childId });
    await flush();
    expect(sent).toHaveLength(1);
  });

  it('nie wysyła, gdy osoba wyłączyła ten rodzaj albo jest cisza nocna', async () => {
    await subscribe(APPLE, childCookie);
    await call('PATCH', '/api/push/prefs', { assigned: false }, childCookie);
    await call('POST', '/api/tasks', { title: 'A', assigneeId: childId });
    await call('PATCH', '/api/push/prefs', { assigned: true }, childCookie);
    at('2026-11-10T21:30:00Z'); // 22:30 w Polsce
    await call('POST', '/api/tasks', { title: 'B', assigneeId: childId });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sent).toHaveLength(0);
  });

  it('nie psuje zapisu zadania, gdy wysyłka się nie udaje', async () => {
    await subscribe(APPLE, childCookie);
    nextResult = () => ({ ok: false, statusCode: 500 });
    const response = await call('POST', '/api/tasks', { title: 'Zadanie', assigneeId: childId });
    expect(response.status).toBe(201);
  });
});

describe('poranne podsumowanie', () => {
  function seedDay() {
    const created = new Date('2026-11-01T10:00:00Z');
    const base = { createdAt: created, updatedAt: created, createdById: parentId };
    db.insert(tasks).values([
      { id: 't1', title: 'Podlać kwiaty', assigneeId: childId, dueOn: '2026-11-10', ...base },
      { id: 't2', title: 'Zadanie z zeszłego tygodnia', assigneeId: childId, dueOn: '2026-11-05', ...base },
      { id: 't3', title: 'Zrobione', assigneeId: childId, dueOn: '2026-11-10', status: 'done', ...base },
      { id: 't4', title: 'Cudze', assigneeId: parentId, dueOn: '2026-11-10', ...base },
    ]).run();
    db.insert(shoppingItems).values([
      { id: 's1', name: 'Mleko', nameKey: 'mleko', addedById: parentId, createdAt: created, updatedAt: created },
      { id: 's2', name: 'Chleb', nameKey: 'chleb', addedById: parentId, createdAt: created, updatedAt: created },
    ]).run();
    db.insert(calendars).values({ id: 'c1', name: 'Rodzina', urlEnc: '', urlHost: 'calendar.google.com', scope: 'family', ownerId: parentId, createdAt: created, updatedAt: created }).run();
    db.insert(calendarEvents).values({ calendarId: 'c1', uid: 'e1', instance: '', title: 'Dentysta', allDay: false, startsAt: new Date('2026-11-10T13:30:00Z'), endsAt: new Date('2026-11-10T14:00:00Z'), startOn: '2026-11-10', endOn: '2026-11-10' }).run();
  }

  it('zbiera zadania, wydarzenia i zakupy i otwiera „Dziś”', async () => {
    seedDay();
    await subscribe(APPLE, childCookie);
    at('2026-11-10T06:05:00Z'); // 7:05
    expect(await runMorningSummaries(db, push, now)).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload).toEqual({
      title: 'Zosia, na dziś 2 zadania',
      body: 'Na dziś: Podlać kwiaty. Zaległe: 1. Wydarzenia: 14:30 Dentysta. Do kupienia: 2 rzeczy.',
      url: '/?ekran=today',
      tag: 'morning',
    });
  });

  it('nie wychodzi przed godziną osoby i wychodzi dokładnie raz, także po restarcie', async () => {
    await subscribe(APPLE, childCookie);
    at('2026-11-10T05:30:00Z'); // 6:30
    expect(await runMorningSummaries(db, push, now)).toBe(0);

    at('2026-11-10T06:00:00Z'); // 7:00
    expect(await runMorningSummaries(db, push, now)).toBe(1);
    at('2026-11-10T06:05:00Z');
    expect(await runMorningSummaries(db, push, now)).toBe(0);
    // „Restart”: nowa aplikacja i nowe wywołanie na tej samej bazie.
    at('2026-11-10T08:00:00Z');
    expect(await runMorningSummaries(db, push, now)).toBe(0);
    expect(sent).toHaveLength(1);

    // Następnego dnia znów jedno.
    at('2026-11-11T06:00:00Z');
    expect(await runMorningSummaries(db, push, now)).toBe(1);
    expect(sent).toHaveLength(2);
  });

  it('po restarcie nadrabia spóźnione podsumowanie przed południem, ale po południu już nie', async () => {
    await subscribe(APPLE, childCookie);
    at('2026-11-10T09:30:00Z'); // 10:30
    expect(await runMorningSummaries(db, push, now)).toBe(1);

    at('2026-11-11T12:30:00Z'); // 13:30
    expect(await runMorningSummaries(db, push, now)).toBe(0);
  });

  it('szanuje godzinę i wyłączenie ustawione przez osobę', async () => {
    await subscribe(APPLE, childCookie);
    await subscribe(GOOGLE, parentCookie);
    await call('PATCH', '/api/push/prefs', { morningHour: 9 }, childCookie);
    await call('PATCH', '/api/push/prefs', { morning: false }, parentCookie);
    at('2026-11-10T06:30:00Z'); // 7:30
    expect(await runMorningSummaries(db, push, now)).toBe(0);
    at('2026-11-10T08:00:00Z'); // 9:00
    expect(await runMorningSummaries(db, push, now)).toBe(1);
    expect(sent.map((item) => item.target.endpoint)).toEqual([APPLE]);
  });

  it('bez urządzenia nie zajmuje klucza: po włączeniu powiadomień tego samego dnia dociera', async () => {
    at('2026-11-10T06:05:00Z');
    expect(await runMorningSummaries(db, push, now)).toBe(0);
    expect(db.select().from(notifications).all()).toHaveLength(0);
    await subscribe(APPLE, childCookie);
    expect(await runMorningSummaries(db, push, now)).toBe(1);
  });

  it('wysyła na wszystkie urządzenia osoby jako jedno powiadomienie', async () => {
    await subscribe(APPLE, childCookie);
    await subscribe(GOOGLE, childCookie);
    at('2026-11-10T06:05:00Z');
    await runMorningSummaries(db, push, now);
    expect(sent).toHaveLength(2);
    expect(db.select().from(notifications).all()).toHaveLength(1);
  });

  it('sprząta subskrypcje, które usługa push uznała za wygasłe', async () => {
    await subscribe(APPLE, childCookie);
    await subscribe(GOOGLE, childCookie);
    nextResult = (target) => (target.endpoint === APPLE ? { ok: false, statusCode: 410 } : { ok: true });
    at('2026-11-10T06:05:00Z');
    await runMorningSummaries(db, push, now);
    expect(db.select().from(pushSubscriptions).all().map((row) => row.endpoint)).toEqual([GOOGLE]);
  });

  it('usuwa urządzenie dopiero po kilku nieudanych wysyłkach z rzędu', async () => {
    await subscribe(APPLE, childCookie);
    nextResult = () => ({ ok: false, statusCode: 503 });
    for (let day = 10; day <= 13; day += 1) {
      at(`2026-11-${day}T06:05:00Z`);
      await runMorningSummaries(db, push, now);
    }
    expect(db.select().from(pushSubscriptions).all()).toHaveLength(1);
    expect(db.select().from(pushSubscriptions).get()?.lastError).toBe('503');
    at('2026-11-14T06:05:00Z');
    await runMorningSummaries(db, push, now);
    expect(db.select().from(pushSubscriptions).all()).toHaveLength(0);
  });

  it('nie wysyła do wyłączonych kont', async () => {
    await subscribe(APPLE, childCookie);
    db.update(pushSubscriptions).set({ lastError: null }).where(eq(pushSubscriptions.endpoint, APPLE)).run();
    const { users } = await import('./db/schema');
    db.update(users).set({ disabledAt: now() }).where(eq(users.id, childId)).run();
    at('2026-11-10T06:05:00Z');
    expect(await runMorningSummaries(db, push, now)).toBe(0);
  });
});

describe('przypomnienie o terminie jutro', () => {
  function addDueTasks() {
    const created = new Date('2026-11-01T10:00:00Z');
    const base = { createdAt: created, updatedAt: created, createdById: parentId };
    db.insert(tasks).values([
      { id: 'a', title: 'Zadanie z lekcji', assigneeId: childId, dueOn: '2026-11-11', ...base },
      { id: 'b', title: 'Pokój', assigneeId: childId, dueOn: '2026-11-11', ...base },
      { id: 'c', title: 'Za dwa dni', assigneeId: childId, dueOn: '2026-11-12', ...base },
      { id: 'd', title: 'Zrobione', assigneeId: childId, dueOn: '2026-11-11', status: 'done', ...base },
    ]).run();
  }

  it('wysyła jedno zbiorcze przypomnienie wieczorem i nie powtarza go', async () => {
    addDueTasks();
    await subscribe(APPLE, childCookie);
    at('2026-11-10T16:00:00Z'); // 17:00
    expect(await runDueReminders(db, push, now)).toBe(0);
    at('2026-11-10T17:10:00Z'); // 18:10
    expect(await runDueReminders(db, push, now)).toBe(1);
    expect(sent[0]?.payload).toMatchObject({ title: 'Jutro termin: 2 zadania', body: 'Zadanie z lekcji, Pokój', url: '/?ekran=board' });
    at('2026-11-10T18:10:00Z');
    expect(await runDueReminders(db, push, now)).toBe(0);
  });

  it('nic nie wysyła osobie bez zadań na jutro ani po wyłączeniu rodzaju', async () => {
    await subscribe(APPLE, childCookie);
    at('2026-11-10T17:10:00Z');
    expect(await runDueReminders(db, push, now)).toBe(0);
    addDueTasks();
    await call('PATCH', '/api/push/prefs', { due: false }, childCookie);
    expect(await runDueReminders(db, push, now)).toBe(0);
  });
});
