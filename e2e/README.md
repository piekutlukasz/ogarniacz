# Testy e2e

Playwright na dwóch telefonach (iPhone 15, Pixel 7) przeciw własnemu `npm run dev` z osobną bazą `apps/api/data/e2e.db`.

Testy zawsze startują swój serwer na portach 5180 (front) i 3080 (API), innych niż w zwykłym `npm run dev`, więc można je uruchomić obok serwera deweloperskiego. Jeśli któryś z tych portów jest zajęty, np. przez testy w innym worktree, uruchomienie kończy się błędem.

```bash
npm run test:e2e
```

## Test dymny

`npm run test:smoke` (po `npm run build`) uruchamia zbudowaną aplikację tak jak na produkcji: `src/setup/smokeServer.mjs` startuje `node dist/index.cjs` na porcie 3090 z jednorazową bazą i jednym kontem (`SMOKE_USER`), a po testach usuwa bazę. Konfiguracja to `playwright.smoke.config.ts`, scenariusze są w `smoke/`. Sprawdza to, czego serwer Vite nie pokaże: service worker, start bez sieci, CSP i nagłówki pamięci podręcznej. Scenariusze importują `test` z `@playwright/test`, bo nie ma tu aktorów ani projektu `setup`; page objecty są te same.

Ta sama konfiguracja startuje drugi serwer w trybie demo (`SMOKE_DEMO=true`, port 3091, `DEMO_MODE=true`), który sam wgrywa dane przykładowe. Jego scenariusze są w `smoke/demo.spec.ts` i biegną tylko w projektach `demo-iphone` i `demo-android` (pozostałe pliki tylko w `iphone` i `android`). Konta przykładowe to `DEMO_PARENT`, `DEMO_SECOND_PARENT` i `DEMO_CHILD` z `src/data/users.ts`; oba projekty dzielą jedną bazę, więc scenariusze demo niczego nie zmieniają. `LoginPage.enterDemoAs(osoba)` wchodzi przyciskiem „Wejdź jako…”, `LoginPage.demoChooser` to wybór kont, a `AppShell.demoBanner` to baner „Wersja demonstracyjna”. Reset demo o pełnej godzinie wylogowuje wszystkich, więc test, który na niego trafi, przechodzi w CI dopiero przy ponownej próbie.

Kreator pierwszego uruchomienia ma dwa kolejne serwery z pustą bazą (`SMOKE_EMPTY=true`, porty 3092 i 3093), po jednym na projekt `setup-iphone` i `setup-android`, bo kod działa raz na start serwera, a po założeniu konta kreator znika. `smokeServer.mjs` wyłuskuje kod z logu serwera i zapisuje go do pliku z `src/setup/setupCode.mjs` (`setupCodeFile(port)`), skąd czyta go scenariusz w `smoke/setup.spec.ts`. Scenariusz nie ma ponownej próby, bo druga trafiłaby na bazę z kontem. Page object kreatora to `SetupPage` (`heading`, `submit()`, `createParent()`, `codeInput`, `alert`), a zakładane konto to `SETUP_PARENT` z `src/data/users.ts`.

## Struktura

```
src/
  data/        konta testowe, daty w strefie Warszawy, unikalne nazwy zadań
  api/         ApiClient: przygotowanie danych przez API (arrange)
  components/  fragmenty ekranu: AppShell, SettingsSheet, CalendarsPage, FamilyPage, TaskCard, RecurrenceCard, ShoppingRow
  pages/       page objecty: LoginPage, InvitePage, SetupPage, App i ekrany (Dziś, Tablica, Zakupy, Cykliczne, Kieszonkowe, Archiwum)
  fixtures/    `test` z fixture'ami `app`, `loginPage`, `otherDevice`, `parent`, `child`, `colorChild`
  setup/       zakładanie kont testowych w bazie e2e (`seedUsers`, `resetUser`) i serwer plików ICS (`icsServer.mjs`), serwer testu dymnego (`smokeServer.mjs`)
tests/
  auth.setup.ts  projekt `setup`: zakłada konta i zapisuje ich sesje do `.auth/`
  *.spec.ts      scenariusze
```

Hierarchia page objectów:

- `Component` → `TaskCard`, `RecurrenceCard`, `ShoppingRow`, `SettingsSheet`, `CalendarsPage`, `FamilyPage`: wszystko szukane wewnątrz jednego `root`.
- `AppShell` to nagłówek i nawigacja. Imię w nagłówku otwiera `SettingsSheet` (`openSettings()`),
  a `logOut()` wylogowuje przez ten panel. Ustawienia to menu z podstronami w jednym arkuszu: `menuItem(tytuł)` to pozycja menu (jej nazwa zaczyna się od tytułu, dalej jest stan), `openPage(tytuł)` wchodzi na podstronę, a `backButton` cofa. Lokatory podstron (`theme()`, `look()`, `color()`, `notifications`, `passwordSection`) działają dopiero po `openPage`. `openCalendars()` otwiera z ustawień podstronę „Kalendarze”, a `openFamily()` podstronę „Rodzina” (obie tylko rodzic); ich `root` to region podstrony w arkuszu „Ustawienia”, a zamyka je `settings.closeButton`. `FamilyPage.invite()` i `passwordResetLink()` zwracają link z tokenem, `accountAction()` sam rozwija konto i wykonuje akcję z potwierdzeniem hasłem, a `authLog` otwiera podstronę dziennika z wpisami w `authLogEntries`. `InvitePage` to ekran otwierany takim linkiem (`open(link)`, `setPassword()`, `acceptAs()`); na drugim telefonie buduje się go z `otherDevice.page`. Podstrona „Hasło i urządzenia” w `SettingsSheet` (`passwordSection`, `changePassword()`, `logoutOthersButton`, `passwordStatus`, `passwordError`) nie istnieje w trybie demo. W `SettingsSheet` pozycja „Powiadomienia” (`notifications`) pojawia się w menu, gdy serwer ma klucze VAPID; testy e2e nie dają zgody ani nie wysyłają push, a serwer testowy dostaje tylko atrapy kluczy. `App.openFromNotification(ekran)` otwiera aplikację tak jak kliknięcie powiadomienia.
