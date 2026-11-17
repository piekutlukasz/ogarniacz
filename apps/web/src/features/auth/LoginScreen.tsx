import type { User } from '@ogarniacz/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { DEMO_KEY, demoLogIn, fetchDemoInfo } from '../demo/api';
import { ApiError } from '../../lib/http';
import { logIn } from './api';

export function LoginScreen({ onLoggedIn }: { onLoggedIn: (user: User) => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: logIn,
    onSuccess: (user) => {
      setPassword('');
      onLoggedIn(user);
    },
  });

  // W trybie demo konta wybiera się jednym przyciskiem, bez wpisywania hasła.
  const demo = useQuery({ queryKey: DEMO_KEY, queryFn: fetchDemoInfo, staleTime: Number.POSITIVE_INFINITY, retry: false });
  const demoMutation = useMutation({ mutationFn: demoLogIn, onSuccess: onLoggedIn });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate({ login, password });
  }

  const failure = mutation.error ?? demoMutation.error;
  const error =
    failure instanceof ApiError
      ? failure.message
      : failure
        ? 'Nie udało się połączyć z serwerem. Sprawdź internet i spróbuj ponownie.'
        : null;

  return (
    <form onSubmit={handleSubmit} className="mx-auto mt-6 flex w-full max-w-sm -rotate-[0.6deg] flex-col gap-4 rounded-3xl bg-card p-6 shadow-lift">
      <div aria-hidden="true" className="-mt-9 flex justify-center">
        <span className="size-7 rounded-full bg-brand shadow-[inset_-3px_-3px_0_rgb(0_0_0/0.15)]" />
      </div>
      <div>
        <p className="text-2xl leading-tight font-extrabold">Cześć!</p>
        <p className="text-ink-muted">Zaloguj się, żeby zobaczyć domowe sprawy.</p>
      </div>

      {demo.data && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Wejdź jako:</p>
          {demo.data.accounts.map((account) => (
            <button
              key={account.login}
              type="button"
              disabled={demoMutation.isPending}
              onClick={() => demoMutation.mutate(account.login)}
              className="flex items-center justify-between rounded-xl bg-brand px-4 py-3 text-left font-bold text-ink transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              <span>{account.name}</span>
              <span className="text-sm font-semibold opacity-70">{account.role === 'parent' ? 'rodzic' : 'dziecko'}</span>
            </button>
          ))}
          <p className="text-sm text-ink-muted">Albo zaloguj się loginem i hasłem:</p>
        </div>
      )}

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
          className="rounded-xl border-2 border-transparent bg-paper px-3 py-3 text-base font-normal outline-brand"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Hasło
        <input
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
          className="rounded-xl border-2 border-transparent bg-paper px-3 py-3 text-base font-normal outline-brand"
        />
      </label>

      {error && (
        <p role="alert" className="rounded-xl bg-red-100 px-3 py-2 text-sm font-semibold text-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded-xl bg-ink px-4 py-3 font-bold text-paper transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {mutation.isPending ? 'Loguję…' : 'Zaloguj'}
      </button>
    </form>
  );
}
