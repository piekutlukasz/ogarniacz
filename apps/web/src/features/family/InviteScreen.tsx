import { type User, passwordProblem } from '@ogarniacz/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type FormEvent, type ReactNode, useState } from 'react';
import { ApiError } from '../../lib/http';
import { isInstalled, isIos } from '../notifications/api';
import { acceptInvite, previewInvite } from './api';

const fieldClass = 'rounded-xl border-2 border-transparent bg-paper px-3 py-3 text-base font-normal outline-brand';
const mainButton = 'rounded-xl bg-ink px-4 py-3 font-bold text-paper transition-transform active:scale-[0.98] disabled:opacity-60';
const secondButton = 'rounded-xl border-2 border-ink/10 px-4 py-3 font-bold text-ink/75';

function message(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Nie udało się połączyć z serwerem. Sprawdź internet i spróbuj ponownie.';
}

function Card({ children }: { children: ReactNode }) {
  return <div className="mx-auto mt-6 flex w-full max-w-sm flex-col gap-4 rounded-3xl bg-card p-6 shadow-lift">{children}</div>;
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-xl bg-red-100 px-3 py-2 text-sm font-semibold text-red-900 dark:bg-red-950 dark:text-red-200">
      {children}
    </p>
  );
}

type InviteScreenProps = {
  token: string;
  /** Zalogowana osoba na tym telefonie; przed przyjęciem zaproszenia trzeba ją wylogować. */
  user: User | null;
  onLogOut: () => Promise<void>;
  /** Koniec: `user` to osoba zalogowana z zaproszenia, `null`, gdy ktoś zrezygnował. */
  onFinish: (user: User | null) => void;
};

/**
 * Ekran otwierany linkiem `/#zaproszenie=…`: powitanie, ustawienie hasła, logowanie i przypomnienie o instalacji.
 * Token jest tylko w pamięci; adres sprzątnął już `takeInviteToken`.
 */
export function InviteScreen({ token, user, onLogOut, onFinish }: InviteScreenProps) {
  const [accepted, setAccepted] = useState<User | null>(null);
  const logout = useMutation({ mutationFn: onLogOut });
  const loggedInElsewhere = user !== null && accepted === null;

  if (accepted) return <Welcome user={accepted} onDone={() => onFinish(accepted)} />;

  if (loggedInElsewhere) {
    return (
      <Card>
        <p className="text-2xl leading-tight font-extrabold">Zaproszenie</p>
        <p className="text-ink/70">
          Na tym telefonie jest zalogowana osoba: {user.name}. Żeby przyjąć zaproszenie, trzeba się najpierw wylogować.
        </p>
        {logout.isError && <Alert>{message(logout.error)}</Alert>}
        <button type="button" disabled={logout.isPending} onClick={() => logout.mutate()} className={mainButton}>
          Wyloguj i przyjmij zaproszenie
        </button>
        <button type="button" onClick={() => onFinish(null)} className={secondButton}>
          Nie teraz
        </button>
      </Card>
    );
  }

  return <SetPassword token={token} onAccepted={setAccepted} onCancel={() => onFinish(null)} />;
}

function SetPassword({ token, onAccepted, onCancel }: { token: string; onAccepted: (user: User) => void; onCancel: () => void }) {
  const preview = useQuery({ queryKey: ['invite-preview', token], queryFn: () => previewInvite(token), retry: false, staleTime: Number.POSITIVE_INFINITY });
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const accept = useMutation({ mutationFn: acceptInvite, onSuccess: onAccepted });

  if (preview.isPending) {
    return (
      <Card>
        <p className="text-ink/60">Sprawdzam zaproszenie…</p>
      </Card>
    );
  }
  if (preview.isError) {
    return (
      <Card>
        <p className="text-2xl leading-tight font-extrabold">Zaproszenie</p>
        <Alert>{message(preview.error)}</Alert>
        <button type="button" onClick={onCancel} className={mainButton}>
          Przejdź do logowania
        </button>
      </Card>
    );
  }

  const invite = preview.data;
  const isNew = invite.kind === 'new_account';

  function submit(event: FormEvent) {
    event.preventDefault();
    const found = passwordProblem(password, invite) ?? (password !== repeat ? 'Hasła się różnią' : null);
    setProblem(found);
    accept.reset();
    if (!found) accept.mutate({ token, password });
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-6 flex w-full max-w-sm flex-col gap-4 rounded-3xl bg-card p-6 shadow-lift">
      <div>
        <p className="text-2xl leading-tight font-extrabold">Cześć, {invite.name}!</p>
        <p className="text-ink/60">
          {isNew ? 'Ustaw hasło do swojego konta w Ogarniaczu.' : 'Ustaw nowe hasło. Na innych urządzeniach trzeba będzie zalogować się od nowa.'}
        </p>
      </div>
      <p className="text-sm">
        Twój login: <strong>{invite.login}</strong>
      </p>
      {/* Login w ukrytym polu podpowiada menedżerowi haseł, dla jakiego konta zapisać hasło. */}
      <input type="text" name="username" autoComplete="username" value={invite.login} readOnly hidden />
      <label className="flex flex-col gap-1 text-sm font-medium">
        {isNew ? 'Hasło' : 'Nowe hasło'}
        <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required className={fieldClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Powtórz hasło
        <input type="password" autoComplete="new-password" value={repeat} onChange={(event) => setRepeat(event.target.value)} required className={fieldClass} />
      </label>
      <p className="text-sm text-ink/55">Co najmniej 8 znaków, bez loginu i imienia.</p>
      {problem && <Alert>{problem}</Alert>}
      {accept.isError && <Alert>{message(accept.error)}</Alert>}
      <button type="submit" disabled={accept.isPending} className={mainButton}>
        {accept.isPending ? 'Zapisuję…' : 'Ustaw hasło i wejdź'}
      </button>
    </form>
  );
}

/** Po przyjęciu: przypomnienie o dodaniu do ekranu początkowego, bo na iPhonie tylko tak działają powiadomienia. */
function Welcome({ user, onDone }: { user: User; onDone: () => void }) {
  const installed = isInstalled();
  return (
    <Card>
      <p role="status" className="text-2xl leading-tight font-extrabold">
        Gotowe, {user.name}!
      </p>
      <p className="text-ink/70">Hasło jest ustawione, a ten telefon jest już zalogowany.</p>
      {!installed && (
        <div className="flex flex-col gap-2 rounded-2xl bg-paper-deep p-4 text-sm">
          <p className="font-extrabold">Dodaj Ogarniacza do ekranu początkowego</p>
          {isIos() ? (
            <p>
              W Safari stuknij „Udostępnij”, a potem „Do ekranu początkowego”. Aplikacja z ekranu początkowego ma osobne dane, więc
              zaloguj się w niej jeszcze raz loginem <strong>{user.login}</strong> i nowym hasłem.
            </p>
          ) : (
            <p>W menu przeglądarki wybierz „Dodaj do ekranu głównego” albo „Zainstaluj aplikację”.</p>
          )}
          <p className="text-ink/60">Dopiero wtedy działają powiadomienia.</p>
        </div>
      )}
      <button type="button" onClick={onDone} className={mainButton}>
        Przejdź do aplikacji
      </button>
    </Card>
  );
}
