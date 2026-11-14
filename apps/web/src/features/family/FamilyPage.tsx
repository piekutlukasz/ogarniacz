import { type Account, type AuthEvent, type AuthEventType, type CreatedInvite, type Invite, type User, type UserRole } from '@ogarniacz/shared';
import { type FormEvent, type ReactNode, useEffect, useId, useState } from 'react';
import { ChevronRightIcon } from '../../lib/icons';
import { ErrorNote } from '../../lib/ErrorNote';
import { timeAgo } from '../calendars/format';
import { QrCode } from './QrCode';
import { inviteLink, useAccounts, useAuthEvents, useCreateInvite, useInvites, useRevokeInvite, useUpdateAccount } from './api';

const inputClass = 'min-w-0 rounded-xl border-2 border-ink/10 bg-card px-3 py-2 text-base outline-brand';
const primaryButton =
  'rounded-full bg-brand px-4 py-2 text-sm font-bold text-on-brand shadow-card transition-transform active:scale-95 disabled:opacity-60';
const quietButton = 'rounded-full bg-paper-deep px-3.5 py-2 text-sm font-bold text-ink/75 transition-transform active:scale-95 disabled:opacity-60';
const smallButton = 'rounded-full bg-paper-deep px-3 py-1.5 text-[0.8125rem] font-bold text-ink/75 transition-transform active:scale-95 disabled:opacity-60';

const ROLE_LABELS: Record<UserRole, string> = { parent: 'Rodzic', child: 'Dziecko' };

const dateTime = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const EVENT_LABELS: Record<AuthEventType, string> = {
  login_ok: 'Logowanie',
  login_failed: 'Nieudane logowanie',
  locked: 'Blokada logowania',
  logout: 'Wylogowanie',
  logout_all: 'Wylogowanie innych urządzeń',
  account_created: 'Nowe konto',
  password_changed: 'Zmiana hasła',
  password_reset: 'Nowe hasło',
  account_disabled: 'Wyłączenie konta',
  account_enabled: 'Włączenie konta',
  invite_created: 'Zaproszenie',
  invite_accepted: 'Przyjęcie zaproszenia',
  invite_revoked: 'Unieważnienie zaproszenia',
  setup_done: 'Pierwsze uruchomienie',
};

/** Czynność, która wymaga hasła rodzica: formularz pokazuje się w miejscu przycisku. */
type Pending = { kind: 'reset'; account: Account } | { kind: 'disable' | 'enable'; account: Account };

/**
 * Podstrona „Rodzina”, tylko dla rodzica: konta, zaproszenia i wejście do dziennika logowań. Każda zmiana konta
 * wymaga hasła rodzica, a link z tokenem widać tylko raz, zaraz po utworzeniu: wyjście z podstrony go zapomina.
 * Akcje konta pokazują się dopiero po stuknięciu w osobę, żeby lista nie była ścianą przycisków.
 */
