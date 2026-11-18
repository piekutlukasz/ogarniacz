import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type ShoppingChange,
  type ShoppingItem,
  type ShoppingSuggestion,
  applyShoppingChange,
  matchSuggestions,
  shoppingNameKey,
  shoppingNameSchema,
  shoppingQuantitySchema,
} from './shopping';

const USER = '00000000-0000-4000-8000-000000000001';
const AT = '2026-11-18T10:00:00.000Z';
/** Mała pula identyfikatorów, żeby zmiany często trafiały w te same produkty. */
const IDS = Array.from({ length: 5 }, (_, index) => `00000000-0000-4000-8000-00000000010${index}`);

const anyId = fc.constantFrom(...IDS);
const anyText = fc.string({ maxLength: 12 });

const anyChange: fc.Arbitrary<ShoppingChange> = fc.oneof(
  fc.record({ kind: fc.constant('add' as const), input: fc.record({ id: anyId, name: anyText, quantity: fc.option(anyText) }) }),
  fc.record({
    kind: fc.constant('update' as const),
    id: anyId,
    change: fc.oneof(
      fc.record({ checked: fc.boolean() }),
      fc.record({ name: anyText, quantity: fc.option(anyText) }),
      fc.constant({ removed: true as const }),
    ),
  }),
  fc.record({ kind: fc.constant('clear' as const), ids: fc.uniqueArray(anyId, { minLength: 1 }) }),
);

function applyAll(changes: ShoppingChange[], items: ShoppingItem[] = []): ShoppingItem[] {
  return changes.reduce((list, change) => applyShoppingChange(list, change, USER, AT), items);
}

/** Stan bez znaczników czasu: zmiana powtórzona później różni się tylko nimi. */
const withoutTimes = (items: ShoppingItem[]) => items.map(({ updatedAt: _updatedAt, ...rest }) => rest);

describe('applyShoppingChange', () => {
  it('powtórzona zmiana (ponowna wysyłka z kolejki) niczego nie zmienia', () => {
    fc.assert(
      fc.property(fc.array(anyChange, { maxLength: 20 }), anyChange, (history, change) => {
        const before = applyAll(history);
        const once = applyShoppingChange(before, change, USER, AT);
        const twice = applyShoppingChange(once, change, USER, AT);
        expect(withoutTimes(twice)).toEqual(withoutTimes(once));
      }),
    );
  });

  it('usunięcie wygrywa z każdą wcześniejszą zmianą', () => {
    fc.assert(
      fc.property(fc.array(anyChange, { maxLength: 20 }), anyId, (history, id) => {
        const after = applyAll([...history, { kind: 'update', id, change: { removed: true } }]);
        expect(after.some((item) => item.id === id)).toBe(false);
      }),
    );
  });

  it('czyszczenie zabiera tylko odhaczone z podanej listy', () => {
    fc.assert(
      fc.property(fc.array(anyChange, { maxLength: 20 }), fc.uniqueArray(anyId, { minLength: 1 }), (history, ids) => {
        const before = applyAll(history);
        const after = applyShoppingChange(before, { kind: 'clear', ids }, USER, AT);
        const expected = before.filter((item) => !(ids.includes(item.id) && item.checkedAt));
        expect(after).toEqual(expected);
      }),
    );
  });

  it('nie zmienia listy wejściowej ani innych produktów', () => {
    fc.assert(
      fc.property(fc.array(anyChange, { maxLength: 20 }), anyChange, (history, change) => {
        const before = applyAll(history);
        const snapshot = structuredClone(before);
        const after = applyShoppingChange(before, change, USER, AT);
        expect(before).toEqual(snapshot);
        const touched = change.kind === 'add' ? change.input.id : change.kind === 'update' ? change.id : undefined;
        if (touched) {
          expect(after.filter((item) => item.id !== touched)).toEqual(before.filter((item) => item.id !== touched));
        }
      }),
    );
  });

  it('porządkuje nazwę i ilość tak jak schematy serwera', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 30 }), fc.string({ maxLength: 20 }), (name, quantity) => {
        const serverName = shoppingNameSchema.safeParse(name);
        const serverQuantity = shoppingQuantitySchema.parse(quantity);
        const [item] = applyAll([{ kind: 'add', input: { id: IDS[0]!, name, quantity } }]);
        // Pustą nazwę serwer odrzuca, a telefon nie wysyła jej z formularza; poza tym wynik ma być ten sam.
        if (serverName.success) expect(item!.name).toBe(serverName.data);
        expect(item!.quantity).toBe(serverQuantity);
      }),
    );
  });

  it('ponowne odhaczenie zostawia pierwszy czas i osobę', () => {
    const [added] = applyAll([{ kind: 'add', input: { id: IDS[0]!, name: 'mleko' } }]);
    const checked = applyShoppingChange([added!], { kind: 'update', id: IDS[0]!, change: { checked: true } }, USER, AT);
    const again = applyShoppingChange(checked, { kind: 'update', id: IDS[0]!, change: { checked: true } }, IDS[1]!, '2026-11-18T11:00:00.000Z');
    expect(again[0]!.checkedAt).toBe(AT);
    expect(again[0]!.checkedById).toBe(USER);
  });
});

describe('shoppingNameKey', () => {
  it('nie rozróżnia wielkości liter ani odstępów, także w polskich znakach', () => {
    expect(shoppingNameKey('  Śmietana   18% ')).toBe(shoppingNameKey('śmietana 18%'));
    expect(shoppingNameKey('ŻUREK')).toBe('żurek');
  });
});

describe('matchSuggestions', () => {
  const suggestion = (name: string, count = 1): ShoppingSuggestion => ({ name, quantity: null, count, lastBoughtAt: AT });
  const all = [suggestion('mleko', 9), suggestion('masło', 5), suggestion('mleko owsiane', 3), suggestion('jogurt mleczny', 2)];

  it('najpierw zaczynające się od tekstu, potem zawierające go', () => {
    expect(matchSuggestions(all, 'mle', []).map((item) => item.name)).toEqual(['mleko', 'mleko owsiane', 'jogurt mleczny']);
  });

  it('pomija produkty już na liście i dokładnie wpisaną nazwę', () => {
    expect(matchSuggestions(all, 'mleko', ['Mleko owsiane']).map((item) => item.name)).toEqual([]);
    expect(matchSuggestions(all, '', [' MASŁO ']).map((item) => item.name)).toEqual(['mleko', 'mleko owsiane', 'jogurt mleczny']);
  });

  it('nie zwraca więcej niż limit', () => {
    expect(matchSuggestions(all, '', [], 2)).toHaveLength(2);
  });
});
