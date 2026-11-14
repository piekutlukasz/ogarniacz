import { type FamilyMember, PERSON_COLORS, type PersonColor } from '@ogarniacz/shared';

/** Odcienie kolorów osób. Wszystkie są jasne, więc ciemny inicjał jest czytelny w obu motywach. */
export const PERSON_COLOR_VALUES: Record<PersonColor, string> = {
  coral: '#ff8a65',
  blue: '#8aa6ff',
  yellow: '#ffc93c',
  mint: '#5fcca2',
  lilac: '#c7a2ff',
  pink: '#ff94c2',
  sky: '#6fd0ec',
  lime: '#b8de5c',
};

export const PERSON_COLOR_NAMES: Record<PersonColor, string> = {
  coral: 'Koralowy',
  blue: 'Niebieski',
  yellow: 'Żółty',
  mint: 'Miętowy',
  lilac: 'Liliowy',
  pink: 'Różowy',
  sky: 'Błękitny',
  lime: 'Limonkowy',
};

/**
 * Nazwa koloru osoby: wybrany w ustawieniach, a bez wyboru według kolejności w rodzinie
 * (API zwraca ją od najstarszego konta), więc jest taki sam na każdym telefonie.
 */
export function personColorName(family: FamilyMember[], id: string | null): PersonColor | undefined {
  const index = family.findIndex((member) => member.id === id);
  if (index < 0) return undefined;
  return family[index]?.color ?? PERSON_COLORS[index % PERSON_COLORS.length];
}

export function personColor(family: FamilyMember[], id: string | null): string | undefined {
  const name = personColorName(family, id);
  return name && PERSON_COLOR_VALUES[name];
}

type AvatarProps = {
  /** Imię osoby. Bez niego kółko jest przerywane: zadanie dla chętnych. */
  name?: string;
  color?: string;
  done?: boolean;
  size?: 'sm' | 'md';
};

/** Kółko z inicjałem. Ozdobne: imię zawsze stoi obok tekstem. */
export function Avatar({ name, color, done = false, size = 'md' }: AvatarProps) {
  const sizeClass = size === 'sm' ? 'size-7 text-xs' : 'size-9 text-sm';

  if (!name) {
    return (
      <span
        aria-hidden="true"
        className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full border-2 border-dashed border-ink/25 font-bold text-ink/40`}
      >
        ?
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: color ?? '#d9cdb8' }}
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full font-extrabold text-avatar-ink`}
    >
      {done ? (
        <svg viewBox="0 0 24 24" className="size-5 animate-pop" fill="none" stroke="currentColor" strokeWidth={3}>
          <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        name.trim().charAt(0).toUpperCase()
      )}
    </span>
  );
}
