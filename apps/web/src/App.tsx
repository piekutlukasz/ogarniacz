import type { User } from '@ogarniacz/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { AllowanceScreen } from './features/allowance/AllowanceScreen';
import { ME_KEY, cacheMe, fetchMe, logOut } from './features/auth/api';
import { LoginScreen } from './features/auth/LoginScreen';
import { detachPushFromAccount } from './features/notifications/api';
import { DemoBanner } from './features/demo/DemoBanner';
import { takeInviteToken } from './features/family/api';
import { InviteScreen } from './features/family/InviteScreen';
import { RecurrenceScreen } from './features/recurrences/RecurrenceScreen';
import { SETUP_KEY, fetchSetupNeeded } from './features/setup/api';
import { SetupScreen } from './features/setup/SetupScreen';
import { useShoppingAutoSync } from './features/shopping/api';
import { ShoppingScreen } from './features/shopping/ShoppingScreen';
import { forgetShopping } from './features/shopping/sync';
import { ArchiveView } from './features/tasks/ArchiveView';
import { TaskBoard } from './features/tasks/TaskBoard';
import { SettingsSheet } from './features/settings/SettingsSheet';
import { useFamily } from './features/tasks/api';
import { TodayScreen } from './features/today/TodayScreen';
import { Avatar, personColor } from './lib/Avatar';
import { BoardIcon, CartIcon, PiggyIcon, RepeatIcon, TodayIcon } from './lib/icons';

const SCREENS = [
  { id: 'today', label: 'Dziś' },
  { id: 'board', label: 'Tablica' },
  { id: 'shopping', label: 'Zakupy' },
  { id: 'recurring', label: 'Cykliczne', parentOnly: true },
  { id: 'allowance', label: 'Kieszonkowe' },
] as const;
type Tab = (typeof SCREENS)[number]['id'];
/** Ekran z adresu `/?ekran=zakupy`, który otwiera kliknięcie powiadomienia. */
function screenFromLink(user: User, value: string | null): Tab | undefined {
  const tab = SCREENS.find((item) => item.id === value);
  return tab && !('parentOnly' in tab && user.role !== 'parent') ? tab.id : undefined;
}

/** Archiwum nie ma zakładki: wchodzi się do niego z tablicy. */
type Screen = Tab | 'archive';

const SCREEN_ICONS: Record<Tab, ReactNode> = {
  today: <TodayIcon />,
  board: <BoardIcon />,
  shopping: <CartIcon />,
  recurring: <RepeatIcon />,
  allowance: <PiggyIcon />,
};

// Token z linku czytamy raz, przy wczytaniu modułu: StrictMode wywołuje inicjalizatory stanu dwa razy,
// a odczyt sprząta adres, więc drugi raz tokenu już by nie znalazł.
const linkedInviteToken = takeInviteToken();

