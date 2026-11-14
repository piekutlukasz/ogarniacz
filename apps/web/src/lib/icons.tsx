import type { ReactNode } from 'react';

function Icon({ children, className = 'size-6' }: { children: ReactNode; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** Kalendarz z zaznaczonym dniem. */
export const TodayIcon = () => (
  <Icon>
    <rect x="4" y="5" width="16" height="16" rx="2.5" />
    <path d="M16 3v4M8 3v4M4 11h16" />
    <rect x="8" y="15" width="3" height="3" rx="0.5" />
  </Icon>
);

/** Whiteboard na statywie. */
export const BoardIcon = () => (
  <Icon>
    <rect x="3" y="3.5" width="18" height="11" rx="1.5" />
    <path d="M6.5 7.5h6M6.5 10.5h9M12 14.5V18M8 21l4-3 4 3" />
  </Icon>
);

export const RepeatIcon = () => (
  <Icon>
    <path d="M4 11V9a3 3 0 0 1 3-3h12l-3-3M20 13v2a3 3 0 0 1-3 3H5l3 3" />
  </Icon>
);

export const ArchiveIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="4.5" rx="1.5" />
    <path d="M5 8.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5M10 12.5h4" />
  </Icon>
);

/** Skarbonka-świnka. */
export const PiggyIcon = () => (
  <Icon>
    <path d="M16 3v3.8A6 6 0 0 1 18.7 10H20a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-1.3a6 6 0 0 1-1.7 2.5V18.5a1.5 1.5 0 0 1-3 0V18a6 6 0 0 1-1 .1h-4a6 6 0 0 1-1-.1v.5a1.5 1.5 0 0 1-3 0v-2A6 6 0 0 1 9 5h2.5z" />
    <path d="M15 11v.01M8.5 8.5h3" />
  </Icon>
);

export const CartIcon = () => (
  <Icon>
    <path d="M3 4h2.2l2.1 10.4a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.1" />
    <circle cx="9.5" cy="19.5" r="1.3" />
    <circle cx="17" cy="19.5" r="1.3" />
  </Icon>
);

// Ikony menu ustawień: mniejsze niż w pasku nawigacji.
const MENU_ICON = 'size-5';

/** Paleta malarska: wygląd i kolor. */
export const PaletteIcon = () => (
  <Icon className={MENU_ICON}>
    <path d="M12 21a9 9 0 1 1 9-9c0 2.2-1.8 3.5-3.8 3.5H15a1.8 1.8 0 0 0-1.3 3.1A1.5 1.5 0 0 1 12 21z" />
    <circle cx="7.5" cy="11" r="1" />
    <circle cx="11" cy="7" r="1" />
    <circle cx="16" cy="8.5" r="1" />
  </Icon>
);

export const BellIcon = () => (
  <Icon className={MENU_ICON}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" />
  </Icon>
);

export const LockIcon = () => (
  <Icon className={MENU_ICON}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </Icon>
);

/** Dwie osoby: rodzina. */
export const PeopleIcon = () => (
  <Icon className={MENU_ICON}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20a6 6 0 0 1 12 0M15.5 5a3 3 0 0 1 0 6M18 14.5a5.5 5.5 0 0 1 3 5.5" />
  </Icon>
);

export const CalendarIcon = () => (
  <Icon className={MENU_ICON}>
    <rect x="4" y="5" width="16" height="16" rx="2.5" />
    <path d="M16 3v4M8 3v4M4 11h16" />
  </Icon>
);

export const ChevronRightIcon = () => (
  <Icon className="size-4.5">
    <path d="M9 6l6 6-6 6" />
  </Icon>
);

export const ChevronLeftIcon = () => (
  <Icon className="size-5">
    <path d="M15 6l-6 6 6 6" />
  </Icon>
);
