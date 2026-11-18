import { randomUUID } from 'node:crypto';
import { validate } from '../validate';
import {
  type ShoppingItem,
  type ShoppingSuggestion,
  clearShoppingSchema,
  createShoppingItemSchema,
  shoppingNameKey,
  updateShoppingItemSchema,
} from '@ogarniacz/shared';
import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppEnv } from '../auth/middleware';
import type { Db } from '../db/client';
import { shoppingItems } from '../db/schema';

type ShoppingRow = typeof shoppingItems.$inferSelect;

/** Tyle podpowiedzi wystarczy na każdą literę, a lista mieści się w pamięci telefonu. */
const SUGGESTION_LIMIT = 300;

function toItem(row: ShoppingRow): ShoppingItem {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    checkedAt: row.checkedAt?.toISOString() ?? null,
    checkedById: row.checkedById,
    addedById: row.addedById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Wspólna lista zakupów rodziny. Dodaje, odhacza i czyści każdy, także dziecko (PROJEKT.md, rozdział 6).
 * Nic nie jest kasowane: wyczyszczone i usunięte pozycje dostają `archived_at`.
 */
export function shoppingRoutes(db: Db, now: () => Date) {
  const find = (id: string) => db.select().from(shoppingItems).where(eq(shoppingItems.id, id)).get();

  return new Hono<AppEnv>()
    .get('/', (c) => {
      const rows = db
        .select()
        .from(shoppingItems)
        .where(isNull(shoppingItems.archivedAt))
        .orderBy(asc(shoppingItems.createdAt))
        .all();
      return c.json(rows.map(toItem));
    })
    .get('/suggestions', (c) => {
      // Podpowiedzi to produkty kiedyś kupione, czyli odhaczone. Usunięte pomyłki się nie liczą.
      const rows = db
        .select({
          nameKey: shoppingItems.nameKey,
          name: shoppingItems.name,
          quantity: shoppingItems.quantity,
          checkedAt: shoppingItems.checkedAt,
        })
        .from(shoppingItems)
        .where(isNotNull(shoppingItems.checkedAt))
        .orderBy(desc(shoppingItems.checkedAt))
        .all();

      const byKey = new Map<string, ShoppingSuggestion>();
      for (const row of rows) {
        const known = byKey.get(row.nameKey);
        if (known) {
          known.count += 1;
        } else if (row.checkedAt) {
          // Wiersze idą od najnowszego, więc pierwszy daje aktualną pisownię i ilość.
          byKey.set(row.nameKey, {
            name: row.name,
            quantity: row.quantity,
            count: 1,
            lastBoughtAt: row.checkedAt.toISOString(),
          });
        }
      }
      const suggestions = [...byKey.values()]
        .sort((a, b) => b.count - a.count || b.lastBoughtAt.localeCompare(a.lastBoughtAt))
        .slice(0, SUGGESTION_LIMIT);
      return c.json(suggestions);
    })
    .post('/', validate('json', createShoppingItemSchema), (c) => {
      const input = c.req.valid('json');
      const user = c.get('user');

      if (input.id) {
        const existing = find(input.id);
        // To samo dodanie wysłane drugi raz: oddajemy pozycję bez zmian.
        if (existing) return c.json(toItem(existing), 200);
      }

      const at = now();
      const row = db
        .insert(shoppingItems)
        .values({
          id: input.id ?? randomUUID(),
          name: input.name,
          nameKey: shoppingNameKey(input.name),
          quantity: input.quantity ?? null,
          addedById: user.id,
          createdAt: at,
          updatedAt: at,
        })
        .returning()
        .get();
      return c.json(toItem(row), 201);
    })
    .patch('/:id', validate('json', updateShoppingItemSchema), (c) => {
      const change = c.req.valid('json');
      const user = c.get('user');
      const existing = find(c.req.param('id'));
      if (!existing || existing.archivedAt) {
        return c.json({ error: 'Tego produktu nie ma już na liście' }, 404);
      }

      const at = now();
      // Zmiana zrobiona bez sieci ma czas z telefonu. Zegar z przyszłości przycinamy, żeby nie zablokował późniejszych zmian.
      const requestedAt = change.changedAt ? new Date(change.changedAt) : at;
      const changedAt = requestedAt > at ? at : requestedAt;
      // Starsza zmiana nie nadpisuje nowszej. Odhaczenie i edycja mają osobne czasy, więc nie kolidują.
      const checkWins = change.checked !== undefined && changedAt >= (existing.checkedChangedAt ?? existing.createdAt);
      const editWins =
        (change.name !== undefined || change.quantity !== undefined) && changedAt >= (existing.editedAt ?? existing.createdAt);

      const checked = !checkWins
        ? {}
        : change.checked
          ? // Ponowne odhaczenie nie zmienia czasu ani osoby w koszyku, ale przesuwa czas ostatniej zmiany odhaczenia:
            // inaczej starsze odznaczenie z innego telefonu, które dotrze później, cofnęłoby nowsze odhaczenie.
            // Powtórzone żądanie ma ten sam `changedAt`, więc niczego nie zmienia.
            {
              checkedAt: existing.checkedAt ?? changedAt,
              checkedById: existing.checkedById ?? user.id,
              checkedChangedAt: changedAt,
            }
          : { checkedAt: null, checkedById: null, checkedChangedAt: changedAt };
      const edited = !editWins
        ? {}
        : {
            ...(change.name === undefined ? {} : { name: change.name, nameKey: shoppingNameKey(change.name) }),
            ...(change.quantity === undefined ? {} : { quantity: change.quantity }),
            editedAt: changedAt,
          };
      if (!checkWins && !editWins && !change.removed) {
        return c.json(toItem(existing));
      }

      const row = db
        .update(shoppingItems)
        .set({
          ...edited,
          ...checked,
          // Usunięcie wygrywa zawsze: pomyłka ma zniknąć, nawet gdy ktoś w międzyczasie ją odhaczył.
          ...(change.removed ? { archivedAt: at } : {}),
          updatedAt: at,
        })
        .where(eq(shoppingItems.id, existing.id))
        .returning()
        .get();
      return c.json(toItem(row));
    })
    .post('/clear', validate('json', clearShoppingSchema), (c) => {
      const { ids } = c.req.valid('json');
      const at = now();
      const cleared = db
        .update(shoppingItems)
        .set({ archivedAt: at, updatedAt: at })
        .where(and(inArray(shoppingItems.id, ids), isNotNull(shoppingItems.checkedAt), isNull(shoppingItems.archivedAt)))
        .returning({ id: shoppingItems.id })
        .all();
      return c.json({ cleared: cleared.length });
    });
}