export function FamilyPage({ user, onOpenLog }: { user: User; onOpenLog: () => void }) {
  const accounts = useAccounts(true);
  const invites = useInvites(true);
  const [inviting, setInviting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const start = (next: Pending | 'invite') => {
    setNotice(null);
    setCreated(null);
    if (next === 'invite') {
      setPending(null);
      setExpanded(null);
      setInviting(true);
    } else {
      setInviting(false);
      setPending(next);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {notice && (
        <p role="status" className="rounded-xl bg-sun/40 px-3 py-2 text-sm font-semibold text-amber-900 dark:bg-sun/15 dark:text-sun">
          {notice}
        </p>
      )}

      {created && <CreatedLink created={created} onDone={() => setCreated(null)} />}

      {inviting ? (
        <InviteForm
          onCancel={() => setInviting(false)}
          onCreated={(result) => {
            setInviting(false);
            setCreated(result);
          }}
        />
      ) : (
        !created && (
          <button type="button" onClick={() => start('invite')} className={`${primaryButton} self-start`}>
            Zaproś osobę
          </button>
        )
      )}

      <Part title="Konta">
        {accounts.isPending && <p className="text-sm text-ink/55">Wczytuję…</p>}
        {accounts.isError && <ErrorNote error={accounts.error} />}
        <ul className="flex flex-col gap-2">
          {accounts.data?.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              isMe={account.id === user.id}
              expanded={expanded === account.id}
              onToggle={() => {
                setPending(null);
                setExpanded(expanded === account.id ? null : account.id);
              }}
              pending={pending?.account.id === account.id ? pending : null}
              onStart={start}
              onCancel={() => setPending(null)}
              onDone={(result) => {
                setPending(null);
                setExpanded(null);
                if (typeof result === 'string') setNotice(result);
                else setCreated(result);
              }}
            />
          ))}
        </ul>
      </Part>

      {/* Zaproszenia tylko, gdy jakieś czekają: pusty nagłówek niczego nie mówi. */}
      {invites.data && invites.data.length > 0 && (
        <Part title="Oczekujące zaproszenia">
          <ul className="flex flex-col gap-2">
            {invites.data.map((invite) => (
              <InviteRow key={invite.id} invite={invite} onRevoked={(name) => setNotice(`Unieważniono zaproszenie: ${name}.`)} />
            ))}
          </ul>
        </Part>
      )}

      <button
        type="button"
        onClick={onOpenLog}
        data-focus="row-log"
        className="flex items-center gap-3 rounded-2xl bg-paper-deep px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-bold">Dziennik logowań</span>
          <span className="block text-[0.8125rem] text-ink/55">Logowania, blokady, zaproszenia i zmiany kont</span>
        </span>
        <span className="text-ink/40">
          <ChevronRightIcon />
        </span>
      </button>
    </div>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="font-extrabold">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Pole „Twoje hasło” do potwierdzania zmian kont. */
function ConfirmField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-semibold">
      Twoje hasło
      <input
        type="password"
        autoComplete="current-password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        className={inputClass}
      />
    </label>
  );
}

function InviteForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (created: CreatedInvite) => void }) {
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [role, setRole] = useState<UserRole>('child');
  const [confirm, setConfirm] = useState('');
  const create = useCreateInvite();

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate({ kind: 'new_account', name, login, role, confirm }, { onSuccess: onCreated });
  }

  return (
    <form onSubmit={submit} aria-label="Zaproszenie nowej osoby" className="flex flex-col gap-2 rounded-2xl bg-paper-deep p-3">
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Imię
        <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={40} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Login
        <input
          value={login}
          onChange={(event) => setLogin(event.target.value.toLowerCase())}
          required
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={32}
          className={inputClass}
        />
        <span className="font-normal text-ink/55">Małe litery bez polskich znaków, cyfry, kropka, myślnik.</span>
      </label>
      <div role="radiogroup" aria-label="Rola" className="grid grid-cols-2 gap-1 rounded-2xl bg-paper p-1">
        {(['child', 'parent'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={role === value}
            onClick={() => setRole(value)}
            className={`rounded-xl px-1 py-2 text-[0.8125rem] font-bold transition ${role === value ? 'bg-card shadow-card' : 'text-ink/55'}`}
          >
            {ROLE_LABELS[value]}
          </button>
        ))}
      </div>
      <ConfirmField value={confirm} onChange={setConfirm} />
      {create.isError && <ErrorNote error={create.error} />}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={quietButton}>
          Anuluj
        </button>
        <button type="submit" disabled={create.isPending} className={primaryButton}>
          Utwórz zaproszenie
        </button>
      </div>
    </form>
  );
}

