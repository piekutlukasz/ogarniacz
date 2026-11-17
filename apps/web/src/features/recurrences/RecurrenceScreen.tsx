import {
  type FamilyMember,
  type Recurrence,
  type RecurrencePattern,
  type UpdateRecurrence,
  TITLE_MAX_LENGTH,
  describePattern,
  titleProblem,
} from '@ogarniacz/shared';
import { type FormEvent, useState } from 'react';
import { ErrorNote } from '../../lib/ErrorNote';
import { Avatar, personColor } from '../../lib/Avatar';
import { useFamily, useHasChildren } from '../tasks/api';
import { formatDue } from '../tasks/format';
import { localToday } from '../tasks/hooks';
import { RewardBadge, RewardPicker } from '../tasks/Reward';
import { AssigneeSelect } from '../tasks/TaskItem';
import { useChangeRecurrence, useCreateRecurrence, useRecurrences } from './api';

const WEEKDAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'];
const WEEKDAY_NAMES = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela'];

const KIND_LABELS: Record<RecurrencePattern['kind'], string> = {
  weekly: 'Co tydzień',
  interval: 'Co kilka dni',
  monthly: 'Co miesiąc',
};

const inputClass = 'min-w-0 rounded-xl border-2 border-ink/10 bg-card px-2 py-2 text-base outline-brand';

/** Reguły cykliczne, np. śmieci w poniedziałek i czwartek. Ekran widzi tylko rodzic. */
export function RecurrenceScreen() {
  const rulesQuery = useRecurrences();
  const family = useFamily().data ?? [];
  const change = useChangeRecurrence();
  const [adding, setAdding] = useState(false);
  const today = localToday();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">
        Zadanie pojawia się samo w dniu wystąpienia. Dopóki poprzednie nie jest gotowe, następne nie powstaje.
      </p>
      {adding ? (
        <RuleForm family={family} submitLabel="Dodaj" onDone={() => setAdding(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 self-start rounded-full bg-brand py-2.5 pr-5 pl-4 font-bold text-on-brand shadow-card transition-transform active:scale-95"
        >
          <span aria-hidden="true" className="text-xl leading-none">+</span>
          Nowe zadanie cykliczne
        </button>
      )}

      {(rulesQuery.isError || change.isError) && <ErrorNote error={change.error} />}
      {rulesQuery.isPending && <p className="text-ink-muted">Wczytuję…</p>}
      {rulesQuery.isSuccess && rulesQuery.data.length === 0 && !adding && (
        <p className="rounded-2xl border-2 border-dashed border-paper-deep py-10 text-center text-ink-muted">Nie ma jeszcze zadań cyklicznych.</p>
      )}

      <ul className="flex flex-col gap-2.5">
        {rulesQuery.data?.map((rule) => (
          <RuleItem
            key={rule.id}
            rule={rule}
            family={family}
            today={today}
            busy={change.isPending}
            onChange={(update) => change.mutate({ id: rule.id, change: update })}
          />
        ))}
      </ul>
    </div>
  );
}

type RuleItemProps = {
  rule: Recurrence;
  family: FamilyMember[];
  today: string;
  busy: boolean;
  onChange: (change: UpdateRecurrence) => void;
};

function RuleItem({ rule, family, today, busy, onChange }: RuleItemProps) {
  const [mode, setMode] = useState<'view' | 'edit' | 'pause'>('view');
  const [pauseUntil, setPauseUntil] = useState<string>('');
  const member = family.find((item) => item.id === rule.assigneeId);
  const person = rule.assigneeId ? (member?.name ?? 'Konto wyłączone') : 'Dla chętnych';
  const hasChildren = useHasChildren();
  const state = rule.paused
    ? rule.pausedUntil
      ? `Pauza do ${formatDue(rule.pausedUntil, today)}`
      : 'Wstrzymane'
    : rule.nextOn && `Następne: ${formatDue(rule.nextOn, today)}`;

  function pause(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onChange({ pause: { until: pauseUntil || null } });
    setMode('view');
  }

  function remove() {
    if (window.confirm(`Usunąć „${rule.title}”? Utworzone już zadania zostaną.`)) {
      onChange({ archived: true });
    }
  }

  return (
    <li className={`rounded-2xl p-3 shadow-card ${rule.paused ? 'bg-card/60' : 'bg-card'}`}>
      <div className="flex items-start gap-3">
        <Avatar name={member?.name} color={personColor(family, rule.assigneeId)} />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={mode === 'edit'}
            onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')}
            className="text-left leading-snug font-bold break-words"
          >
            {rule.title}
          </button>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.8125rem] text-ink-muted">
            {hasChildren && rule.reward !== null && <RewardBadge reward={rule.reward} />}
            <span>{describePattern(rule.pattern)}</span>
            <span>{person}</span>
            {state && (
              <span className={rule.paused ? 'rounded-full bg-sun/40 px-2 font-bold text-amber-900 dark:bg-sun/15 dark:text-sun' : 'font-semibold text-ink/70'}>
                {state}
              </span>
            )}
          </p>
        </div>
        {mode === 'view' && (
          <div className="flex shrink-0 items-center gap-1">
            {rule.paused ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onChange({ pause: null })}
                className="rounded-full bg-ink px-3.5 py-2 text-sm font-bold text-paper transition-transform active:scale-95 disabled:opacity-60"
              >
                Wznów
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setMode('pause')}
                className="rounded-full px-2.5 py-2 text-sm font-semibold text-ink-muted active:bg-paper-deep"
              >
                Pauza
              </button>
            )}
          </div>
        )}
      </div>

      {mode === 'pause' && (
        <form onSubmit={pause} className="mt-3 flex flex-col gap-2 border-t-2 border-dashed border-paper-deep pt-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="shrink-0">Wstrzymaj do</span>
            <input
              type="date"
              aria-label="Koniec pauzy"
              min={today}
              value={pauseUntil}
              onChange={(event) => setPauseUntil(event.target.value)}
              className={`flex-1 ${inputClass}`}
            />
          </label>
          <p className="text-sm text-ink-muted">Bez daty pauza trwa do wznowienia.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setMode('view')} className="rounded-full px-3 py-2 text-sm font-semibold text-ink-muted">
              Anuluj
            </button>
            <button type="submit" className="rounded-full bg-brand px-4 py-2 text-sm font-bold text-on-brand">
              Wstrzymaj
            </button>
          </div>
        </form>
      )}

      {mode === 'edit' && (
        <div className="mt-3 border-t-2 border-dashed border-paper-deep pt-3">
          <RuleForm
            family={family}
            rule={rule}
            submitLabel="Zapisz"
            onDone={() => setMode('view')}
            onSave={(change) => {
              setMode('view');
              if (Object.keys(change).length > 0) onChange(change);
            }}
          />
          <button type="button" onClick={remove} className="mt-2 rounded-full px-3 py-2 text-sm font-semibold text-brand">
            Usuń regułę
          </button>
        </div>
      )}
    </li>
  );
}