- Kolor karteczki wybiera się w grupie radiowej „Kolor” (`BoardPage.colorOptions` i pole `color` w `addTask`, w edytorze `TaskCard.colorOption(nazwa)` i `setColor(nazwa)`). Kolor jest ozdobą bez roli, więc test porównuje tło: `TaskCard.background()` z `BoardPage.plainBackground()`, tłem zwykłej karteczki.
- `Screen` → `TaskListScreen` → `TodayPage`, `BoardPage`, `ArchivePage`; `Screen` → `ShoppingPage`, `RecurrencesPage`, `AllowancePage`.
  Ekran zna swój przycisk w nawigacji i sam się otwiera (`open()`). Archiwum nie ma przycisku w nawigacji:
  `ArchivePage.open()` przechodzi przez tablicę, a `back()` na nią wraca.
- `App` składa ramę i ekrany jednej karty; `Actor` to `App` zalogowanej osoby z własnym `ApiClient`.

## Zasady

- **Importuj `test` i `expect` z `src/fixtures`**, nie z `@playwright/test`.
- **Selektory tylko w page objectach.** Testy mówią językiem domeny (`board.addTask`, `task.start()`),
  a sprawdzają przez `expect(card.root)` i publiczne lokatory.
- **Lokatory po roli i etykiecie** (`getByRole`, `getByLabel`), tak jak widzi je czytnik ekranu.
- **Aktorzy zamiast przelogowywania.** `parent` i `child` mają osobne konteksty przeglądarki z zapisaną
  sesją, więc w jednym teście działają naraz. **Nie wylogowuj aktora**: wylogowanie usuwa sesję na serwerze,
  a dzielą ją wszystkie testy. Logowanie i wylogowanie sprawdzaj przez `loginPage` na świeżej karcie.
- **Przygotowanie przez API, sprawdzanie przez UI.** Gdy test nie sprawdza tworzenia zadania,
  tworzy je przez `actor.api`, a przez interfejs przechodzi tylko scenariusz, o który chodzi.
- **Każdy test na własnych danych.** Baza nie jest czyszczona, a testy biegną równolegle,
  więc nazwy zadań buduj przez `uniqueTitle()`.
- **Stan konta zmieniaj tylko na koncie projektu.** Ustawienia konta, np. kolor osoby, dzieliłyby
  testy z projektów `iphone` i `android`, które biegną naraz. Taki test używa fixture'a `colorChild`: każdy
  projekt ma w `COLOR_CHILDREN` własne dziecko.
  Motyw jest w `localStorage` kontekstu przeglądarki, więc tego ograniczenia nie ma.
- **Hasło i sesje tylko na kontach z `ACCOUNT_USERS`.** Zmiana hasła i „Wyloguj inne urządzenia” kończą sesje konta,
  więc każdy z tych testów ma w każdym projekcie własne konto. Test zaczyna od `resetUser(konto)`, żeby ponowna próba
  po błędzie nie trafiła na hasło zmienione przez poprzednią. Drugi telefon to fixture `otherDevice`: `LoginPage`
  w osobnym, niezalogowanym kontekście przeglądarki.
- **Hasła kont testowych** nie mogą zawierać loginu ani słów imienia, bo tę regułę egzekwuje także CLI.
- **Konta z zaproszeń wyłączaj po teście.** Rodzina może mieć najwyżej 10 aktywnych kont, a baza e2e ma ich już 8 i nie jest
  czyszczona. Test zaproszeń zakłada konta z loginem `e2e-nowy-<projekt>-…` i wyłącza je przez `api.disableAccounts(prefiks, hasło rodzica)`
  na początku (pozostałości po przerwanych przebiegach) i w `finally`. Nowe stałe konto testowe zmniejsza ten zapas.

## Kalendarze

Playwright startuje drugi serwer, `src/setup/icsServer.mjs` na porcie 5199, który podaje pliki ICS z wydarzeniami na dziś. Tytuł wydarzenia jest w ścieżce, więc `feedUrl(uniqueTitle('Basen'))` (z `src/data/calendars.ts`) daje kalendarz z własnymi danymi testu: wydarzenie 18:00–19:00 o tym tytule i całodniowe „… (cały dzień)”. Serwer testowy API dostaje `CALENDAR_ENCRYPTION_KEY`, `CALENDAR_ALLOWED_HOSTS` z tym adresem i `CALENDAR_ALLOW_HTTP=true`, który na produkcji jest zabroniony.

- Kalendarze są wspólne dla całej rodziny, a baza nie jest czyszczona, więc test odpina swoje kalendarze na końcu (`api.detachCalendar(name)` w `finally`).
- `TodayPage.event(title)` szuka po dokładnym tytule, bo „X (cały dzień)” zawiera „X”.
- Odświeżenie ręczne tuż po dodaniu jest odrzucane (raz na minutę), więc test sprawdza ten komunikat, a nie samo odświeżenie; synchronizację w tle pokrywają testy API.