/** Link z tokenem, pokazywany jeden raz: kod QR do zeskanowania drugim telefonem, kopiowanie i „Udostępnij”. */
function CreatedLink({ created, onDone }: { created: CreatedInvite; onDone: () => void }) {
  const link = inviteLink(created.token);
  const [copied, setCopied] = useState(false);
  const { invite } = created;
  const forWhom = invite.kind === 'new_account' ? `Zaproszenie dla: ${invite.name}` : `Nowe hasło dla: ${invite.name}`;
  const canShare = typeof navigator.share === 'function';

  return (
    <section aria-label="Link zaproszenia" className="flex flex-col items-center gap-3 rounded-2xl bg-card p-4 shadow-card">
      <p className="self-stretch font-extrabold">{forWhom}</p>
      <p className="self-stretch text-sm text-ink/60">
        Zeskanuj kod telefonem tej osoby albo wyślij jej link. Działa 24 godziny i tylko raz. Po zamknięciu tego okna link nie będzie już widoczny.
      </p>
      <QrCode value={link} label={`Kod QR: ${forWhom}`} />
      <input readOnly value={link} aria-label="Link" onFocus={(event) => event.currentTarget.select()} className={`${inputClass} w-full text-sm`} />
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() =>
            navigator.clipboard.writeText(link).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }
          className={quietButton}
        >
          {copied ? 'Skopiowano' : 'Kopiuj link'}
        </button>
        {canShare && (
          <button
            type="button"
            // Anulowane udostępnianie odrzuca obietnicę; nie ma czego zgłaszać.
            onClick={() => navigator.share({ title: 'Ogarniacz', text: forWhom, url: link }).catch(() => undefined)}
            className={quietButton}
          >
            Udostępnij
          </button>
        )}
        <button type="button" onClick={onDone} className={primaryButton}>
          Gotowe
        </button>
      </div>
    </section>
  );
}

function lastSeen(account: Account): string {
  if (account.disabled) return 'Konto wyłączone';
  const at = account.lastSeenAt ?? account.lastLoginAt;
  return at ? `Ostatnio: ${timeAgo(at, Date.now())}` : 'Jeszcze nie używa aplikacji';
}

