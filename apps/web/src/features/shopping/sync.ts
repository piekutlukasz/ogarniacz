import {
  type ShoppingChange,
  type ShoppingItem,
  type ShoppingSuggestion,
  applyShoppingChange,
  shoppingItemSchema,
  shoppingListSchema,
  shoppingSuggestionListSchema,
} from '@ogarniacz/shared';
import { ApiError, UnauthorizedError, jsonBody, request, requestNoContent } from '../../lib/http';
import { deleteStored, readStored, writeStored } from '../../lib/storage';

/**
 * Lista zakupów działająca bez sieci (PROJEKT.md, rozdział 8).
 *
 * Telefon trzyma w IndexedDB ostatnią listę z serwera i kolejkę zmian. Ekran pokazuje listę z serwera
 * z nałożonymi zmianami z kolejki, więc wszystko widać od razu, także w trybie samolotowym i po
 * zamknięciu aplikacji. Kolejka idzie na serwer po kolei: przy starcie, po powrocie do aplikacji,
 * po odzyskaniu sieci i zaraz po każdej zmianie. Background Sync nie wchodzi w grę, bo nie ma go w Safari.
 *
 * Powtórzenie zmiany jest bezpieczne: dodanie niesie identyfikator z telefonu, odhaczenie i edycja
 * czas z telefonu, a czyszczenie listę produktów. Dlatego zmiana, której odpowiedź zginęła po drodze,
 * po prostu idzie jeszcze raz.
 */

const STORAGE_KEY = 'shopping';

type QueuedChange = { change: ShoppingChange; at: string };

type Stored = {
  /** Czyja to kopia. Po zalogowaniu innej osoby kopia i kolejka poprzedniej przepadają. */
  userId: string;
  /** Ostatnia lista z serwera; `null`, dopóki telefon żadnej nie pobrał. */
  items: ShoppingItem[] | null;
  suggestions: ShoppingSuggestion[];
  queue: QueuedChange[];
};

export type SyncStatus = {
  /** Zmiany zapisane na telefonie i czekające na wysłanie. Liczone po zapisie, więc przetrwają zamknięcie aplikacji. */
  pending: number;
  /** Ostatnia próba połączenia z serwerem się nie udała. */
  offline: boolean;
};

/** Brak sieci albo chwilowa awaria serwera: zmianę trzeba wysłać później. Inne błędy są ostateczne. */
function isTemporary(error: unknown): boolean {
  if (error instanceof UnauthorizedError) return false;
  if (error instanceof ApiError) return error.status >= 500 || error.status === 408 || error.status === 429;
  return true;
}

function send(change: ShoppingChange): Promise<unknown> {
  switch (change.kind) {
    case 'add':
      return request(shoppingItemSchema, '/api/shopping', jsonBody('POST', change.input));
    case 'update':
      return request(shoppingItemSchema, `/api/shopping/${change.id}`, jsonBody('PATCH', change.change));
    case 'clear':
      return requestNoContent('/api/shopping/clear', jsonBody('POST', { ids: change.ids }));
  }
}

class ShoppingSync {
  private stored: Stored;
  private readonly loaded: Promise<void>;
  private flushing: Promise<boolean> | undefined;
  /** Długość kolejki w ostatnim zakończonym zapisie do IndexedDB. */
  private savedPending = 0;
  /** Ile zmian zeszło z kolejki. Pozwala rozpoznać listę pobraną, zanim serwer dostał zmianę. */
  private sentCount = 0;
  private status: SyncStatus = { pending: 0, offline: false };
  private readonly listeners = new Set<() => void>();

  constructor(readonly userId: string) {
    this.stored = { userId, items: null, suggestions: [], queue: [] };
    this.loaded = readStored<Stored>(STORAGE_KEY).then((saved) => {
      // Zmiany zrobione w trakcie wczytywania trafiły już do pustej kolejki, więc idą za zapisanymi.
      if (saved?.userId === userId) {
        this.stored = { ...saved, queue: [...saved.queue, ...this.stored.queue] };
        this.savedPending = saved.queue.length;
      }
      this.updateStatus({});
    });
  }

  /** Lista do pokazania: ostatnia z serwera z nałożonymi zmianami z kolejki. */
  view(): ShoppingItem[] {
    return this.stored.queue.reduce(
      (items, { change, at }) => applyShoppingChange(items, change, this.userId, at),
      this.stored.items ?? [],
    );
  }