export function App() {
  const queryClient = useQueryClient();
  const meQuery = useQuery({ queryKey: ME_KEY, queryFn: fetchMe, staleTime: Number.POSITIVE_INFINITY });

  const setUser = (user: User | null) => {
    // Dane poprzedniej osoby nie mogą zostać w pamięci po zmianie konta.
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_KEY[0] });
    queryClient.setQueryData(ME_KEY, user);
    cacheMe(user);
  };

  const [settingsOpen, setSettingsOpen] = useState(false);
  // Po kreatorze pierwszego uruchomienia ustawienia otwierają się od razu na „Rodzinie”.
  const [settingsStart, setSettingsStart] = useState<'family' | undefined>();
  const [inviteToken, setInviteToken] = useState(linkedInviteToken);
  // Link otwarty, gdy aplikacja już działa w tej karcie, zmienia tylko część po `#`.
  useEffect(() => {
    const onHashChange = () => {
      const token = takeInviteToken();
      if (token) {
        setSettingsOpen(false);
        setInviteToken(token);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  const logout = useMutation({
    mutationFn: async () => {
      // Dopóki sesja trwa, serwer może zapomnieć ten telefon: powiadomienia tej osoby nie trafią do następnej.
      await detachPushFromAccount();
      await logOut();
    },
    onSettled: async () => {
      // Wylogowanie świadomie usuwa z telefonu kopię listy zakupów i niewysłane zmiany.
      await forgetShopping();
      setSettingsOpen(false);
      setUser(null);
    },
  });

  const user = meQuery.data;
  // Kreator pierwszego uruchomienia zamiast logowania, gdy baza nie ma kont. Pytamy tylko bez zalogowanej osoby.
  const setupQuery = useQuery({ queryKey: SETUP_KEY, queryFn: fetchSetupNeeded, enabled: meQuery.isSuccess && !user, retry: false });

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="mb-5 flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
          <img src="/icons/logo.svg" alt="" aria-hidden="true" className="size-8 rounded-[22%]" />
          Ogarniacz
        </h1>
        {user && <SettingsButton user={user} onOpen={() => setSettingsOpen(true)} />}
      </header>
      <DemoBanner />
      {user && (
        <SettingsSheet
          user={user}
          open={settingsOpen}
          onClose={() => {
            setSettingsOpen(false);
            setSettingsStart(undefined);
          }}
          onLogOut={() => logout.mutate()}
          loggingOut={logout.isPending}
          startPage={settingsStart}
        />
      )}
      <main className="flex-1">
        {meQuery.isPending && <p className="text-ink/60">Wczytuję…</p>}
        {meQuery.isError && (
          <p role="alert" className="rounded-xl bg-red-100 px-3 py-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">
            Nie udało się połączyć z serwerem. Sprawdź internet i odśwież aplikację.
          </p>
        )}
        {meQuery.isSuccess &&
          (inviteToken ? (
            <InviteScreen
              token={inviteToken}
              user={user ?? null}
              onLogOut={() => logout.mutateAsync()}
              onFinish={(accepted) => {
                setInviteToken(undefined);
                if (accepted) setUser(accepted);
              }}
            />
          ) : user ? (
            <Home user={user} />
          ) : setupQuery.isPending ? (
            <p className="text-ink/60">Wczytuję…</p>
          ) : setupQuery.data ? (
            <SetupScreen
              onDone={(created) => {
                setUser(created);
                queryClient.setQueryData(SETUP_KEY, false);
                // Następny krok to zaproszenie pozostałych osób.
                setSettingsStart('family');
                setSettingsOpen(true);
              }}
            />
          ) : (
            <LoginScreen onLoggedIn={setUser} />
          ))}
      </main>
    </div>
  );
}

/** Imię w nagłówku otwiera ustawienia: motyw, kolor osoby i wylogowanie. */
function SettingsButton({ user, onOpen }: { user: User; onOpen: () => void }) {
  const family = useFamily().data ?? [];
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={`Ustawienia, ${user.name}`}
      className="flex items-center gap-2 rounded-full bg-card py-1 pr-3.5 pl-1 text-sm font-semibold shadow-card transition-transform active:scale-95"
    >
      <Avatar size="sm" name={user.name} color={personColor(family, user.id)} />
      <span>{user.name}</span>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 text-ink/50" fill="none" stroke="currentColor" strokeWidth={2.5}>
        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function Home({ user }: { user: User }) {
  const [screen, setScreen] = useState<Screen>(() => {
    const params = new URLSearchParams(window.location.search);
    const linked = screenFromLink(user, params.get('ekran'));
    // Adres po otwarciu z powiadomienia sprzątamy, żeby odświeżenie nie wracało na ten sam ekran.
    if (params.has('ekran')) window.history.replaceState(null, '', window.location.pathname);
    return linked ?? 'today';
  });
  useShoppingAutoSync(user.id);

  // Kliknięcie powiadomienia przy otwartej aplikacji: service worker podaje ekran wiadomością.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'open-screen') return;
      const linked = screenFromLink(user, typeof event.data.screen === 'string' ? event.data.screen : null);
      if (linked) setScreen(linked);
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, [user]);

  return (
    // Dolny margines robi miejsce na pasek nawigacji przypięty do dołu ekranu.
    <div className="flex flex-col gap-4 pb-24">
      {screen === 'today' && <TodayScreen user={user} onOpenShopping={() => setScreen('shopping')} />}
      {screen === 'board' && <TaskBoard user={user} onOpenArchive={() => setScreen('archive')} />}
      {screen === 'shopping' && <ShoppingScreen user={user} />}
      {screen === 'recurring' && user.role === 'parent' && <RecurrenceScreen />}
      {screen === 'archive' && <ArchiveView user={user} onBack={() => setScreen('board')} />}
      {screen === 'allowance' && <AllowanceScreen user={user} />}

      {/* Pasek przy kciuku, jak w aplikacjach na telefon. Nad nim zostaje odstęp na pasek systemowy iPhone'a. */}
      <nav
        aria-label="Ekrany"
        className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex gap-1 rounded-3xl border border-card-edge bg-chrome p-1.5 shadow-lift">
          {SCREENS.filter((item) => !('parentOnly' in item) || user.role === 'parent').map(({ id, label }) => {
            const isCurrent = screen === id || (id === 'board' && screen === 'archive');
            return (
              <button
                key={id}
                type="button"
                aria-label={label}
                aria-current={isCurrent ? 'page' : undefined}
                onClick={() => setScreen(id)}
                // Same ikony, więc wszystkie zakładki mają równą szerokość. Nazwę czytają czytniki ekranu.
                className={`flex h-12 flex-1 items-center justify-center rounded-[1.1rem] transition-colors ${
                  isCurrent ? 'bg-chrome-active-bg text-chrome-active' : 'text-on-chrome/70 active:text-on-chrome'
                }`}
              >
                {SCREEN_ICONS[id]}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
