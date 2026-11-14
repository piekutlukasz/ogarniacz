import {
  type FamilyMember,
  SHOPPING_NAME_MAX_LENGTH,
  SHOPPING_QUANTITY_MAX_LENGTH,
  type ShoppingItem,
  type ShoppingSuggestion,
  type UpdateShoppingItem,
  type User,
  matchSuggestions,
} from '@ogarniacz/shared';
import { type FormEvent, useRef, useState } from 'react';
import { Avatar, personColor } from '../../lib/Avatar';
import { ErrorNote } from '../../lib/ErrorNote';
import { useFamily } from '../tasks/api';
import { useChangeShopping, useShoppingList, useShoppingStatus, useShoppingSuggestions } from './api';

const inputClass = 'min-w-0 rounded-xl border-2 border-ink/10 bg-card px-3 py-2 text-base outline-brand';

/** Wspólna lista zakupów rodziny: do kupienia na górze, koszyk pod spodem. */
export function ShoppingScreen({ user }: { user: User }) {
  const listQuery = useShoppingList(user.id);
  const suggestions = useShoppingSuggestions(user.id).data ?? [];
  const family = useFamily().data ?? [];
  const change = useChangeShopping(user.id);
  const status = useShoppingStatus(user.id);

  const items = listQuery.data ?? [];
  const toBuy = items.filter((item) => !item.checkedAt);
  // W koszyku ostatnio odhaczone na górze, żeby było widać, co właśnie wpadło.
  const inCart = items
    .filter((item) => item.checkedAt)
    .sort((a, b) => (b.checkedAt ?? '').localeCompare(a.checkedAt ?? ''));

  // Identyfikator nadaje telefon, żeby ponowione wysłanie z kolejki nie dodało produktu drugi raz.
  const add = (name: string, quantity: string | null) => change({ kind: 'add', input: { id: crypto.randomUUID(), name, quantity } });
  const updateItem = (id: string, update: UpdateShoppingItem) => change({ kind: 'update', id, change: update });

  return (
    <div className="flex flex-col gap-4">
      <AddForm suggestions={suggestions} onList={items.map((item) => item.name)} onAdd={add} />

      <SyncNote pending={status.pending} offline={status.offline} />
      {listQuery.isError && <ErrorNote error={listQuery.error} />}
      {listQuery.isPending && <p className="text-ink/60">Wczytuję listę…</p>}

      {listQuery.isSuccess && (
        <section aria-labelledby="shopping-to-buy" className="flex flex-col gap-2">
          <h2 id="shopping-to-buy" className="font-extrabold">
            Do kupienia ({toBuy.length})
          </h2>
          {toBuy.length === 0 ? (
            <p className="rounded-2xl border-2 border-dashed border-paper-deep py-8 text-center text-ink/50">
              {inCart.length > 0 ? 'Wszystko w koszyku!' : 'Lista jest pusta.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {toBuy.map((item) => (
                <ShoppingRow key={item.id} item={item} family={family} onChange={(update) => updateItem(item.id, update)} />
              ))}
            </ul>
          )}
        </section>
      )}

      {inCart.length > 0 && (
        <section aria-labelledby="shopping-in-cart" className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 id="shopping-in-cart" className="font-extrabold text-ink/70">
              W koszyku ({inCart.length})
            </h2>
            <button
              type="button"
              onClick={() => change({ kind: 'clear', ids: inCart.map((item) => item.id) })}
              className="rounded-full bg-ink px-3.5 py-2 text-sm font-bold text-paper transition-transform active:scale-95"
            >
              Wyczyść kupione
            </button>
          </div>
          <ul className="flex flex-col gap-2">
            {inCart.map((item) => (
              <ShoppingRow key={item.id} item={item} family={family} onChange={(update) => updateItem(item.id, update)} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Informacja o pracy bez sieci. Znika, gdy wszystko jest na serwerze. */
function SyncNote({ pending, offline }: { pending: number; offline: boolean }) {
  if (pending === 0 && !offline) return null;
  const message =
    pending === 0
      ? 'Brak internetu. Widzisz listę zapisaną na telefonie, a zmiany wyślę, gdy sieć wróci.'
      : offline
        ? `Brak internetu. Niewysłane zmiany: ${pending}. Wyślę je, gdy sieć wróci.`
        : `Wysyłam zmiany: ${pending}…`;
  return (
    <p role="status" className="flex items-center gap-2 rounded-xl bg-sun/40 px-3 py-2 text-sm font-semibold text-amber-950 dark:bg-sun/15 dark:text-sun">
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full bg-current ${offline ? '' : 'animate-pulse'}`} />
      {message}
    </p>
  );
}

type AddFormProps = {
  suggestions: ShoppingSuggestion[];
  /** Nazwy, które już są na liście albo w koszyku. Nie podpowiadamy ich drugi raz. */
  onList: string[];
  onAdd: (name: string, quantity: string | null) => void;
};

function AddForm({ suggestions, onList, onAdd }: AddFormProps) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const nameInput = useRef<HTMLInputElement>(null);
  const matches = matchSuggestions(suggestions, name, onList);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return nameInput.current?.focus();
    onAdd(name, quantity || null);
    setName('');
    setQuantity('');
    // Klawiatura zostaje otwarta, żeby od razu wpisać kolejny produkt.
    nameInput.current?.focus();
  }

  function pick(suggestion: ShoppingSuggestion) {
    // Wpisana ilość ma pierwszeństwo przed tą z ostatniego zakupu.
    onAdd(suggestion.name, quantity || suggestion.quantity);
    setName('');
    setQuantity('');
  }

  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={handleSubmit} className="flex gap-2 rounded-2xl bg-card p-2.5 shadow-card">
        <input
          ref={nameInput}
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label="Nowy produkt"
          placeholder="Co kupić?"
          maxLength={SHOPPING_NAME_MAX_LENGTH}
          autoComplete="off"
          enterKeyHint="done"
          className={`${inputClass} flex-1`}
        />
        <input
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          aria-label="Ilość"
          placeholder="Ile?"
          maxLength={SHOPPING_QUANTITY_MAX_LENGTH}
          autoComplete="off"
          className={`${inputClass} w-20`}
        />
        <button
          type="submit"
          className="shrink-0 rounded-xl bg-brand px-4 font-bold text-on-brand transition-transform active:scale-95"
        >
          Dodaj
        </button>
      </form>

      {matches.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p id="shopping-suggestions" className="text-xs font-semibold text-ink/50">
            {name.trim() ? 'Podpowiedzi' : 'Często kupowane'}
          </p>
          <ul aria-labelledby="shopping-suggestions" className="flex flex-wrap gap-1.5">
            {matches.map((suggestion) => (
              <li key={suggestion.name}>
                <button
                  type="button"
                  onClick={() => pick(suggestion)}
                  aria-label={`Dodaj ${suggestion.name}`}
                  className="rounded-full bg-card px-3 py-1.5 text-sm font-semibold shadow-card transition-transform active:scale-95"
                >
                  <span aria-hidden="true" className="mr-1 text-brand">
                    +
                  </span>
                  {suggestion.name}
                  {suggestion.quantity && <span className="ml-1 text-ink/50">{suggestion.quantity}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type ShoppingRowProps = {
  item: ShoppingItem;
  family: FamilyMember[];
  onChange: (change: UpdateShoppingItem) => void;
};

function ShoppingRow({ item, family, onChange }: ShoppingRowProps) {
  const [editing, setEditing] = useState(false);
  const checked = item.checkedAt !== null;
  const adder = family.find((member) => member.id === item.addedById);

  if (editing) {
    return (
      <li className="rounded-2xl bg-card p-2.5 shadow-card">
        <EditForm
          item={item}
          onSave={(update) => {
            onChange(update);
            setEditing(false);
          }}
          onRemove={() => {
            onChange({ removed: true });
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className={`flex items-center gap-3 rounded-2xl p-1.5 pr-2 shadow-card ${checked ? 'bg-card/60' : 'bg-card'}`}>
      {/* Duże pole do kliknięcia: cały wiersz z nazwą odhacza produkt, ważne z koszykiem w drugiej ręce. */}
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl p-1.5 has-focus-visible:outline-2 has-focus-visible:outline-brand">
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onChange({ checked: !checked })}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-ink/25 text-sm font-black text-on-brand transition-colors peer-checked:border-brand peer-checked:bg-brand"
        >
          {checked ? '✓' : ''}
        </span>
        {/* Ilość płynie za nazwą jak tekst, więc długa nazwa i długa ilość zawijają się razem, bez ściskania słów. */}
        <span className="min-w-0 flex-1 break-words">
          <span className={`font-bold ${checked ? 'text-ink/45 line-through' : ''}`}>{item.name}</span>
          {item.quantity && (
            <span
              className={`ml-1.5 inline-block rounded-full bg-paper-deep px-2 py-0.5 text-sm font-semibold ${checked ? 'text-ink/40' : 'text-ink/70'}`}
            >
              {item.quantity}
            </span>
          )}
        </span>
      </label>
      {adder && (
        <span title={`Dodał(a): ${adder.name}`}>
          <Avatar size="sm" name={adder.name} color={personColor(family, adder.id)} />
        </span>
      )}
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Zmień ${item.name}`}
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink/50 active:bg-paper-deep"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3zM13.5 7.5l3 3" />
        </svg>
      </button>
    </li>
  );
}

type EditFormProps = {
  item: ShoppingItem;
  onSave: (change: UpdateShoppingItem) => void;
  onRemove: () => void;
  onCancel: () => void;
};

function EditForm({ item, onSave, onRemove, onCancel }: EditFormProps) {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity ?? '');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    onSave({ name, quantity });
  }

  return (
    <form onSubmit={handleSubmit} aria-label={`Zmiana: ${item.name}`} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label="Nazwa produktu"
          maxLength={SHOPPING_NAME_MAX_LENGTH}
          required
          className={`${inputClass} flex-1`}
        />
        <input
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          aria-label="Ilość produktu"
          placeholder="Ile?"
          maxLength={SHOPPING_QUANTITY_MAX_LENGTH}
          className={`${inputClass} w-24`}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onRemove} className="rounded-full px-3 py-2 text-sm font-bold text-brand active:bg-brand-soft">
          Usuń z listy
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="rounded-full px-3 py-2 text-sm font-semibold text-ink/60">
            Anuluj
          </button>
          <button type="submit" className="rounded-full bg-brand px-4 py-2 text-sm font-bold text-on-brand">
            Zapisz
          </button>
        </div>
      </div>
    </form>
  );
}
