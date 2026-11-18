import { randomUUID } from 'node:crypto';
import { type ShoppingChange, type ShoppingItem, applyShoppingChange, shoppingListSchema } from '@ogarniacz/shared';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createUser } from './auth/users';
import { openDatabase } from './db/client';

/**
 * Testy właściwości dla listy zakupów offline (PROJEKT.md, rozdział 8): telefon pokazuje zmianę od razu przez
 * `applyShoppingChange`, a serwer rozstrzyga ją w `routes/shopping.ts`. Obie strony muszą dojść do tej samej listy.
 * Jedna baza na cały plik, bo założenie konta liczy skrót hasła; każdy przebieg używa nowych identyfikatorów.
 */

let close: () => void;
let app: ReturnType<typeof createApp>;
let cookie: string;
let userId: string;
let clock = Date.parse('2026-11-09T11:00:00Z');

beforeAll(async () => {
  const opened = openDatabase(':memory:', './drizzle');
  close = opened.close;
  app = createApp({ db: opened.db, now: () => new Date(clock) });
  userId = (await createUser(opened.db, { login: 'tata', name: 'Tata', role: 'parent', password: 'haslo-rodzica' })).id;
  const response = await send('POST', '/api/auth/login', { login: 'tata', password: 'haslo-rodzica' });
  cookie = (response.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';
});

afterAll(() => close());

function send(method: 'POST' | 'PATCH', path: string, body: unknown) {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie ?? '' },
    body: JSON.stringify(body),
  });
}

/** Wysyła zmianę tak jak `ShoppingSync`. Odmowa (404 dla usuniętego produktu) też jest dla kolejki końcem zmiany. */
async function deliver(change: ShoppingChange): Promise<void> {
  const response =
    change.kind === 'add'
      ? await send('POST', '/api/shopping', change.input)
      : change.kind === 'update'
        ? await send('PATCH', `/api/shopping/${change.id}`, change.change)
        : await send('POST', '/api/shopping/clear', { ids: change.ids });
  expect([200, 201, 404]).toContain(response.status);
}

async function serverList(): Promise<ShoppingItem[]> {
  const response = await app.request('/api/shopping', { headers: { Cookie: cookie } });
  return shoppingListSchema.parse(await response.json());
}

/** To, co widzi domownik: bez czasów i osób, które zależą od chwili wysłania. */
function visible(items: ShoppingItem[], ids: string[]) {
  return items
    .filter((item) => ids.includes(item.id))
    .map((item) => ({ id: item.id, name: item.name, quantity: item.quantity, checked: item.checkedAt !== null }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// Nazwy i ilości z odstępami i polskimi znakami, w limitach z formularza (po obcięciu spacji).
const word = fc.string({ unit: fc.constantFrom('a', 'ż', 'Ł', '1', ' ', '  '), minLength: 1, maxLength: 12 });
const anyName = word.filter((name) => name.trim().length > 0);
const anyQuantity = fc.option(word, { nil: null });

/** Zmiana zapisana na „slot” produktu; sloty dostają w każdym przebiegu nowe UUID. */
type Step =
  | { kind: 'add'; slot: number; name: string; quantity: string | null }
  | { kind: 'check'; slot: number; checked: boolean }
  | { kind: 'edit'; slot: number; name: string; quantity: string | null }
  | { kind: 'remove'; slot: number }
  | { kind: 'clear'; slots: number[] };

const slot = fc.integer({ min: 0, max: 3 });
const anyStep: fc.Arbitrary<Step> = fc.oneof(
  fc.record({ kind: fc.constant('add' as const), slot, name: anyName, quantity: anyQuantity }),
  fc.record({ kind: fc.constant('check' as const), slot, checked: fc.boolean() }),
  fc.record({ kind: fc.constant('edit' as const), slot, name: anyName, quantity: anyQuantity }),
  fc.record({ kind: fc.constant('remove' as const), slot }),
  fc.record({ kind: fc.constant('clear' as const), slots: fc.uniqueArray(slot, { minLength: 1 }) }),
);

function toChange(step: Step, ids: string[]): ShoppingChange {
  switch (step.kind) {
    case 'add':
      return { kind: 'add', input: { id: ids[step.slot]!, name: step.name, quantity: step.quantity } };
    case 'check':
      return { kind: 'update', id: ids[step.slot]!, change: { checked: step.checked } };
    case 'edit':
      // Formularz edycji zawsze wysyła nazwę razem z ilością.
      return { kind: 'update', id: ids[step.slot]!, change: { name: step.name, quantity: step.quantity } };
    case 'remove':
      return { kind: 'update', id: ids[step.slot]!, change: { removed: true } };
    case 'clear':
      return { kind: 'clear', ids: step.slots.map((index) => ids[index]!) };
  }
}

describe('lista zakupów: telefon i serwer', () => {
  it('ten sam ciąg zmian, wysłany po kolei i z powtórzeniami, daje na telefonie i serwerze tę samą listę', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.tuple(anyStep, fc.boolean()), { maxLength: 25 }), async (steps) => {
        const ids = Array.from({ length: 4 }, () => randomUUID());
        let phone: ShoppingItem[] = [];
        const added = new Set<number>();
        for (const [step, resend] of steps) {
          // Telefon nadaje UUID raz: produktu, który zniknął z listy, nie dodaje drugi raz pod tym samym numerem.
          if (step.kind === 'add' && added.has(step.slot) && !phone.some((item) => item.id === ids[step.slot])) continue;
          if (step.kind === 'add') added.add(step.slot);

          clock += 1000;
          const at = new Date(clock).toISOString();
          const change = toChange(step, ids);
          const queued = change.kind === 'update' ? { ...change, change: { ...change.change, changedAt: at } } : change;
          phone = applyShoppingChange(phone, queued, userId, at);
          await deliver(queued);
          // Ponowna wysyłka po zerwanym połączeniu: ta sama zmiana jeszcze raz.
          if (resend) await deliver(queued);
          expect(visible(await serverList(), ids)).toEqual(visible(phone, ids));
        }
      }),
      { numRuns: 60 },
    );
  });
});

