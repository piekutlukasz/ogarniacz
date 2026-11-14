/**
 * Prosty magazyn klucz–wartość w IndexedDB, który przetrwa zamknięcie aplikacji.
 * Bez IndexedDB (np. zablokowane dane strony) wszystkie operacje cicho nic nie robią:
 * aplikacja działa wtedy jak dawniej, tylko bez kopii na telefonie.
 */
const DB_NAME = 'ogarniacz';
const STORE = 'kv';

let opening: Promise<IDBDatabase | undefined> | undefined;

function open(): Promise<IDBDatabase | undefined> {
  opening ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
      request.onblocked = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
  return opening;
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const request = action(db.transaction(STORE, mode).objectStore(STORE));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

export function readStored<T>(key: string): Promise<T | undefined> {
  return run<T>('readonly', (store) => store.get(key));
}

export async function writeStored(key: string, value: unknown): Promise<void> {
  await run('readwrite', (store) => store.put(value, key));
}

export async function deleteStored(key: string): Promise<void> {
  await run('readwrite', (store) => store.delete(key));
}
