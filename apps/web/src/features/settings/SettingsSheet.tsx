import { PERSON_COLORS, type User } from '@ogarniacz/shared';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Avatar, PERSON_COLOR_NAMES, PERSON_COLOR_VALUES, personColor, personColorName } from '../../lib/Avatar';
import { ErrorNote } from '../../lib/ErrorNote';
import { BellIcon, CalendarIcon, ChevronLeftIcon, ChevronRightIcon, LockIcon, PaletteIcon, PeopleIcon } from '../../lib/icons';
import { type Look, type ThemePreference, useLook, useThemePreference } from '../../lib/theme';
import { PasswordSection } from '../account/PasswordSection';
import { useCalendars } from '../calendars/api';
import { CalendarsPage } from '../calendars/CalendarsPage';
import { useDemoInfo } from '../demo/api';
import { useInvites } from '../family/api';
import { AuthLogPage, FamilyPage } from '../family/FamilyPage';
import { NotificationsSection, pushDeviceSummary, usePushDevice } from '../notifications/NotificationsSection';
import { useFamily } from '../tasks/api';
import { useUpdateMe } from './api';

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Jak w telefonie' },
  { value: 'light', label: 'Jasny' },
  { value: 'dark', label: 'Ciemny' },
];

const LOOKS: { value: Look; label: string }[] = [
  { value: 'fridge', label: 'Lodówka' },
  { value: 'forest', label: 'Wieczorny las' },
  { value: 'stickers', label: 'Naklejki' },
];

/** Podstrony arkusza. Menu to strona startowa, a dziennik logowań leży pod „Rodziną”. */
type SubPage = 'look' | 'notifications' | 'password' | 'family' | 'log' | 'calendars';
type Page = 'menu' | SubPage;

const TITLES: Record<SubPage, string> = {
  look: 'Wygląd i kolor',
  notifications: 'Powiadomienia',
  password: 'Hasło i urządzenia',
  family: 'Rodzina',
  log: 'Dziennik logowań',
  calendars: 'Kalendarze',
};

const BACK: Record<SubPage, Page> = {
  look: 'menu',
  notifications: 'menu',
  password: 'menu',
  family: 'menu',
  log: 'family',
  calendars: 'menu',
};

function people(count: number): string {
  if (count === 1) return '1 osoba';
  const lastTwo = count % 100;
  const last = count % 10;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? `${count} osoby` : `${count} osób`;
}

type SettingsSheetProps = {
  user: User;
  open: boolean;
  onClose: () => void;
  onLogOut: () => void;
  loggingOut: boolean;
  /** Podstrona otwierana od razu zamiast menu; po kreatorze pierwszego uruchomienia to „Rodzina”. */
  startPage?: 'family';
};

/**
 * Ustawienia osoby wysuwane od dołu: krótkie menu, a w nim podstrony w tym samym arkuszu. Menu mieści się
 * na ekranie bez przewijania i przy każdej pozycji pokazuje jej stan, więc szczegóły otwiera się tylko w razie
 * potrzeby. Natywny <dialog> daje pułapkę fokusu, Escape i tło za arkuszem; Escape na podstronie cofa.
 */