/** Zmiana jednego produktu z czasem z telefonu, liczonym w sekundach po dodaniu. */
type TimedStep = { second: number } & ({ kind: 'check'; checked: boolean } | { kind: 'edit'; name: string; quantity: string | null });

describe('lista zakupów: zmiany z kilku telefonów docierają w dowolnej kolejności', () => {
  it('wynik zależy od czasów zmian, nie od kolejności dotarcia: wygrywa najpóźniejsza, osobno odhaczenie i edycja', async () => {
    const timedSteps = fc
      .uniqueArray(fc.integer({ min: 1, max: 600 }), { minLength: 1, maxLength: 8 })
      .chain((seconds) =>
        fc.tuple(
          ...seconds.map((second) =>
            fc.oneof(
              fc.record({ second: fc.constant(second), kind: fc.constant('check' as const), checked: fc.boolean() }),
              fc.record({ second: fc.constant(second), kind: fc.constant('edit' as const), name: anyName, quantity: anyQuantity }),
            ),
          ),
        ),
      )
      .chain((steps: TimedStep[]) => fc.tuple(fc.constant(steps), fc.shuffledSubarray(steps, { minLength: steps.length })));

    await fc.assert(
      fc.asyncProperty(timedSteps, async ([steps, deliveryOrder]) => {
        clock += 3_600_000;
        const createdAt = clock;
        const id = randomUUID();
        expect((await send('POST', '/api/shopping', { id, name: 'start', quantity: null })).status).toBe(201);
        // Serwer dostaje zmiany godzinę później, więc żaden czas z telefonu nie jest „z przyszłości”.
        clock += 3_600_000;
        for (const step of deliveryOrder) {
          const changedAt = new Date(createdAt + step.second * 1000).toISOString();
          const change = step.kind === 'check' ? { checked: step.checked } : { name: step.name, quantity: step.quantity };
          expect((await send('PATCH', `/api/shopping/${id}`, { ...change, changedAt })).status).toBe(200);
        }

        const bySecond = [...steps].sort((a, b) => a.second - b.second);
        const lastCheck = bySecond.filter((step) => step.kind === 'check').at(-1);
        const lastEdit = bySecond.filter((step) => step.kind === 'edit').at(-1);
        const expected = applyShoppingChange(
          [{ id, name: 'start', quantity: null, checkedAt: null, checkedById: null, addedById: userId, createdAt: '', updatedAt: '' }],
          { kind: 'update', id, change: { ...(lastCheck ? { checked: lastCheck.checked } : {}), ...(lastEdit ? { name: lastEdit.name, quantity: lastEdit.quantity } : {}) } },
          userId,
          new Date(clock).toISOString(),
        );
        expect(visible(await serverList(), [id])).toEqual(visible(expected, [id]));
      }),
      { numRuns: 100 },
    );
  });
});
