import { ALLOWANCE_MAX } from '@ogarniacz/shared';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Avatar } from '../../lib/Avatar';
import { ErrorNote } from '../../lib/ErrorNote';
import { zl } from '../tasks/Reward';
import { useSetAllowanceRates } from './api';
import { formatDay } from './format';

/** O tyle zmieniają kwotę przyciski plus i minus. Dowolną kwotę da się wpisać w pole. */
const STEP = 5;

export type RateChild = { id: string; name: string; color?: string; amount: number };

type RatesSheetProps = {
  kids: RateChild[];
  /** Poniedziałek, od którego nowa kwota trafia do wypłaty. */
  effectiveOn: string;
  onClose: () => void;
};

function parseAmount(text: string): number | undefined {
  const amount = Number(text);
  return text.trim() !== '' && Number.isInteger(amount) && amount >= 0 && amount <= ALLOWANCE_MAX ? amount : undefined;
}

/**
 * Stała kwota kieszonkowego na tydzień, osobno dla każdego dziecka. Otwiera go tylko rodzic.
 * Arkusz montuje się przy otwarciu, więc zawsze startuje od aktualnych stawek.
 */
export function RatesSheet({ kids, effectiveOn, onClose }: RatesSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(kids.map((child) => [child.id, String(child.amount)])),
  );
  const [problem, setProblem] = useState<string>();
  const save = useSetAllowanceRates(onClose);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const setAmount = (id: string, text: string) => {
    setAmounts((current) => ({ ...current, [id]: text }));
    setProblem(undefined);
  };
  const step = (id: string, by: number) => {
    const next = Math.min(ALLOWANCE_MAX, Math.max(0, (parseAmount(amounts[id] ?? '') ?? 0) + by));
    setAmount(id, String(next));
  };
  const total = kids.reduce((sum, child) => sum + (parseAmount(amounts[child.id] ?? '') ?? 0), 0);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rates = kids.map((child) => ({ childId: child.id, amount: parseAmount(amounts[child.id] ?? '') }));
    if (rates.some((rate) => rate.amount === undefined)) {
      return setProblem(`Podaj kwotę w pełnych złotych, od 0 do ${ALLOWANCE_MAX}`);
    }
    save.mutate({ rates: rates.map((rate) => ({ childId: rate.childId, amount: rate.amount ?? 0 })) });
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="rates-title"
      onClose={onClose}
      // Stuknięcie w przyciemnione tło trafia w sam <dialog>, nie w jego treść.
      onClick={(event) => event.target === event.currentTarget && onClose()}
      className="mx-auto mt-auto mb-0 max-h-[85dvh] w-full max-w-xl rounded-t-3xl bg-paper p-0 text-ink shadow-lift backdrop:bg-black/40 open:animate-[sheet-in_220ms_ease-out]"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <span aria-hidden="true" className="mx-auto h-1.5 w-10 rounded-full bg-ink/15" />

        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="rates-title" className="text-xl leading-tight font-extrabold">
              Kieszonkowe
            </h2>
            <p className="text-sm text-ink/55">Stała kwota na tydzień, bez nagród za zadania.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij kieszonkowe"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-paper-deep text-lg text-ink/70"
          >
            ×
          </button>
        </div>

        <ul className="flex flex-col gap-2">
          {kids.map((child) => (
            <li key={child.id} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-card">
              <Avatar name={child.name} color={child.color} />
              <div className="min-w-0 flex-1">
                <span className="font-bold break-words">{child.name}</span>
                <p className="text-[0.8125rem] text-ink/55">{amounts[child.id] === '0' ? 'bez kieszonkowego' : 'co tydzień'}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1 rounded-full bg-paper-deep p-1">
                <StepButton label={`Zmniejsz kieszonkowe: ${child.name}`} onClick={() => step(child.id, -STEP)}>
                  −
                </StepButton>
                <label className="flex items-baseline gap-1 font-extrabold">
                  <input
                    type="number"
                    inputMode="numeric"
                    aria-label={`Kieszonkowe w złotych: ${child.name}`}
                    min={0}
                    max={ALLOWANCE_MAX}
                    step={1}
                    value={amounts[child.id] ?? ''}
                    onChange={(event) => setAmount(child.id, event.target.value)}
                    // Bez strzałek przeglądarki: kwotę zmieniają przyciski obok.
                    className="w-11 [appearance:textfield] bg-transparent text-right text-lg outline-brand [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  zł
                </label>
                <StepButton label={`Zwiększ kieszonkowe: ${child.name}`} onClick={() => step(child.id, STEP)}>
                  +
                </StepButton>
              </div>
            </li>
          ))}
        </ul>

        <p className="flex items-center justify-between px-1">
          <span className="text-sm text-ink/60">Razem co tydzień</span>
          <span className="font-extrabold">{zl(total)}</span>
        </p>

        <p className="rounded-2xl bg-paper-deep px-3 py-2.5 text-sm">
          Wypłata w każdy poniedziałek. Nowa kwota obowiązuje od wypłaty {formatDay(effectiveOn)}, wcześniejsze tygodnie
          zostają bez zmian.
        </p>

        {problem && (
          <p role="alert" className="text-sm font-semibold text-brand">
            {problem}
          </p>
        )}
        {save.isError && <ErrorNote error={save.error} />}

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border-2 border-ink/10 px-4 py-3 font-bold">
            Anuluj
          </button>
          <button
            type="submit"
            disabled={save.isPending}
            className="flex-1 rounded-xl bg-brand px-4 py-3 font-bold text-on-brand transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            Zapisz
          </button>
        </div>
      </form>
    </dialog>
  );
}

function StepButton({ label, onClick, children }: { label: string; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-9 items-center justify-center rounded-full bg-card text-lg font-extrabold shadow-card transition-transform active:scale-90"
    >
      {children}
    </button>
  );
}
