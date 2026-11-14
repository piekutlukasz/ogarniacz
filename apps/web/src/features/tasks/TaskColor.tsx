import { TASK_COLORS, type TaskColor } from '@ogarniacz/shared';
import { useId } from 'react';

export const TASK_COLOR_NAMES: Record<TaskColor, string> = {
  coral: 'Koralowy',
  yellow: 'Żółty',
  mint: 'Miętowy',
  sky: 'Błękitny',
  lilac: 'Liliowy',
  pink: 'Różowy',
};

// Pełne nazwy klas, bo Tailwind szuka ich w kodzie jako tekstu. Wartości są w `@theme` w index.css.
const CARD_CLASS: Record<TaskColor, { open: string; done: string }> = {
  coral: { open: 'bg-task-coral', done: 'bg-task-coral/60' },
  yellow: { open: 'bg-task-yellow', done: 'bg-task-yellow/60' },
  mint: { open: 'bg-task-mint', done: 'bg-task-mint/60' },
  sky: { open: 'bg-task-sky', done: 'bg-task-sky/60' },
  lilac: { open: 'bg-task-lilac', done: 'bg-task-lilac/60' },
  pink: { open: 'bg-task-pink', done: 'bg-task-pink/60' },
};

const SWATCH_CLASS: Record<TaskColor, string> = {
  coral: 'bg-swatch-coral',
  yellow: 'bg-swatch-yellow',
  mint: 'bg-swatch-mint',
  sky: 'bg-swatch-sky',
  lilac: 'bg-swatch-lilac',
  pink: 'bg-swatch-pink',
};

/**
 * Tło karteczki. Zaległa bez koloru dostaje ostrzegawcze tło, a kolorowa zachowuje swój kolor:
 * o zaległości mówią i tak obwódka oraz napis „Zaległe”.
 */
export function cardBackground(color: TaskColor | null, { done, overdue }: { done: boolean; overdue: boolean }): string {
  if (color) return done ? CARD_CLASS[color].done : CARD_CLASS[color].open;
  if (overdue) return 'bg-overdue';
  return done ? 'bg-card/60' : 'bg-card';
}

type ColorPickerProps = { value: TaskColor | null; onChange: (value: TaskColor | null) => void };

const swatchClass = (selected: boolean) =>
  `flex size-8 shrink-0 items-center justify-center rounded-full text-avatar-ink transition-transform active:scale-90 ${
    selected ? 'ring-2 ring-ink ring-offset-2 ring-offset-card' : ''
  }`;

function Check() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 animate-pop" fill="none" stroke="currentColor" strokeWidth={3}>
      <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Wybór koloru karteczki: bez koloru albo jeden z palety. Kolor widzi cała rodzina. */
export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const labelId = useId();

  return (
    <div className="flex items-center gap-2">
      <span id={labelId} className="shrink-0 text-sm font-semibold text-ink/60">
        Kolor
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="flex flex-1 items-center justify-between gap-1 px-1 py-1">
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          aria-label="Bez koloru"
          onClick={() => onChange(null)}
          className={`${swatchClass(value === null)} border-2 border-dashed border-ink/25 bg-card text-ink`}
        >
          {value === null && <Check />}
        </button>
        {TASK_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={value === color}
            aria-label={TASK_COLOR_NAMES[color]}
            onClick={() => onChange(color)}
            className={`${swatchClass(value === color)} ${SWATCH_CLASS[color]}`}
          >
            {value === color && <Check />}
          </button>
        ))}
      </div>
    </div>
  );
}
