import { randomUUID } from 'node:crypto';
import type { ShoppingChange, ShoppingItem } from '@ogarniacz/shared';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * `ShoppingSync`: kolejka zmian listy zakupów w IndexedDB (PROJEKT.md, rozdział 8).
 * Serwer to atrapa `fetch`, a IndexedDB daje `fake-indexeddb`. Każdy test ma pustą bazę telefonu
 * i świeże moduły, bo `storage.ts` i `sync.ts` trzymają stan na poziomie modułu.
 */

const ALA = randomUUID();
const OLEK = randomUUID();

type Sent = { method: string; path: string; body: unknown };
/** Odpowiedź atrapy serwera: kod HTTP albo `'offline'`, czyli brak sieci. */
type Reply = number | 'offline';

let sent: Sent[];
/** Odpowiedzi na kolejne zmiany (POST i PATCH); po ich wyczerpaniu serwer odpowiada poprawnie. */
let replies: Reply[];
/** Lista na serwerze: zwraca ją `GET /api/shopping`, a dodanie i czyszczenie ją zmieniają. */
let serverList: ShoppingItem[];

function item(id: string, name: string): ShoppingItem {
  const at = new Date('2026-11-15T10:00:00.000Z').toISOString();
  return { id, name, quantity: null, checkedAt: null, checkedById: null, addedById: ALA, createdAt: at, updatedAt: at };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function fakeServer(path: string, init?: RequestInit): Promise<Response> {
  const method = init?.method ?? 'GET';
  if (method === 'GET') {
    if (path === '/api/shopping') return json(200, serverList);
    if (path === '/api/shopping/suggestions') return json(200, []);
    return json(404, { error: 'Nie ma takiej trasy' });
  }

  const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined;
  const reply = replies.shift() ?? 200;
  if (reply === 'offline') throw new TypeError('Failed to fetch');
  if (reply === 401) return json(401, { error: 'Zaloguj się' });
  if (reply >= 400) return json(reply, { error: 'Odmowa serwera' });

  sent.push({ method, path, body });
  if (path === '/api/shopping/clear') {
    const { ids } = body as { ids: string[] };
    serverList = serverList.filter((entry) => !ids.includes(entry.id));
    return new Response(null, { status: 204 });
  }
  if (method === 'POST') {
    const input = body as { id: string; name: string };
    const created = item(input.id, input.name);
    serverList = [...serverList.filter((entry) => entry.id !== created.id), created];
    return json(200, created);
  }
  return json(200, item(path.split('/').at(-1) ?? randomUUID(), 'Produkt'));
}

/** Aplikacja uruchomiona od nowa: świeże moduły, ta sama IndexedDB. */
async function startApp() {
  vi.resetModules();
  const sync = await import('./sync');
  const http = await import('../../lib/http');
  return { ...sync, UnauthorizedError: http.UnauthorizedError };
}

function add(name: string): Extract<ShoppingChange, { kind: 'add' }> {
  return { kind: 'add', input: { id: randomUUID(), name } };
}

/** Czeka, aż zmiany trafią do IndexedDB: licznik niewysłanych rośnie dopiero po zapisie. */
async function untilSaved(sync: { getStatus: () => { pending: number } }, pending: number) {
  await vi.waitFor(() => expect(sync.getStatus().pending).toBe(pending));
}

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('fetch', vi.fn(fakeServer));
  sent = [];
  replies = [];
  serverList = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('kolejka zmian', () => {
  test('wysyła zmiany w kolejności, w jakiej powstały', async () => {
    const { shoppingSync } = await startApp();
    const sync = shoppingSync(ALA);
    const milk = add('Mleko');
    const bread = add('Chleb');

    sync.enqueue(milk);
    sync.enqueue(bread);
    sync.enqueue({ kind: 'update', id: milk.input.id, change: { checked: true } });
    sync.enqueue({ kind: 'clear', ids: [bread.input.id] });

    expect(await sync.flush()).toBe(true);
    expect(sent.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'POST /api/shopping',
      'POST /api/shopping',
      `PATCH /api/shopping/${milk.input.id}`,
      'POST /api/shopping/clear',
    ]);
    expect(sent.map(({ body }) => (body as { name?: string }).name).slice(0, 2)).toEqual(['Mleko', 'Chleb']);
    expect(sync.getStatus()).toEqual({ pending: 0, offline: false });
  });

  test('odhaczenie niesie czas zmiany z telefonu', async () => {
    const { shoppingSync } = await startApp();
    const sync = shoppingSync(ALA);
    const id = randomUUID();

    sync.enqueue({ kind: 'update', id, change: { checked: true } });
    await sync.flush();

    const body = sent[0]?.body as { checked: boolean; changedAt: string };
    expect(body.checked).toBe(true);
    expect(Number.isNaN(Date.parse(body.changedAt))).toBe(false);
  });

  test('zmiany od razu widać na liście, zanim dotrą na serwer', async () => {
    const { shoppingSync } = await startApp();
    const sync = shoppingSync(ALA);
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));

    sync.enqueue(add('Masło'));
    const list = await sync.fetchList();

    expect(list.map((entry) => entry.name)).toEqual(['Masło']);
    expect(sync.getStatus().offline).toBe(true);
  });

  test('wywołania flush w trakcie wysyłki nie wysyłają zmian drugi raz', async () => {
    const { shoppingSync } = await startApp();
    const sync = shoppingSync(ALA);
    sync.enqueue(add('Jajka'));

    await Promise.all([sync.flush(), sync.flush(), sync.flush()]);

    expect(sent).toHaveLength(1);
  });
});

