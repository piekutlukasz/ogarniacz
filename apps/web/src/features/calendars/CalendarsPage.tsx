import type { Calendar, CalendarScope } from '@ogarniacz/shared';
import { type FormEvent, useState } from 'react';
import { ErrorNote } from '../../lib/ErrorNote';
import { useAddCalendar, useCalendars, useChangeCalendar, useSyncCalendar } from './api';
import { pluralEvents, timeAgo } from './format';

const SCOPES: { value: CalendarScope; label: string }[] = [
  { value: 'family', label: 'Cała rodzina' },
  { value: 'private', label: 'Tylko ja' },
];

const inputClass = 'min-w-0 rounded-xl border-2 border-ink/10 bg-card px-3 py-2 text-base outline-brand';
const primaryButton = 'rounded-full bg-brand px-4 py-2 text-sm font-bold text-on-brand shadow-card transition-transform active:scale-95 disabled:opacity-60';
const quietButton = 'rounded-full bg-paper-deep px-3.5 py-2 text-sm font-bold text-ink/75 transition-transform active:scale-95 disabled:opacity-60';

/**
 * Podstrona „Kalendarze”, tylko dla rodzica. Link działa jak hasło: wpisuje się go raz,
 * a potem nigdzie nie jest pokazywany, więc zmiana linku to wklejenie nowego.
 */
export function CalendarsPage() {
  const calendars = useCalendars(true);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<Calendar | null>(null);
  const sync = useSyncCalendar();
  const change = useChangeCalendar();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">
        Wydarzenia z Google Kalendarza i iCloud pojawiają się w „Dziś”. Aplikacja tylko je czyta, a zmiany z kalendarza docierają
        z opóźnieniem do kilkunastu minut.
      </p>

      {added && (
        <p role="status" className="rounded-xl bg-sun/40 px-3 py-2 text-sm font-semibold text-amber-900 dark:bg-sun/15 dark:text-sun">
          Dodano kalendarz „{added.name}”. Znaleziono: {pluralEvents(added.eventCount)}.
        </p>
      )}

      {adding ? (
        <AddForm
          onCancel={() => setAdding(false)}
          onAdded={(calendar) => {
            setAdding(false);
            setAdded(calendar);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setAdded(null);
            setAdding(true);
          }}
          className="flex items-center gap-1.5 self-start rounded-full bg-brand py-2.5 pr-5 pl-4 font-bold text-on-brand shadow-card transition-transform active:scale-95"
        >
          <span aria-hidden="true" className="text-xl leading-none">+</span>
          Dodaj kalendarz
        </button>
      )}

      {calendars.isPending && <p className="text-ink-muted">Wczytuję…</p>}
      {calendars.isError && <ErrorNote error={calendars.error} />}
      {(sync.isError || change.isError) && <ErrorNote error={sync.error ?? change.error} />}
      {calendars.isSuccess && calendars.data.length === 0 && !adding && (
        <p className="rounded-2xl border-2 border-dashed border-paper-deep py-8 text-center text-ink-muted">Nie ma jeszcze kalendarzy.</p>
      )}

      <ul className="flex flex-col gap-2.5">
        {calendars.data?.map((calendar) => (
          <CalendarItem
            key={calendar.id}
            calendar={calendar}
            busy={sync.isPending || change.isPending}
            onSync={() => sync.mutate(calendar.id)}
            onChange={(update) => change.mutate({ id: calendar.id, change: update })}
          />
        ))}
      </ul>
    </div>
  );
}

function ScopePicker({ value, onChange, label }: { value: CalendarScope; onChange: (scope: CalendarScope) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1 rounded-2xl bg-paper-deep p-1">
      {SCOPES.map((scope) => (
        <button
          key={scope.value}
          type="button"
          role="radio"
          aria-checked={value === scope.value}
          onClick={() => onChange(scope.value)}
          className={`rounded-xl px-1 py-2 text-[0.8125rem] font-bold transition ${value === scope.value ? 'bg-card shadow-card' : 'text-ink-muted'}`}
        >
          {scope.label}
        </button>
      ))}
    </div>
  );
}

