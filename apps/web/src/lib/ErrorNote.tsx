import { ApiError } from './http';

/** Komunikat z serwera, np. o braku uprawnień, a gdy go nie ma, ogólna prośba o sprawdzenie sieci. */
export function ErrorNote({ error }: { error?: Error | null }) {
  const message =
    error instanceof ApiError && error.status < 500 ? error.message : 'Coś poszło nie tak. Sprawdź połączenie i spróbuj ponownie.';
  return (
    <p role="alert" className="rounded-xl bg-red-100 px-3 py-2 text-sm font-semibold text-red-900 dark:bg-red-950 dark:text-red-200">
      {message}
    </p>
  );
}