describe('ponawianie', () => {
  test('brak sieci zostawia zmianę w kolejce i przerywa wysyłkę', async () => {
    const { shoppingSync } = await startApp();
    const sync = shoppingSync(ALA);
    replies = ['offline'];

    sync.enqueue(add('Ser'));
    sync.enqueue(add('Szynka'));
    await untilSaved(sync, 2);

    expect(await sync.flush()).toBe(false);
    expect(sent).toEqual([]);
    expect(sync.getStatus()).toEqual({ pending: 2, offline: true });

    expect(await sync.flush()).toBe(true);
    expect(sent.map(({ body }) => (body as { name: string }).name)).toEqual(['Ser', 'Szynka']);
    expect(sync.getStatus()).toEqual({ pending: 0, offline: false });
  });

  test.each([500, 503, 408, 429])('błąd %i to chwilowa awaria: zmiana czeka na kolejną próbę', async (status) => {
    const { shoppingSync } = await startApp();
    const sync = shoppingSync(ALA);
    replies = [status];

    sync.enqueue(add('Woda'));
    await untilSaved(sync, 1);
    await sync.flush();

    expect(sent).toEqual([]);
    expect(sync.getStatus()).toEqual({ pending: 1, offline: true });

    await sync.flush();
    expect(sent).toHaveLength(1);
  });

  test.each([400, 403, 404, 409])('ostateczna odmowa %i pomija zmianę, a kolejne idą dalej', async (status) => {
    const { shoppingSync } = await startApp();
    const sync = shoppingSync(ALA);
    replies = [status];

    sync.enqueue({ kind: 'update', id: randomUUID(), change: { checked: true } });
    sync.enqueue(add('Cukier'));
    expect(await sync.flush()).toBe(true);

    expect(sent.map(({ method }) => method)).toEqual(['POST']);
    expect(sync.getStatus()).toEqual({ pending: 0, offline: false });
  });

  test('kolejka przetrwa zamknięcie aplikacji i wychodzi po ponownym starcie', async () => {
    const first = await startApp();
    const before = first.shoppingSync(ALA);
    replies = ['offline'];
    before.enqueue(add('Kawa'));
    await before.flush();
    await untilSaved(before, 1);

    const { shoppingSync } = await startApp();
    const after = shoppingSync(ALA);
    expect((await after.fetchList()).map((entry) => entry.name)).toEqual(['Kawa']);

    expect(sent.map(({ body }) => (body as { name: string }).name)).toEqual(['Kawa']);
    expect(after.getStatus()).toEqual({ pending: 0, offline: false });
  });

  test('ostatnia lista z serwera zostaje na telefonie na czas bez sieci', async () => {
    serverList = [item(randomUUID(), 'Herbata')];
    const first = await startApp();
    await first.shoppingSync(ALA).fetchList();

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const { shoppingSync } = await startApp();
    const sync = shoppingSync(ALA);

    await vi.waitFor(async () => expect((await sync.fetchList()).map((entry) => entry.name)).toEqual(['Herbata']));
    expect(sync.getStatus().offline).toBe(true);
  });
});

describe('sesja i zmiana konta', () => {
  test('wygaśnięcie sesji przerywa wysyłkę, a kolejka czeka na ponowne logowanie tej samej osoby', async () => {
    const first = await startApp();
    const sync = first.shoppingSync(ALA);
    replies = [401];

    sync.enqueue(add('Ryż'));
    await untilSaved(sync, 1);
    await expect(sync.flush()).rejects.toBeInstanceOf(first.UnauthorizedError);
    expect(sync.getStatus().pending).toBe(1);

    // Ponowne logowanie przeładowuje dane, a ta sama osoba dostaje swoją kolejkę z telefonu.
    const { shoppingSync } = await startApp();
    await shoppingSync(ALA).flush();
    expect(sent.map(({ body }) => (body as { name: string }).name)).toEqual(['Ryż']);
  });

  test('zalogowanie innej osoby porzuca kolejkę i listę poprzedniej', async () => {
    serverList = [item(randomUUID(), 'Makaron')];
    const first = await startApp();
    const ala = first.shoppingSync(ALA);
    await ala.fetchList();
    replies = ['offline'];
    ala.enqueue(add('Prywatne Ali'));
    await ala.flush();
    await untilSaved(ala, 1);

    const { shoppingSync } = await startApp();
    const olek = shoppingSync(OLEK);
    serverList = [];
    const list = await olek.fetchList();

    expect(list).toEqual([]);
    expect(sent).toEqual([]);
    expect(olek.getStatus().pending).toBe(0);

    // Kopia Ali została nadpisana kopią Olka, więc po powrocie Ali nie ma czego wysłać.
    await vi.waitFor(async () => {
      const again = await startApp();
      const back = again.shoppingSync(ALA);
      await back.flush();
      expect(sent).toEqual([]);
      expect(back.view()).toEqual([]);
    });
  });

  test('zmiana osoby w działającej aplikacji daje nową, pustą kolejkę', async () => {
    const { shoppingSync } = await startApp();
    const ala = shoppingSync(ALA);
    replies = ['offline'];
    ala.enqueue(add('Czekolada'));
    await ala.flush();

    const olek = shoppingSync(OLEK);
    expect(olek).not.toBe(ala);
    expect(olek.view()).toEqual([]);
    await olek.flush();
    expect(sent).toEqual([]);
  });

  test('wylogowanie usuwa z telefonu kopię listy i niewysłane zmiany', async () => {
    const first = await startApp();
    const sync = first.shoppingSync(ALA);
    replies = ['offline'];
    sync.enqueue(add('Mąka'));
    await sync.flush();
    await untilSaved(sync, 1);

    await first.forgetShopping();

    const { shoppingSync } = await startApp();
    const after = shoppingSync(ALA);
    await after.flush();
    expect(sent).toEqual([]);
    expect(after.view()).toEqual([]);
  });
});