function AccountRow({
  account,
  isMe,
  expanded,
  onToggle,
  pending,
  onStart,
  onCancel,
  onDone,
}: {
  account: Account;
  isMe: boolean;
  expanded: boolean;
  onToggle: () => void;
  pending: Pending | null;
  onStart: (pending: Pending) => void;
  onCancel: () => void;
  onDone: (result: string | CreatedInvite) => void;
}) {
  const [confirm, setConfirm] = useState('');
  const create = useCreateInvite();
  const update = useUpdateAccount();
  const busy = create.isPending || update.isPending;

  useEffect(() => {
    if (pending) return;
    setConfirm('');
    create.reset();
    update.reset();
  }, [pending, create.reset, update.reset]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!pending) return;
    if (pending.kind === 'reset') {
      create.mutate({ kind: 'password_reset', userId: account.id, confirm }, { onSuccess: onDone });
    } else {
      const disabled = pending.kind === 'disable';
      update.mutate(
        { id: account.id, disabled, confirm },
        { onSuccess: () => onDone(disabled ? `Wyłączono konto: ${account.name}. To konto jest wylogowane.` : `Włączono konto: ${account.name}.`) },
      );
    }
  }

  const question =
    pending?.kind === 'reset'
      ? `Link do nowego hasła dla: ${account.name}. Po jego użyciu ta osoba zostanie wylogowana na wszystkich urządzeniach.`
      : pending?.kind === 'disable'
        ? `Wyłączyć konto: ${account.name}? Ta osoba zostanie od razu wylogowana.`
        : `Włączyć konto: ${account.name}?`;

  const canReset = !account.disabled;
  const canSwitch = account.role === 'child';
  // Własnego konta nie zmienia się tutaj (od tego jest „Hasło i urządzenia”), a wyłączony rodzic nie ma akcji.
  const hasActions = !isMe && (canReset || canSwitch);
  const details = (
    <div className="min-w-0 flex-1">
      <p className="font-bold">
        {account.name}
        {isMe && <span className="font-semibold text-ink/55"> (ty)</span>}
      </p>
      <p className="text-sm text-ink/55">
        {ROLE_LABELS[account.role]} · {account.login}
      </p>
      <p className={`text-sm ${account.disabled ? 'font-semibold text-brand' : 'text-ink/55'}`}>{lastSeen(account)}</p>
    </div>
  );

  return (
    <li aria-label={account.name} className="flex flex-col rounded-2xl bg-card shadow-card">
      {hasActions ? (
        <button type="button" aria-expanded={expanded} onClick={onToggle} className="flex items-center gap-3 p-3 text-left">
          {details}
          <span className={`text-ink/40 transition-transform ${expanded ? 'rotate-90' : ''}`}>
            <ChevronRightIcon />
          </span>
        </button>
      ) : (
        <div className="flex p-3">{details}</div>
      )}
      {expanded && !pending && (
        <div className="flex flex-wrap gap-2 px-3 pb-3">
          {canReset && (
            <button type="button" onClick={() => onStart({ kind: 'reset', account })} className={smallButton}>
              Nowe hasło
            </button>
          )}
          {canSwitch && (
            <button type="button" onClick={() => onStart({ kind: account.disabled ? 'enable' : 'disable', account })} className={smallButton}>
              {account.disabled ? 'Włącz konto' : 'Wyłącz konto'}
            </button>
          )}
        </div>
      )}
      {pending && (
        <form onSubmit={submit} className="flex flex-col gap-2 px-3 pb-3">
          <p className="text-sm">{question}</p>
          <ConfirmField value={confirm} onChange={setConfirm} />
          {create.isError && <ErrorNote error={create.error} />}
          {update.isError && <ErrorNote error={update.error} />}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancel} className={quietButton}>
              Anuluj
            </button>
            <button type="submit" disabled={busy} className={primaryButton}>
              {pending.kind === 'reset' ? 'Utwórz link' : pending.kind === 'disable' ? 'Wyłącz' : 'Włącz'}
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

function InviteRow({ invite, onRevoked }: { invite: Invite; onRevoked: (name: string) => void }) {
  const revoke = useRevokeInvite();
  const what = invite.kind === 'new_account' ? `Nowe konto (${ROLE_LABELS[invite.role ?? 'child'].toLowerCase()})` : 'Nowe hasło';
  return (
    <li aria-label={`Zaproszenie: ${invite.name}`} className="flex flex-col gap-2 rounded-2xl bg-card p-3 shadow-card">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold">{invite.name}</p>
          <p className="text-sm text-ink/55">
            {what} · {invite.login}
          </p>
          <p className="text-sm text-ink/55">
            Od: {invite.createdBy} · ważne do {dateTime.format(new Date(invite.expiresAt))}
          </p>
        </div>
        <button
          type="button"
          disabled={revoke.isPending}
          onClick={() => revoke.mutate(invite.id, { onSuccess: () => onRevoked(invite.name) })}
          className={smallButton}
        >
          Unieważnij
        </button>
      </div>
      {revoke.isError && <ErrorNote error={revoke.error} />}
    </li>
  );
}

function describeEvent(event: AuthEvent): string {
  const parts = [EVENT_LABELS[event.type]];
  if (event.name) parts.push(event.name);
  if (event.actorName && event.actorName !== event.name) parts.push(`przez: ${event.actorName}`);
  return parts.join(' · ');
}

/** Podstrona „Dziennik logowań”: wczytuje się dopiero po wejściu. */
export function AuthLogPage() {
  const events = useAuthEvents(true);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink/55">Ostatnie 100 wpisów z 90 dni: logowania, blokady, zaproszenia i zmiany kont.</p>
      {events.isPending && <p className="text-sm text-ink/55">Wczytuję…</p>}
      {events.isError && <ErrorNote error={events.error} />}
      <ul aria-label="Wpisy dziennika" className="flex flex-col gap-1.5">
        {events.data?.map((event, index) => (
          <li key={`${event.createdAt}-${index}`} className="rounded-xl bg-card px-3 py-2 text-sm">
            <p className="font-semibold">{describeEvent(event)}</p>
            <p className="text-ink/55">
              {dateTime.format(new Date(event.createdAt))}
              {event.ip ? ` · ${event.ip}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
