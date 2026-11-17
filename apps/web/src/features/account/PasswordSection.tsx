import { type User, passwordProblem } from '@ogarniacz/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { ErrorNote } from '../../lib/ErrorNote';
import { useDemoInfo } from '../demo/api';
import { useChangePassword, useLogoutOthers } from './api';

const inputClass = 'min-w-0 rounded-xl border-2 border-ink/10 bg-card px-3 py-2 text-base outline-brand';
const primaryButton =
  'rounded-full bg-brand px-4 py-2 text-sm font-bold text-on-brand shadow-card transition-transform active:scale-95 disabled:opacity-60';
const quietButton = 'rounded-full bg-paper-deep px-3.5 py-2 text-sm font-bold text-ink/75 transition-transform active:scale-95 disabled:opacity-60';
const statusClass = 'rounded-xl bg-sun/40 px-3 py-2 text-sm font-semibold text-amber-900 dark:bg-sun/15 dark:text-sun';

function devices(count: number): string {
  if (count === 1) return '1 urządzenie';
  const lastTwo = count % 100;
  const last = count % 10;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? `${count} urządzenia` : `${count} urządzeń`;
}

/**
 * Podstrona „Hasło i urządzenia”, dla każdego. Zmiana hasła wymaga obecnego, a obie operacje zostawiają
 * zalogowane to urządzenie i wylogowują pozostałe, np. zgubiony telefon. W demo sekcji nie ma, bo konta są wspólne.
 */
export function PasswordSection({ user, open }: { user: User; open: boolean }) {
  const demo = useDemoInfo();
  const [changing, setChanging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const logoutOthers = useLogoutOthers();

  // Zamknięte ustawienia chowają formularz i komunikaty, żeby hasła nie czekały w polach.
  useEffect(() => {
    if (open) return;
    setChanging(false);
    setMessage(null);
    logoutOthers.reset();
  }, [open, logoutOthers.reset]);

  if (demo.data) return null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">To urządzenie zostaje zalogowane, pozostałe trzeba będzie zalogować od nowa.</p>

      {message && (
        <p role="status" className={statusClass}>
          {message}
        </p>
      )}

      {changing ? (
        <ChangePasswordForm
          user={user}
          onCancel={() => setChanging(false)}
          onChanged={() => {
            setChanging(false);
            setMessage('Hasło zmienione. Pozostałe urządzenia zostały wylogowane.');
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setMessage(null);
              setChanging(true);
            }}
            className={quietButton}
          >
            Zmień hasło
          </button>
          <button
            type="button"
            disabled={logoutOthers.isPending}
            onClick={() => {
              setMessage(null);
              logoutOthers.mutate(undefined, {
                onSuccess: (count) =>
                  setMessage(count === 0 ? 'Nie było innych zalogowanych urządzeń.' : `Wylogowano: ${devices(count)}.`),
              });
            }}
            className={quietButton}
          >
            Wyloguj inne urządzenia
          </button>
        </div>
      )}
      {logoutOthers.isError && <ErrorNote error={logoutOthers.error} />}
    </div>
  );
}

function ChangePasswordForm({ user, onCancel, onChanged }: { user: User; onCancel: () => void; onChanged: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const change = useChangePassword();

  function submit(event: FormEvent) {
    event.preventDefault();
    const found = passwordProblem(next, user) ?? (next !== repeat ? 'Nowe hasła się różnią' : null);
    setProblem(found);
    // Jeden komunikat naraz: nowy problem zastępuje błąd z poprzedniej próby.
    change.reset();
    if (found) return;
    change.mutate({ current, next }, { onSuccess: onChanged });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-2xl bg-paper-deep p-3">
      {/* Ukryty login podpowiada menedżerowi haseł, dla którego konta zapisać nowe hasło. */}
      <input type="text" name="username" autoComplete="username" value={user.login} readOnly hidden />
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Obecne hasło
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          required
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Nowe hasło
        <input
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          required
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Powtórz nowe hasło
        <input
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(event) => setRepeat(event.target.value)}
          required
          className={inputClass}
        />
      </label>
      <p className="text-sm text-ink-muted">Co najmniej 8 znaków, bez loginu i imienia.</p>
      {problem && (
        <p role="alert" className="rounded-xl bg-red-100 px-3 py-2 text-sm font-semibold text-red-900 dark:bg-red-950 dark:text-red-200">
          {problem}
        </p>
      )}
      {change.isError && <ErrorNote error={change.error} />}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={quietButton}>
          Anuluj
        </button>
        <button type="submit" disabled={change.isPending} className={primaryButton}>
          Zapisz hasło
        </button>
      </div>
    </form>
  );
}