function AddForm({ onCancel, onAdded }: { onCancel: () => void; onAdded: (calendar: Calendar) => void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [scope, setScope] = useState<CalendarScope>('family');
  const add = useAddCalendar(onAdded);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    add.mutate({ name, url, scope });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl bg-card p-3 shadow-card">
      <label className="flex flex-col gap-1 text-sm font-bold">
        Nazwa kalendarza
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="np. Rodzina" autoComplete="off" className={`${inputClass} font-normal`} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-bold">
        Link do kalendarza
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Wklej tajny adres iCal albo link z iCloud"
          className={`${inputClass} font-normal`}
        />
      </label>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-bold">Kto widzi wydarzenia</span>
        <ScopePicker value={scope} onChange={setScope} label="Kto widzi wydarzenia" />
      </div>
      <p className="text-[0.8125rem] text-ink-muted">Link działa jak hasło. Po zapisaniu nie będzie nigdzie wyświetlany, a w bazie jest zaszyfrowany.</p>
      {add.isError && <ErrorNote error={add.error} />}
      <div className="flex gap-2">
        <button type="submit" disabled={add.isPending} className={primaryButton}>
          {add.isPending ? 'Sprawdzam link…' : 'Zapisz'}
        </button>
        <button type="button" onClick={onCancel} className={quietButton}>
          Anuluj
        </button>
      </div>
    </form>
  );
}

type CalendarItemProps = {
  calendar: Calendar;
  busy: boolean;
  onSync: () => void;
  onChange: (change: { name?: string; scope?: CalendarScope; url?: string; archived?: true }) => void;
};

function CalendarItem({ calendar, busy, onSync, onChange }: CalendarItemProps) {
  const [replacing, setReplacing] = useState(false);
  const replace = useChangeCalendar(() => setReplacing(false));
  const nowMs = Date.now();
  const scopeLabel = SCOPES.find((scope) => scope.value === calendar.scope)?.label;
  const otherScope = SCOPES.find((scope) => scope.value !== calendar.scope);

  function remove() {
    if (window.confirm(`Odpiąć kalendarz „${calendar.name}”? Jego wydarzenia znikną z „Dziś”, a zapisany link zostanie usunięty.`)) {
      onChange({ archived: true });
    }
  }

  return (
    <li className="rounded-2xl bg-card p-3 shadow-card">
      <div className="min-w-0">
        <p className="leading-snug font-bold break-words">{calendar.name}</p>
        <p className="mt-0.5 flex flex-wrap gap-x-2 text-[0.8125rem] text-ink-muted">
          <span>{calendar.host}</span>
          <span>{scopeLabel}</span>
          <span>{pluralEvents(calendar.eventCount)}</span>
          {calendar.lastSuccessAt ? <span>Ostatnio: {timeAgo(calendar.lastSuccessAt, nowMs)}</span> : <span>Jeszcze niepobrany</span>}
        </p>
      </div>

      {calendar.errorMessage && (
        <p role="alert" className="mt-2 rounded-xl bg-red-100 px-3 py-2 text-sm font-semibold text-red-900 dark:bg-red-950 dark:text-red-200">
          {calendar.errorMessage}
        </p>
      )}

      {replacing ? (
        <ReplaceForm onCancel={() => setReplacing(false)} replace={replace} id={calendar.id} />
      ) : (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={onSync} className={quietButton}>
            Odśwież teraz
          </button>
          <button type="button" disabled={busy} onClick={() => setReplacing(true)} className={quietButton}>
            Wymień link
          </button>
          {otherScope && (
            <button type="button" disabled={busy} onClick={() => onChange({ scope: otherScope.value })} className={quietButton}>
              Pokaż: {otherScope.label.toLowerCase()}
            </button>
          )}
          <button type="button" disabled={busy} onClick={remove} className="rounded-full px-3.5 py-2 text-sm font-bold text-brand disabled:opacity-60">
            Odepnij
          </button>
        </div>
      )}
    </li>
  );
}

function ReplaceForm({ id, replace, onCancel }: { id: string; replace: ReturnType<typeof useChangeCalendar>; onCancel: () => void }) {
  const [url, setUrl] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    replace.mutate({ id, change: { url } });
  }

  return (
    <form onSubmit={submit} className="mt-2.5 flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm font-bold">
        Nowy link do kalendarza
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className={`${inputClass} font-normal`}
        />
      </label>
      {replace.isError && <ErrorNote error={replace.error} />}
      <div className="flex gap-2">
        <button type="submit" disabled={replace.isPending} className={primaryButton}>
          {replace.isPending ? 'Sprawdzam link…' : 'Zapisz link'}
        </button>
        <button type="button" onClick={onCancel} className={quietButton}>
          Anuluj
        </button>
      </div>
    </form>
  );
}