type RuleFormProps = {
  family: FamilyMember[];
  submitLabel: string;
  onDone: () => void;
  /** Edycja istniejącej reguły. Bez niej formularz dodaje nową. */
  rule?: Recurrence;
  onSave?: (change: UpdateRecurrence) => void;
};

function RuleForm({ family, submitLabel, onDone, rule, onSave }: RuleFormProps) {
  const today = localToday();
  const initial = rule?.pattern;
  const [title, setTitle] = useState(rule?.title ?? '');
  const [assigneeId, setAssigneeId] = useState(rule?.assigneeId ?? null);
  const [reward, setReward] = useState(rule?.reward ?? null);
  const hasChildren = useHasChildren();
  const [kind, setKind] = useState<RecurrencePattern['kind']>(initial?.kind ?? 'weekly');
  const [weekdays, setWeekdays] = useState<number[]>(initial?.kind === 'weekly' ? initial.weekdays : []);
  const [days, setDays] = useState(String(initial?.kind === 'interval' ? initial.days : 2));
  const [monthDay, setMonthDay] = useState(String(initial?.kind === 'monthly' ? initial.day : 1));
  const [startOn, setStartOn] = useState(rule?.startOn ?? today);
  const [problem, setProblem] = useState<string>();

  const create = useCreateRecurrence(onDone);

  function buildPattern(): RecurrencePattern | string {
    if (kind === 'weekly') return weekdays.length ? { kind, weekdays } : 'Wybierz co najmniej jeden dzień tygodnia';
    if (kind === 'interval') {
      const value = Number(days);
      return Number.isInteger(value) && value >= 1 && value <= 365 ? { kind, days: value } : 'Podaj liczbę dni od 1 do 365';
    }
    const value = Number(monthDay);
    return Number.isInteger(value) && value >= 1 && value <= 31 ? { kind, day: value } : 'Podaj dzień miesiąca od 1 do 31';
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const pattern = buildPattern();
    // Przy edycji stary, za krótki tytuł wolno zostawić.
    const titleError = !rule || title.trim() !== rule.title ? titleProblem(title) : undefined;
    if (titleError) return setProblem(titleError);
    if (typeof pattern === 'string') return setProblem(pattern);
    setProblem(undefined);

    if (!rule) {
      create.mutate({ title, assigneeId, pattern, reward, ...(kind === 'interval' ? { startOn } : {}) });
      return;
    }
    // Jak przy zadaniach: wysyłamy tylko zmienione pola.
    const change: UpdateRecurrence = {};
    if (title.trim() !== rule.title) change.title = title;
    if (assigneeId !== rule.assigneeId) change.assigneeId = assigneeId;
    if (reward !== rule.reward) change.reward = reward;
    if (JSON.stringify(pattern) !== JSON.stringify(rule.pattern)) change.pattern = pattern;
    if (kind === 'interval' && startOn !== rule.startOn) change.startOn = startOn;
    onSave?.(change);
  }

  const toggleDay = (day: number) =>
    setWeekdays(weekdays.includes(day) ? weekdays.filter((item) => item !== day) : [...weekdays, day].sort((a, b) => a - b));

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <input
        aria-label="Nazwa zadania cyklicznego"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Np. wynieść śmieci"
        maxLength={TITLE_MAX_LENGTH}
        className="rounded-xl border-2 border-ink/10 bg-card px-3 py-2.5 text-base font-semibold outline-brand placeholder:font-normal"
      />
      <div className="flex gap-2">
        <AssigneeSelect family={family} value={assigneeId} onChange={setAssigneeId} />
        <select
          aria-label="Powtarzanie"
          value={kind}
          onChange={(event) => setKind(event.target.value as RecurrencePattern['kind'])}
          className={`flex-1 ${inputClass}`}
        >
          {Object.entries(KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {kind === 'weekly' && (
        <fieldset className="grid grid-cols-7 gap-1">
          <legend className="sr-only">Dni tygodnia</legend>
          {WEEKDAYS.map((label, index) => {
            const day = index + 1;
            const selected = weekdays.includes(day);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={selected}
                aria-label={WEEKDAY_NAMES[index]}
                onClick={() => toggleDay(day)}
                className={`rounded-full py-2 text-sm font-bold transition-colors ${selected ? 'bg-brand text-on-brand' : 'bg-paper-deep text-ink-muted'}`}
              >
                {label}
              </button>
            );
          })}
        </fieldset>
      )}

      {kind === 'interval' && (
        <div className="flex gap-2">
          <label className="flex flex-1 items-center gap-2 text-sm">
            <span className="shrink-0">Co ile dni</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              value={days}
              onChange={(event) => setDays(event.target.value)}
              className={`w-full ${inputClass}`}
            />
          </label>
          <label className="flex flex-1 items-center gap-2 text-sm">
            <span className="shrink-0">Od</span>
            <input
              type="date"
              aria-label="Pierwszy dzień"
              value={startOn}
              onChange={(event) => setStartOn(event.target.value || today)}
              className={`w-full ${inputClass}`}
            />
          </label>
        </div>
      )}

      {kind === 'monthly' && (
        <label className="flex items-center gap-2 text-sm">
          <span className="shrink-0">Dzień miesiąca</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={monthDay}
            onChange={(event) => setMonthDay(event.target.value)}
            className={`w-24 ${inputClass}`}
          />
          {Number(monthDay) > 28 && <span className="text-ink-muted">w krótszym miesiącu ostatniego</span>}
        </label>
      )}

      {/* Nagroda trafia do każdego tworzonego zadania; już utworzone zachowują swoją. */}
      {hasChildren && <RewardPicker value={reward} onChange={setReward} />}

      {problem && (
        <p role="alert" className="rounded-xl bg-red-100 px-3 py-2 text-sm font-semibold text-red-900 dark:bg-red-950 dark:text-red-200">
          {problem}
        </p>
      )}
      {create.isError && <ErrorNote error={create.error} />}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded-full px-3 py-2 text-sm font-semibold text-ink-muted">
          Anuluj
        </button>
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-full bg-brand px-4 py-2 text-sm font-bold text-on-brand disabled:opacity-60"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
