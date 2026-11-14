import { REWARD_MAX, REWARD_PRESETS } from '@ogarniacz/shared';
import { useId, useState } from 'react';

/** Kwota po polsku, np. „15 zł”. */
export function zl(amount: number): string {
  return `${amount} zł`;
}

/** Żółta plakietka z nagrodą na karteczce zadania. Czytnik ekranu słyszy „Nagroda: +15 zł”. */
export function RewardBadge({ reward }: { reward: number }) {
  return (
    <span className="rounded-full bg-sun px-2 text-xs leading-5 font-extrabold whitespace-nowrap text-avatar-ink">
      <span className="sr-only">Nagroda: </span>+{zl(reward)}
    </span>
  );
}

type RewardPickerProps = { value: number | null; onChange: (value: number | null) => void };

const optionClass = (selected: boolean) =>
  `rounded-xl px-1 py-2 text-[0.8125rem] font-bold whitespace-nowrap transition ${selected ? 'bg-card shadow-card' : 'text-ink/55'}`;

/**
 * Wybór nagrody: brak, gotowe kwoty albo własna. Widzi go tylko rodzic.
 * Pusta własna kwota oznacza zadanie bez nagrody.
 */
export function RewardPicker({ value, onChange }: RewardPickerProps) {
  const isPreset = (amount: number | null) => REWARD_PRESETS.some((preset) => preset === amount);
  const [custom, setCustom] = useState(value !== null && !isPreset(value));
  const labelId = useId();

  const pick = (amount: number | null) => {
    setCustom(false);
    onChange(amount);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span id={labelId} className="shrink-0 text-sm font-semibold text-ink/60">
          Nagroda
        </span>
        <div role="radiogroup" aria-labelledby={labelId} className="grid flex-1 grid-cols-5 gap-1 rounded-2xl bg-paper-deep p-1">
          <button type="button" role="radio" aria-checked={!custom && value === null} onClick={() => pick(null)} className={optionClass(!custom && value === null)}>
            brak
          </button>
          {REWARD_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              role="radio"
              aria-checked={!custom && value === preset}
              onClick={() => pick(preset)}
              className={optionClass(!custom && value === preset)}
            >
              {zl(preset)}
            </button>
          ))}
          <button type="button" role="radio" aria-checked={custom} onClick={() => setCustom(true)} className={optionClass(custom)}>
            inna
          </button>
        </div>
      </div>
      {custom && (
        <label className="flex items-center justify-end gap-2 text-sm font-semibold text-ink/60">
          Własna kwota
          <input
            type="number"
            inputMode="numeric"
            aria-label="Własna kwota nagrody w złotych"
            min={1}
            max={REWARD_MAX}
            step={1}
            // Pole pojawia się po stuknięciu „inna”, więc od razu czeka na kwotę.
            autoFocus
            value={value ?? ''}
            onChange={(event) => {
              const amount = Math.floor(Number(event.target.value));
              onChange(event.target.value !== '' && amount >= 1 ? Math.min(amount, REWARD_MAX) : null);
            }}
            className="w-24 rounded-xl border-2 border-ink/10 bg-paper px-3 py-2 text-right text-base font-bold text-ink outline-brand"
          />
          zł
        </label>
      )}
    </div>
  );
}
