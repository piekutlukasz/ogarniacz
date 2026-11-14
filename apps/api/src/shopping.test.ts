import { randomUUID } from 'node:crypto';
import {
  type ShoppingItem,
  matchSuggestions,
  shoppingItemSchema,
  shoppingListSchema,
  shoppingSuggestionListSchema,
} from '@ogarniacz/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createUser } from './auth/users';
import { openDatabase } from './db/client';

let close: () => void;
let app: ReturnType<typeof createApp>;
let cookie: string;
let childCookie: string;
let clock: number;
let parentId: string;
let childId: string;

function sendJson(method: 'POST' | 'PATCH', path: string, body: unknown, session = cookie) {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: session },
    body: JSON.stringify(body),
  });
}

async function logIn(login: string, password: string): Promise<string> {
  const response = await sendJson('POST', '/api/auth/login', { login, password }, '');
  expect(response.status).toBe(200);
  return (response.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';
}

async function add(name: string, quantity?: string, session = cookie): Promise<ShoppingItem> {
  const response = await sendJson('POST', '/api/shopping', { name, quantity }, session);
  expect(response.status).toBe(201);
  return shoppingItemSchema.parse(await response.json());
}

async function change(id: string, update: unknown, session = cookie) {
  return sendJson('PATCH', `/api/shopping/${id}`, update, session);
}

async function list(session = cookie): Promise<ShoppingItem[]> {
  const response = await app.request('/api/shopping', { headers: { Cookie: session } });
  expect(response.status).toBe(200);
  return shoppingListSchema.parse(await response.json());
}

async function suggestions() {
  const response = await app.request('/api/shopping/suggestions', { headers: { Cookie: cookie } });
  expect(response.status).toBe(200);
  return shoppingSuggestionListSchema.parse(await response.json());
}

/** Kupuje produkt: dodaje, odhacza i czyści koszyk, jak w sklepie. */
async function buy(name: string, quantity?: string) {
  const item = await add(name, quantity);
  expect((await change(item.id, { checked: true })).status).toBe(200);
  expect((await sendJson('POST', '/api/shopping/clear', { ids: [item.id] })).status).toBe(200);
  clock += 60_000;
}

beforeEach(async () => {
  const opened = openDatabase(':memory:', './drizzle');
  close = opened.close;
  clock = Date.parse('2026-11-09T11:00:00Z');
  app = createApp({ db: opened.db, now: () => new Date(clock) });
  parentId = (await createUser(opened.db, { login: 'tata', name: 'Tata', role: 'parent', password: 'haslo-rodzica' })).id;
  childId = (await createUser(opened.db, { login: 'zosia', name: 'Zosia', role: 'child', password: 'haslo-dziecka' })).id;
  cookie = await logIn('tata', 'haslo-rodzica');
  childCookie = await logIn('zosia', 'haslo-dziecka');
});

afterEach(() => close());

describe('lista zakupów', () => {
  it('wymaga zalogowania', async () => {
    const response = await app.request('/api/shopping');
    expect(response.status).toBe(401);
  });

  it('dziecko dodaje i odhacza, a rodzic widzi to samo', async () => {
    const milk = await add('  Mleko   2% ', ' 2 ', childCookie);
    expect(milk).toMatchObject({ name: 'Mleko 2%', quantity: '2', addedById: childId, checkedAt: null });

    const response = await change(milk.id, { checked: true }, childCookie);
    expect(response.status).toBe(200);

    const [seen] = await list(cookie);
    expect(seen).toMatchObject({ id: milk.id, checkedById: childId, checkedAt: '2026-11-09T11:00:00.000Z' });
  });

  it('odrzuca pustą nazwę i zbyt długą ilość', async () => {
    expect((await sendJson('POST', '/api/shopping', { name: '   ' })).status).toBe(400);
    expect((await sendJson('POST', '/api/shopping', { name: 'Chleb', quantity: 'x'.repeat(31) })).status).toBe(400);
  });

  it('pusta ilość oznacza brak ilości', async () => {
    const bread = await add('Chleb', '1');
    const response = await change(bread.id, { quantity: '  ' });
    expect(shoppingItemSchema.parse(await response.json()).quantity).toBeNull();
  });

  it('ponowione dodanie z tym samym identyfikatorem nie robi duplikatu', async () => {
    const id = randomUUID();
    const first = await sendJson('POST', '/api/shopping', { id, name: 'Jajka' });
    const again = await sendJson('POST', '/api/shopping', { id, name: 'Jajka' });
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect((await list()).map((item) => item.id)).toEqual([id]);
  });

  it('ponowne odhaczenie nie zmienia czasu ani osoby', async () => {
    const butter = await add('Masło');
    await change(butter.id, { checked: true });
    clock += 60_000;
    const again = shoppingItemSchema.parse(await (await change(butter.id, { checked: true }, childCookie)).json());
    expect(again).toMatchObject({ checkedById: parentId, checkedAt: '2026-11-09T11:00:00.000Z' });

    const unchecked = shoppingItemSchema.parse(await (await change(butter.id, { checked: false })).json());
    expect(unchecked).toMatchObject({ checkedById: null, checkedAt: null });
  });

  it('czyści tylko wskazane kupione, nieodhaczone zostają', async () => {
    const bought = await add('Ser');
    const alsoBought = await add('Szynka');
    const waiting = await add('Pomidory');
    await change(bought.id, { checked: true });
    await change(alsoBought.id, { checked: true });

    // Telefon widział w koszyku tylko ser i pomidory, które w międzyczasie ktoś odznaczył.
    const response = await sendJson('POST', '/api/shopping/clear', { ids: [bought.id, waiting.id] });
    expect(await response.json()).toEqual({ cleared: 1 });
    expect((await list()).map((item) => item.name)).toEqual(['Szynka', 'Pomidory']);
  });

  it('usunięcie zdejmuje produkt z listy, a dalsze zmiany dają 404', async () => {
    const typo = await add('Mlkeo');
    expect((await change(typo.id, { removed: true })).status).toBe(200);
    expect(await list()).toEqual([]);
    expect((await change(typo.id, { checked: true })).status).toBe(404);
    expect((await change(randomUUID(), { checked: true })).status).toBe(404);
  });
});

describe('zmiany zrobione bez sieci', () => {
  const minutesAgo = (minutes: number) => new Date(clock - minutes * 60_000).toISOString();

  it('starsze odhaczenie nie nadpisuje nowszego odznaczenia', async () => {
    const milk = await add('Mleko');
    clock += 10 * 60_000;
    await change(milk.id, { checked: true });
    await change(milk.id, { checked: false }, childCookie);

    // Tata odhaczył mleko w sklepie bez zasięgu 5 minut temu, a telefon wysłał to dopiero teraz.
    const late = shoppingItemSchema.parse(await (await change(milk.id, { checked: true, changedAt: minutesAgo(5) })).json());
    expect(late.checkedAt).toBeNull();
  });

  it('odhaczenie i zmiana ilości z różnych telefonów nie kolidują', async () => {
    const eggs = await add('Jajka', '6');
    clock += 10 * 60_000;
    await change(eggs.id, { quantity: '10' }, childCookie);
    const offline = await change(eggs.id, { checked: true, changedAt: minutesAgo(5) });
    expect(shoppingItemSchema.parse(await offline.json())).toMatchObject({ quantity: '10', checkedById: parentId });

    // Starsza edycja ilości przegrywa z nowszą, a odhaczenie zostaje.
    const staleEdit = await change(eggs.id, { quantity: '6', changedAt: minutesAgo(8) });
    expect(shoppingItemSchema.parse(await staleEdit.json())).toMatchObject({ quantity: '10' });
  });

  it('odhaczenie bez sieci zapisuje czas z telefonu, a czas z przyszłości przycina', async () => {
    const bread = await add('Chleb');
    clock += 10 * 60_000;
    const checked = shoppingItemSchema.parse(await (await change(bread.id, { checked: true, changedAt: minutesAgo(3) })).json());
    expect(checked.checkedAt).toBe(minutesAgo(3));

    const future = await change(bread.id, { checked: false, changedAt: new Date(clock + 3_600_000).toISOString() });
    expect(future.status).toBe(200);
    // Zegar z przyszłości nie blokuje późniejszych zmian zrobionych o właściwym czasie.
    clock += 60_000;
    const now = shoppingItemSchema.parse(await (await change(bread.id, { checked: true })).json());
    expect(now.checkedAt).not.toBeNull();
  });

  it('usunięcie wygrywa z nowszym odhaczeniem', async () => {
    const typo = await add('Mlkeo');
    clock += 10 * 60_000;
    await change(typo.id, { checked: true }, childCookie);
    expect((await change(typo.id, { removed: true, changedAt: minutesAgo(5) })).status).toBe(200);
    expect(await list()).toEqual([]);
  });

  it('sam czas zmiany bez pól to błąd', async () => {
    const item = await add('Sól');
    expect((await change(item.id, { changedAt: minutesAgo(1) })).status).toBe(400);
  });
});

describe('podpowiedzi z historii', () => {
  it('liczą kupione produkty bez względu na wielkość liter, z ostatnią pisownią i ilością', async () => {
    await buy('mleko', '1');
    await buy('Chleb');
    await buy('Mleko ', '2');
    const typo = await add('Mlkeo');
    await change(typo.id, { removed: true });
    await add('Cukier');

    expect(await suggestions()).toEqual([
      { name: 'Mleko', quantity: '2', count: 2, lastBoughtAt: '2026-11-09T11:02:00.000Z' },
      { name: 'Chleb', quantity: null, count: 1, lastBoughtAt: '2026-11-09T11:01:00.000Z' },
    ]);
  });

  it('dopasowanie: najpierw początek nazwy, potem środek, bez produktów już na liście', () => {
    const at = '2026-11-09T11:00:00.000Z';
    const history = [
      { name: 'Masło', quantity: null, count: 9, lastBoughtAt: at },
      { name: 'Mleko', quantity: null, count: 5, lastBoughtAt: at },
      { name: 'Kasza manna', quantity: null, count: 3, lastBoughtAt: at },
      { name: 'Makaron', quantity: null, count: 1, lastBoughtAt: at },
    ];
    expect(matchSuggestions(history, 'ma', ['masło']).map((item) => item.name)).toEqual(['Makaron', 'Kasza manna']);
    expect(matchSuggestions(history, '', [], 2).map((item) => item.name)).toEqual(['Masło', 'Mleko']);
    expect(matchSuggestions(history, 'MLEKO', []).map((item) => item.name)).toEqual([]);
  });
});
