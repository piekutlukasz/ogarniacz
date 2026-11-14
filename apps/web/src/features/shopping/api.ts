import type { ShoppingChange, ShoppingItem } from '@ogarniacz/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { type SyncStatus, shoppingSync } from './sync';

export const SHOPPING_KEY = ['shopping'];
export const SHOPPING_LIST_KEY = [...SHOPPING_KEY, 'list'];
export const SHOPPING_SUGGESTIONS_KEY = [...SHOPPING_KEY, 'suggestions'];

/** Co tyle lista pobiera zmiany od innych osób, gdy aplikacja jest na ekranie. */
const REFRESH_MS = 10_000;

/**
 * Wspólna lista rodziny. Odświeża się w tle i po powrocie do aplikacji, żeby było widać zmiany z innych telefonów.
 * Bez sieci pokazuje kopię z telefonu, dlatego zapytanie działa też wtedy, gdy przeglądarka zgłasza brak sieci.
 */
export function useShoppingList(userId: string) {
  return useQuery({
    queryKey: SHOPPING_LIST_KEY,
    queryFn: () => shoppingSync(userId).fetchList(),
    networkMode: 'always',
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: 'always',
  });
}

/** Historia zmienia się tylko przy czyszczeniu koszyka, więc nie odświeżamy jej w tle. */
export function useShoppingSuggestions(userId: string) {
  return useQuery({
    queryKey: SHOPPING_SUGGESTIONS_KEY,
    queryFn: () => shoppingSync(userId).fetchSuggestions(),
    networkMode: 'always',
    staleTime: 5 * 60 * 1000,
  });
}

/** Ile zmian czeka na wysłanie i czy ostatnio zabrakło sieci. */
export function useShoppingStatus(userId: string): SyncStatus {
  const sync = shoppingSync(userId);
  return useSyncExternalStore(sync.subscribe, sync.getStatus);
}

/**
 * Zmiany listy: dodanie, odhaczenie, edycja, usunięcie i czyszczenie koszyka. Zmiana trafia do kolejki
 * na telefonie i od razu na ekran, a na serwer, gdy tylko jest sieć.
 */
export function useChangeShopping(userId: string) {
  const queryClient = useQueryClient();
  return (change: ShoppingChange) => {
    const sync = shoppingSync(userId);
    sync.enqueue(change);
    queryClient.setQueryData<ShoppingItem[]>(SHOPPING_LIST_KEY, sync.view());
    void sync
      .flush()
      .then((sent) => {
        if (!sent) return;
        // Po wysłaniu pobieramy listę z serwera, a po wyczyszczeniu koszyka także nowe podpowiedzi.
        void queryClient.invalidateQueries({ queryKey: SHOPPING_LIST_KEY });
        if (change.kind === 'clear') void queryClient.invalidateQueries({ queryKey: SHOPPING_SUGGESTIONS_KEY });
      })
      // Wygasła sesja: odświeżenie dostanie 401 i aplikacja pokaże logowanie. Kolejka czeka na nie na telefonie.
      .catch(() => queryClient.invalidateQueries({ queryKey: SHOPPING_LIST_KEY }));
  };
}

/**
 * Wysyła kolejkę przy starcie aplikacji, po powrocie do niej i po odzyskaniu sieci.
 * Działa na każdym ekranie, nie tylko w „Zakupach”.
 */
export function useShoppingAutoSync(userId: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const sync = shoppingSync(userId);
    const flush = () => {
      void sync
        .flush()
        .then((sent) => {
          if (sent) void queryClient.invalidateQueries({ queryKey: SHOPPING_KEY });
        })
        .catch(() => queryClient.invalidateQueries({ queryKey: SHOPPING_LIST_KEY }));
    };
    const onVisible = () => document.visibilityState === 'visible' && flush();

    flush();
    window.addEventListener('online', flush);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', flush);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, queryClient]);
}