export function SettingsSheet({ user, open, onClose, onLogOut, loggingOut, startPage }: SettingsSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState<Page>('menu');
  // Po zmianie strony fokus idzie na jej nagłówek, a po powrocie do menu na pozycję, z której się wyszło.
  const focusAfterChange = useRef<string | null>(null);
  const [look] = useLook();
  const family = useFamily().data ?? [];
  const isParent = user.role === 'parent';
  const demo = useDemoInfo().data;
  const push = usePushDevice(open);
  const calendars = useCalendars(isParent && open).data ?? [];
  const pendingInvites = useInvites(isParent && open).data?.length ?? 0;
  const failingCalendars = calendars.filter((calendar) => calendar.error).length;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      if (startPage) {
        focusAfterChange.current = 'heading';
        setPage(startPage);
      }
    }
    if (!open && dialog.open) dialog.close();
    // Zamknięcie wraca do menu, a odmontowane podstrony zapominają formularze z hasłem i link z tokenem.
    if (!open) setPage('menu');
  }, [open, startPage]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const target = focusAfterChange.current;
    if (!dialog || !target) return;
    focusAfterChange.current = null;
    dialog.scrollTop = 0;
    dialog.querySelector<HTMLElement>(`[data-focus="${target}"]`)?.focus();
  }, [page]);

  const go = (next: Page) => {
    const back = page !== 'menu' && BACK[page] === next;
    focusAfterChange.current = back ? `row-${page}` : 'heading';
    setPage(next);
  };

  const menu: MenuItem[] = [
    { page: 'look', icon: <PaletteIcon />, label: TITLES.look, value: LOOKS.find((item) => item.value === look)?.label },
    ...(push.available ? [{ page: 'notifications' as const, icon: <BellIcon />, label: TITLES.notifications, value: pushDeviceSummary(push.device) }] : []),
    // W demo konta są wspólne, więc hasła nie zmienia się wcale.
    ...(demo ? [] : [{ page: 'password' as const, icon: <LockIcon />, label: TITLES.password }]),
  ];
  const homeMenu: MenuItem[] = isParent
    ? [
        {
          page: 'family',
          icon: <PeopleIcon />,
          label: TITLES.family,
          value: [people(family.length), pendingInvites > 0 ? `zaproszenia: ${pendingInvites}` : null].filter(Boolean).join(' · '),
        },
        {
          page: 'calendars',
          icon: <CalendarIcon />,
          label: TITLES.calendars,
          value: calendars.length === 0 ? 'Brak' : failingCalendars > 0 ? `Problem: ${failingCalendars}` : String(calendars.length),
          warning: failingCalendars > 0,
        },
      ]
    : [];

  return (
    <dialog
      ref={dialogRef}
      aria-label="Ustawienia"
      onClose={onClose}
      onCancel={(event) => {
        if (page === 'menu') return;
        event.preventDefault();
        go(BACK[page]);
      }}
      // Stuknięcie w przyciemnione tło trafia w sam <dialog>, nie w jego treść.
      onClick={(event) => event.target === event.currentTarget && onClose()}
      className="mx-auto mt-auto mb-0 max-h-[90dvh] w-full max-w-xl rounded-t-3xl bg-paper p-0 text-ink shadow-lift backdrop:bg-black/40 open:animate-[sheet-in_220ms_ease-out]"
    >
      <div className="flex flex-col gap-5 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <span aria-hidden="true" className="mx-auto h-1.5 w-10 rounded-full bg-ink/15" />

        {page === 'menu' ? (
          <>
            <div className="flex items-center gap-3">
              <Avatar name={user.name} color={personColor(family, user.id)} />
              <div className="min-w-0 flex-1">
                <h2 className="text-xl leading-tight font-extrabold">Ustawienia</h2>
                <p className="text-sm text-ink/55">{user.name}</p>
              </div>
              <CloseButton onClose={onClose} />
            </div>

            <Menu label={isParent ? 'Ty' : undefined} items={menu} onOpen={go} />
            {homeMenu.length > 0 && <Menu label="Dom" items={homeMenu} onOpen={go} />}

            <button
              type="button"
              onClick={onLogOut}
              disabled={loggingOut}
              className="rounded-xl border-2 border-ink/10 px-4 py-3 font-bold text-brand disabled:opacity-60"
            >
              Wyloguj
            </button>
          </>
        ) : (
          <SubPageFrame title={TITLES[page]} backLabel={BACK[page] === 'menu' ? 'Ustawienia' : TITLES[BACK[page] as SubPage]} onBack={() => go(BACK[page])} onClose={onClose}>
            {page === 'look' && <LookPage user={user} />}
            {page === 'notifications' && <NotificationsSection push={push} />}
            {page === 'password' && <PasswordSection user={user} open={open} />}
            {page === 'family' && <FamilyPage user={user} onOpenLog={() => go('log')} />}
            {page === 'log' && <AuthLogPage />}
            {page === 'calendars' && <CalendarsPage />}
          </SubPageFrame>
        )}
      </div>
    </dialog>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Zamknij ustawienia"
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-paper-deep text-lg text-ink/70"
    >
      ×
    </button>
  );
}

type MenuItem = { page: SubPage; icon: ReactNode; label: string; value?: string; warning?: boolean };

