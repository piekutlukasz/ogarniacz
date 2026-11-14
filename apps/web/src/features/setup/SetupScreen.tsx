import { type User, passwordProblem } from '@ogarniacz/shared';
import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { ApiError } from '../../lib/http';
import { completeSetup } from './api';

const fieldClass = 'rounded-xl border-2 border-transparent bg-paper px-3 py-3 text-base font-normal outline-brand';

function Alert({ children }: { children: string }) {
  return (
    <p role="alert" className="rounded-xl bg-red-100 px-3 py-2 text-sm font-semibold text-red-900 dark:bg-red-950 dark:text-red-200">
      {children}
    </p>
  );
}

/**
 * Kreator pierwszego uruchomienia zamiast logowania, gdy w bazie nie ma żadnego konta (docs/plany/KONTA.md, krok 3).
 * Zakłada pierwszego rodzica; kod potwierdza, że kreator przechodzi osoba z dostępem do logu serwera.
 */
export function SetupScreen({ onDone }: { onDone: (user: User) => void }) {
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const setup = useMutation({ mutationFn: completeSetup, onSuccess: onDone });

  function submit(event: FormEvent) {
    event.preventDefault();
    const found = passwordProblem(password, { login, name }) ?? (password !== repeat ? 'Hasła się różnią' : null);
    setProblem(found);
    setup.reset();
    if (!found) setup.mutate({ code, name, login, password });
  }

  const failure = setup.error
    ? setup.error instanceof ApiError
      ? setup.error.message
      : 'Nie udało się połączyć z serwerem. Sprawdź internet i spróbuj ponownie.'
    : null;

  return (
    <form onSubmit={submit} className="mx-auto mt-6 flex w-full max-w-sm flex-col gap-4 rounded-3xl bg-card p-6 shadow-lift">
      <div>
        <h2 className="text-2xl leading-tight font-extrabold">Pierwsze uruchomienie</h2>
        <p className="text-ink/60">Załóż konto rodzica. Pozostałe osoby zaprosisz zaraz potem, w ustawieniach, w „Rodzinie”.</p>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Imię
        <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="given-name" required maxLength={40} className={fieldClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Login
        <input
          name="username"
          value={login}
          onChange={(event) => setLogin(event.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Hasło
        <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required className={fieldClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Powtórz hasło
        <input type="password" autoComplete="new-password" value={repeat} onChange={(event) => setRepeat(event.target.value)} required className={fieldClass} />
      </label>
      <p className="text-sm text-ink/55">Login: małe litery bez polskich znaków. Hasło: co najmniej 8 znaków, bez loginu i imienia.</p>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Kod pierwszego uruchomienia
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="one-time-code"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          required
          placeholder="ABCD-2345"
          className={`${fieldClass} font-mono tracking-wider`}
        />
      </label>
      <p className="text-sm text-ink/55">Kod jest w logu serwera, w linii „kod pierwszego uruchomienia”. Zmienia się przy każdym starcie.</p>
      {problem && <Alert>{problem}</Alert>}
      {failure && <Alert>{failure}</Alert>}
      <button
        type="submit"
        disabled={setup.isPending}
        className="rounded-xl bg-ink px-4 py-3 font-bold text-paper transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {setup.isPending ? 'Zakładam konto…' : 'Załóż konto i wejdź'}
      </button>
    </form>
  );
}
