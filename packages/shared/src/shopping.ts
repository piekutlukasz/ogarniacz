import { z } from 'zod';

export const SHOPPING_NAME_MAX_LENGTH = 100;
export const SHOPPING_QUANTITY_MAX_LENGTH = 30;

/** Nazwa produktu: 1–100 znaków, spacje w środku zwinięte do jednej. Krótkie nazwy jak „ser” są w porządku. */
export const shoppingNameSchema = z
  .string()
  .transform((name) => name.trim().replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(1, 'Podaj nazwę produktu')
      .max(SHOPPING_NAME_MAX_LENGTH, `Nazwa produktu może mieć najwyżej ${SHOPPING_NAME_MAX_LENGTH} znaków`),
  );

/** Ilość to wolny tekst, np. „2”, „1 kg”, „duże opakowanie”. Pusta oznacza brak ilości. */
export const shoppingQuantitySchema = z
  .string()
  .transform((quantity) => quantity.trim().replace(/\s+/g, ' '))
  .pipe(z.string().max(SHOPPING_QUANTITY_MAX_LENGTH, `Ilość może mieć najwyżej ${SHOPPING_QUANTITY_MAX_LENGTH} znaków`))
  .transform((quantity) => quantity || null)
  .nullable();

/** Klucz porównywania nazw w historii: „Mleko” i „ mleko ” to ten sam produkt. */
export function shoppingNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pl');
}

export const shoppingItemSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  quantity: z.string().nullable(),
  /** Kiedy produkt trafił do koszyka; `null`, gdy jeszcze do kupienia. */
  checkedAt: z.iso.datetime().nullable(),
  checkedById: z.uuid().nullable(),
  addedById: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ShoppingItem = z.infer<typeof shoppingItemSchema>;

export const shoppingListSchema = z.array(shoppingItemSchema);

export const createShoppingItemSchema = z.object({
  /**
   * Identyfikator nadany na telefonie. Ponowne wysłanie tego samego produktu, np. po zerwanym połączeniu,
   * zwraca istniejącą pozycję zamiast tworzyć drugą. Pominięty: nadaje serwer.
   */
  id: z.uuid().optional(),
  name: shoppingNameSchema,
  quantity: shoppingQuantitySchema.optional(),
});
export type CreateShoppingItem = z.input<typeof createShoppingItemSchema>;

export const updateShoppingItemSchema = z
  .object({
    name: shoppingNameSchema,
    quantity: shoppingQuantitySchema,
    checked: z.boolean(),
    /** Usunięcie pomyłki z listy. Usunięte bez kupienia nie trafia do podpowiedzi. Wygrywa z każdą inną zmianą. */
    removed: z.literal(true),
  })
  .partial()
  .extend({
    /**
     * Kiedy zmiana powstała na telefonie. Zmiana zrobiona bez sieci dociera później, a starsza nie nadpisuje
     * nowszej: osobno odhaczenie, osobno nazwa z ilością. Pominięty: teraz. Czas z przyszłości serwer przycina.
     */
    changedAt: z.iso.datetime().optional(),
  })
  .refine((input) => Object.keys(input).some((key) => key !== 'changedAt'), {
    message: 'Podaj co najmniej jedno pole do zmiany',
  });
export type UpdateShoppingItem = z.input<typeof updateShoppingItemSchema>;

/**
 * Czyszczenie kupionych. Telefon wysyła produkty, które widzi w koszyku, więc nie zniknie coś,
 * co ktoś odhaczył chwilę wcześniej na innym telefonie. Nieodhaczone z listy zostają.
 */
export const clearShoppingSchema = z.object({ ids: z.array(z.uuid()).min(1).max(500) });
export type ClearShopping = z.infer<typeof clearShoppingSchema>;

export const shoppingSuggestionSchema = z.object({
  /** Pisownia z ostatniego zakupu. */
  name: z.string(),
  /** Ilość z ostatniego zakupu, do podstawienia razem z nazwą. */
  quantity: z.string().nullable(),
  /** Ile razy produkt został kupiony. */
  count: z.number().int().positive(),
  lastBoughtAt: z.iso.datetime(),
});
export type ShoppingSuggestion = z.infer<typeof shoppingSuggestionSchema>;

export const shoppingSuggestionListSchema = z.array(shoppingSuggestionSchema);

/**
 * Podpowiedzi pasujące do wpisanego tekstu: najpierw nazwy zaczynające się od niego, potem zawierające go,
 * w obu grupach od najczęściej kupowanych. Pomija produkty, które już czekają na liście.
 */
export function matchSuggestions(
  suggestions: ShoppingSuggestion[],
  query: string,
  onList: Iterable<string>,
  limit = 6,
): ShoppingSuggestion[] {
  const pending = new Set([...onList].map(shoppingNameKey));
  const key = shoppingNameKey(query);
  const available = suggestions.filter((suggestion) => !pending.has(shoppingNameKey(suggestion.name)));
  if (!key) return available.slice(0, limit);

  const starts: ShoppingSuggestion[] = [];
  const contains: ShoppingSuggestion[] = [];
  for (const suggestion of available) {
    const name = shoppingNameKey(suggestion.name);
    if (name === key) continue;
    if (name.startsWith(key)) starts.push(suggestion);
    else if (name.includes(key)) contains.push(suggestion);
  }
  return [...starts, ...contains].slice(0, limit);
}

/** Zmiana listy zapisywana w kolejce na telefonie i wysyłana, gdy jest sieć. */
export type ShoppingChange =
  | { kind: 'add'; input: { id: string; name: string; quantity?: string | null } }
  | { kind: 'update'; id: string; change: UpdateShoppingItem }
  | { kind: 'clear'; ids: string[] };

function tidy(value: string | null | undefined): string | null {
  const text = value?.trim().replace(/\s+/g, ' ');
  return text ? text : null;
}

/**
 * Lista po zmianie, tak jak zobaczy ją serwer. Telefon pokazuje dzięki temu zmiany od razu,
 * także te, które czekają w kolejce na sieć. `at` to czas zmiany w ISO.
 */
export function applyShoppingChange(items: ShoppingItem[], change: ShoppingChange, userId: string, at: string): ShoppingItem[] {
  switch (change.kind) {
    case 'add':
      if (items.some((item) => item.id === change.input.id)) return items;
      return [
        ...items,
        {
          id: change.input.id,
          name: tidy(change.input.name) ?? change.input.name,
          quantity: tidy(change.input.quantity),
          checkedAt: null,
          checkedById: null,
          addedById: userId,
          createdAt: at,
          updatedAt: at,
        },
      ];
    case 'update': {
      const { change: update } = change;
      if (update.removed) return items.filter((item) => item.id !== change.id);
      return items.map((item) => {
        if (item.id !== change.id) return item;
        const next = { ...item, updatedAt: at };
        if (update.name !== undefined) next.name = tidy(update.name) ?? item.name;
        if (update.quantity !== undefined) next.quantity = tidy(update.quantity);
        if (update.checked === true && !item.checkedAt) Object.assign(next, { checkedAt: at, checkedById: userId });
        if (update.checked === false) Object.assign(next, { checkedAt: null, checkedById: null });
        return next;
      });
    }
    case 'clear': {
      const ids = new Set(change.ids);
      return items.filter((item) => !(ids.has(item.id) && item.checkedAt));
    }
  }
}