/** Grupa pozycji menu: jedna karta z wierszami. Nazwa pozycji i jej stan tworzą razem nazwę przycisku. */
function Menu({ label, items, onOpen }: { label?: string; items: MenuItem[]; onOpen: (page: SubPage) => void }) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={label ? labelId : undefined} className="flex flex-col gap-1.5">
      {label && (
        <p id={labelId} className="px-1 text-[0.8125rem] font-bold text-ink/55">
          {label}
        </p>
      )}
      <ul className="overflow-hidden rounded-2xl bg-card shadow-card">
        {items.map((item) => (
          <li key={item.page} className="border-ink/10 not-last:border-b">
            <button
              type="button"
              data-focus={`row-${item.page}`}
              onClick={() => onOpen(item.page)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-paper-deep"
            >
              <span className="text-ink/60">{item.icon}</span>
              <span className="min-w-0 flex-1 font-bold">{item.label}</span>
              {item.value && (
                <span className={`truncate text-sm ${item.warning ? 'font-bold text-brand' : 'font-semibold text-ink/55'}`}>{item.value}</span>
              )}
              <span className="text-ink/35">
                <ChevronRightIcon />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ramka podstrony: powrót, tytuł i zamknięcie całego arkusza. */
function SubPageFrame({
  title,
  backLabel,
  onBack,
  onClose,
  children,
}: {
  title: string;
  backLabel: string;
  onBack: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={`Wróć: ${backLabel}`}
          className="-ml-2 flex min-w-0 flex-1 items-center gap-0.5 self-stretch rounded-xl py-1 pr-2 text-left text-sm font-bold text-ink/60"
        >
          <ChevronLeftIcon />
          <span className="truncate">{backLabel}</span>
        </button>
        <CloseButton onClose={onClose} />
      </div>
      <h2 id={titleId} tabIndex={-1} data-focus="heading" className="-mt-2 text-xl leading-tight font-extrabold outline-none">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Wygląd i tryb dotyczą tylko tego telefonu, a kolor widzi cała rodzina. */
function LookPage({ user }: { user: User }) {
  const [theme, setTheme] = useThemePreference();
  const [look, setLook] = useLook();
  const family = useFamily().data ?? [];
  const updateMe = useUpdateMe();
  const myColor = personColorName(family, user.id);
  const hasOwnColor = family.find((member) => member.id === user.id)?.color != null;

  return (
    <div className="flex flex-col gap-6">
      <Group title="Na tym telefonie">
        <Segmented label="Wygląd" options={LOOKS} value={look} onChange={setLook} />
        <Segmented label="Tryb" options={THEMES} value={theme} onChange={setTheme} />
      </Group>

      <Group title="Mój kolor" hint="Tak cała rodzina widzi Twoje zadania na tablicy.">
        <div role="radiogroup" aria-label="Mój kolor" className="grid grid-cols-8 gap-2">
          {PERSON_COLORS.map((color) => {
            const selected = myColor === color;
            return (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={PERSON_COLOR_NAMES[color]}
                onClick={() => updateMe.mutate({ color })}
                style={{ backgroundColor: PERSON_COLOR_VALUES[color] }}
                className={`flex aspect-square items-center justify-center rounded-full text-avatar-ink shadow-card transition-transform active:scale-95 ${
                  selected ? 'ring-3 ring-ink ring-offset-2 ring-offset-paper' : ''
                }`}
              >
                {selected && (
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 animate-pop" fill="none" stroke="currentColor" strokeWidth={3}>
                    <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
        {hasOwnColor && (
          <button
            type="button"
            onClick={() => updateMe.mutate({ color: null })}
            className="self-start text-sm font-semibold text-ink/55 underline underline-offset-2"
          >
            Przywróć kolor domyślny
          </button>
        )}
        {updateMe.isError && <ErrorNote error={updateMe.error} />}
      </Group>
    </div>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="font-extrabold">{title}</h3>
        {hint && <p className="text-sm text-ink/55">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span aria-hidden="true" className="text-[0.8125rem] font-semibold text-ink/55">
        {label}
      </span>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-1 rounded-2xl bg-paper-deep p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={`rounded-xl px-1 py-2 text-[0.8125rem] font-bold transition ${value === option.value ? 'bg-card shadow-card' : 'text-ink/55'}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