  /** Zapisuje zmianę w kolejce na telefonie. Wysyła ją `flush`. */
  enqueue(change: ShoppingChange): void {
    const at = new Date().toISOString();
    // Odhaczenie i edycja niosą czas z telefonu, żeby spóźniona zmiana nie nadpisała nowszej.
    const queued = change.kind === 'update' ? { ...change, change: { ...change.change, changedAt: at } } : change;
    this.stored.queue.push({ change: queued, at });
    this.save();
    this.updateStatus({});
  }

  /**
   * Wysyła kolejkę po kolei. Przy braku sieci przerywa i zostawia resztę na później.
   * Zmianę odrzuconą przez serwer, np. odhaczenie produktu, który ktoś już wyczyścił, pomija.
   * Zwraca `true`, gdy coś zostało wysłane. Wygaśnięcie sesji przekazuje dalej, a kolejka czeka na logowanie.
   */
  flush(): Promise<boolean> {
    this.flushing ??= this.runFlush().finally(() => {
      this.flushing = undefined;
    });
    return this.flushing;
  }

  private async runFlush(): Promise<boolean> {
    await this.loaded;
    let sent = false;
    for (let next = this.stored.queue[0]; next; next = this.stored.queue[0]) {
      try {
        await send(next.change);
        sent = true;
        this.updateStatus({ offline: false });
      } catch (error) {
        if (error instanceof UnauthorizedError) throw error;
        if (isTemporary(error)) {
          this.updateStatus({ offline: true });
          return sent;
        }
        // Ostateczna odmowa serwera: ponawianie nic nie da, a zablokowałoby kolejne zmiany.
      }
      this.stored.queue.shift();
      this.sentCount += 1;
      this.save();
      this.updateStatus({});
    }
    return sent;
  }

  /** Lista z serwera, a bez sieci ostatnia zapisana na telefonie. Najpierw wysyła kolejkę. */
  async fetchList(): Promise<ShoppingItem[]> {
    await this.flush();
    try {
      // Zmiana wysłana w trakcie pobierania mogła do listy nie zdążyć, a z kolejki już zeszła.
      // Taka lista cofnęłaby ją na ekranie do następnego odświeżenia, więc pobieramy jeszcze raz.
      let items: ShoppingItem[];
      for (let attempt = 1; ; attempt += 1) {
        const sentBefore = this.sentCount;
        items = await request(shoppingListSchema, '/api/shopping');
        if (this.sentCount === sentBefore || attempt === 3) break;
      }
      this.stored.items = items;
      this.save();
      this.updateStatus({ offline: false });
    } catch (error) {
      if (!isTemporary(error)) throw error;
      this.updateStatus({ offline: true });
    }
    return this.view();
  }

  async fetchSuggestions(): Promise<ShoppingSuggestion[]> {
    await this.loaded;
    try {
      this.stored.suggestions = await request(shoppingSuggestionListSchema, '/api/shopping/suggestions');
      this.save();
    } catch (error) {
      if (!isTemporary(error)) throw error;
    }
    return this.stored.suggestions;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getStatus = () => this.status;

  private updateStatus(change: Partial<SyncStatus>) {
    // Wysłana zmiana znika z licznika od razu, nowa pojawia się dopiero po zapisie na telefonie.
    const next = { ...this.status, ...change, pending: Math.min(this.stored.queue.length, this.savedPending) };
    if (next.pending === this.status.pending && next.offline === this.status.offline) return;
    this.status = next;
    for (const listener of this.listeners) listener();
  }

  private save() {
    // Zapis po wczytaniu, żeby nie nadpisać kolejki, której jeszcze nie przeczytaliśmy.
    void this.loaded.then(async () => {
      const length = this.stored.queue.length;
      await writeStored(STORAGE_KEY, this.stored);
      this.savedPending = length;
      this.updateStatus({});
    });
  }
}

let current: ShoppingSync | undefined;

/** Synchronizacja listy dla zalogowanej osoby. Jedna na całą aplikację, wspólna dla „Zakupów” i „Dziś”. */
export function shoppingSync(userId: string): ShoppingSync {
  if (current?.userId !== userId) current = new ShoppingSync(userId);
  return current;
}

/** Przy wylogowaniu: kopia listy i niewysłane zmiany nie zostają na telefonie. */
export async function forgetShopping(): Promise<void> {
  current = undefined;
  await deleteStored(STORAGE_KEY);
}
