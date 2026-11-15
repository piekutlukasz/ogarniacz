# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Ogarniacz to prywatna PWA dla jednej rodziny: zadania, lista zakupów, docelowo kalendarze i powiadomienia. Cały projekt jest po polsku: interfejs, komunikaty błędów API, komentarze, nazwy testów, commity i dokumentacja. Nowy kod trzyma się tej konwencji.

## Komendy

Wymagany Node.js 22.12 lub nowszy (CI i produkcja: 24). Wszystko uruchamiaj z katalogu głównego repozytorium.

| Komenda | Działanie |
|---|---|
| `npm run dev` | Front na `:5173` i API na `:3000`; Vite przekazuje `/api` do API |
| `npm run typecheck` | `tsc --noEmit` we wszystkich paczkach. To jedyna statyczna kontrola: nie ma ESLinta ani Prettiera, formatowanie wyznacza `.editorconfig` |
| `npm test` | Vitest: API i front (`apps/web`: kolejka zakupów `ShoppingSync` z `fake-indexeddb`) |
| `npm run test:e2e` | Playwright na profilach iPhone 15 i Pixel 7, na własnym serwerze (porty 5180 i 3080) |
| `npm run test:smoke` | Test dymny na zbudowanej aplikacji (po `npm run build`): service worker, start bez sieci, CSP; port 3090, tryb demo (wejście jednym przyciskiem, baner) na 3091, kreator pierwszego uruchomienia na 3092 i 3093 (puste bazy); jednorazowe bazy |
| `npm run build` | Front do `apps/api/public`, API do `apps/api/dist` |
| `npm run demo` | Lokalne demo: build, jednorazowa baza z danymi z `apps/api/src/demo.ts`, serwer na `:3000` (`PORT` zmienia port, `-- --no-build` pomija build). Tryb `DEMO_MODE=true` (opis w `docs/instrukcje/DEMO.md`) resetuje bazę co godzinę. Zmiana schematu bazy wymaga aktualizacji seeda i `clearDatabase` w `demo.ts`; pilnuje tego `demo.test.ts` |
| `node scripts/screenshots.mjs [adres]` | Odświeża obrazy w `docs/img` (używane w README) z uruchomionego demo; po zmianie wyglądu ekranów uruchom `npm run demo` i ten skrypt |
| `npm run db:generate` | Nowa migracja po zmianie `apps/api/src/db/schema.ts` |

Pojedynczy test:

```bash
npm test -w @ogarniacz/api -- src/shopping.test.ts -t "fragment nazwy"
npm run test -w @ogarniacz/e2e -- tests/shopping.spec.ts --project=iphone -g "fragment nazwy"
```

W worktree `node_modules` bywa starsze niż `package-lock.json`. Gdy Vite albo testy zgłaszają brak modułu, uruchom `npm ci`.

CI (`.github/workflows/ci.yml`) uruchamia po kolei: `npm audit --omit=dev --audit-level=high`, `typecheck`, `test`, `build`, `test:e2e`, `test:smoke`, a osobno build i start kontenera Docker. Po błędzie e2e ślady Playwright są w artefakcie przebiegu. Przed zgłoszeniem zmiany przejdź tę samą kolejność.

Publicznej rejestracji nie ma. Na pustej bazie aplikacja pokazuje kreator pierwszego uruchomienia z kodem z logu API (`[start] pusta baza, kod pierwszego uruchomienia: …`); trasy `/api/setup` są w `routes/setup.ts`, a kod w `auth/setup.ts`. Zapasowo konto zakłada CLI: `npm run cli -w @ogarniacz/api -- user add --login tata --name Tata --role parent` (hasło z klawiatury albo `--password-stdin`).

## Architektura

Monorepo na npm workspaces:

- `packages/shared`: kontrakt i wspólne reguły. Konsumowane jako źródła TypeScript (`exports` wskazuje `src/index.ts`), bez kroku budowania.
- `apps/api`: Hono, Drizzle na `better-sqlite3`, harmonogram `node-cron`. W produkcji serwuje też zbudowany front.
- `apps/web`: React 19, TanStack Query, Tailwind 4, `vite-plugin-pwa`.
- `e2e`: Playwright w modelu page object.

### Kontrakt w `packages/shared`

Schematy Zod są jedynym źródłem prawdy: API waliduje nimi wejście (`zValidator`), front parsuje nimi każdą odpowiedź (`request(schemat, ścieżka)` w `apps/web/src/lib/http.ts`), a typy powstają przez `z.infer`. Leżą tu też reguły, które muszą dawać ten sam wynik po obu stronach: uprawnienia (`canChangeTask`, `canTakeTask`, `canReleaseTask`), walidacja tytułu, wyliczanie dni reguł cyklicznych, `applyShoppingChange`.

Nowa funkcja przechodzi zwykle tę drogę: schemat w `shared` → trasa w `apps/api/src/routes` → rejestracja w `apps/api/src/app.ts` → `api.ts` w katalogu funkcji frontu → testy API i e2e.

### API

- `createApp({ db, now, ... })` to fabryka bez efektów ubocznych; `index.ts` tylko składa konfigurację, bazę i harmonogram.
- **Kolejność w `app.ts` decyduje o dostępie:** trasy zarejestrowane przed `requireSession` są publiczne. Pilnuje tego `routes.test.ts`: nowa trasa publiczna wymaga dopisania do `PUBLIC_ROUTES`. Zalogowaną osobę daje `c.get('user')`, a `requireRole('parent')` ogranicza trasę do rodzica. Uprawnienia egzekwuje API, nie tylko interfejs (zasady: `docs/PROJEKT.md`, rozdział 6).
- Błąd to `{ error: 'komunikat po polsku' }`. Front pokazuje ten tekst użytkownikowi bez zmian, więc ma być zrozumiały dla domownika. Wejście waliduj przez `validate(cel, schemat)` z `src/validate.ts`, nie gołym `zValidator`: zwraca pierwszy komunikat ze schematu w tej postaci. Nieoczekiwane błędy zamienia `app.onError`.
- API nasłuchuje na `HOST` (domyślnie `127.0.0.1`), a ciało żądania ma limit 100 kB (`MAX_REQUEST_BYTES`).
- `better-sqlite3` jest synchroniczne: zapytania Drizzle kończą się `.get()`, `.all()` albo `.run()`, a transakcja to synchroniczny callback.
- **Czas.** Chwile zapisujemy jako znaczniki UTC, ale dzień (`dueOn`, „dziś”, daty reguł) to tekst `RRRR-MM-DD` w strefie `Europe/Warsaw`, liczony przez `warsawDate` i `addDays` z `shared`. W trasach i zadaniach w tle bierz czas z wstrzykniętego `now()`, nie z `new Date()`: testy sterują nim zegarem.
- **Nic nie kasujemy.** Rekordy dostają `archived_at` (konta: `disabled_at`), a każda zmiana zadania dopisuje w tej samej transakcji wiersz do `task_events`. Wyjątki: odpięty kalendarz traci zaszyfrowany link, bo to poświadczenie, a dziennik logowań `auth_events` jest sprzątany po 90 dniach, bo trzyma adresy IP. Logowanie, blokady i zmiany kont zapisuj przez `recordAuthEvent` (`auth/events.ts`).
- **Konta i hasła (`apps/api/src/auth`, `routes/auth.ts`, `routes/invites.ts`, `routes/users.ts`).** Operacja na koncie (zmiana hasła, zaproszenie, link do nowego hasła, wyłączenie konta) wymaga ponownego podania własnego hasła przez `confirmOwnPassword` z `auth/attempts.ts`: ten sam limit prób co logowanie, a pomyłka to `403`, nigdy `401` (front wylogowałby aplikację). Hasło sprawdza zawsze `passwordProblem` z `shared` (8 znaków, bez loginu i słów imienia), także w CLI. Token zaproszenia ma w bazie tylko skrót, wraca raz, przy utworzeniu, i nie trafia do logów; zły, użyty, wygasły i unieważniony dają ten sam `404`. Zmiany haseł, sesji i kont odpowiadają w `DEMO_MODE` `403`, bo konta demo dzielą goście. Projekt i decyzje: `docs/plany/KONTA.md`.
- **Kalendarze ICS (`apps/api/src/calendars`, `routes/calendars.ts`).** Link jest hasłem: szyfrowany w bazie, nigdy w odpowiedzi API ani w logu (błędy zamieniają się w kody, komunikaty biblioteki sieciowej nie są przekazywane). Pobieranie przechodzi tylko przez `fetchCalendar` (lista hostów, ręczne przekierowania, limity), a parser nie używa `toJSDate()` dla dat i czasu ściennego, bo wynik zależałby od strefy serwera. Projekt i zagrożenia: `docs/archiwum/KALENDARZE-PROJEKT.md`.
- **Jeden proces.** Harmonogram (`jobs/scheduler.ts`) i limit prób logowania żyją w pamięci procesu API. Zadania w tle uruchamiają się przy starcie i cyklicznie, więc muszą być bezpieczne do powtórzenia. Synchronizacja kalendarzy ICS (`calendars/sync.ts`, co 15 minut, każdy kalendarz osobno, z odstępem po błędach) działa tylko z `CALENDAR_ENCRYPTION_KEY` i nigdy w demo. Powiadomienia (`push/jobs.ts`: poranne podsumowanie i przypomnienie o terminie jutro, co 5 minut) działają tylko z kompletem `VAPID_*` i nigdy w demo.
- **Powiadomienia push (`apps/api/src/push`, `routes/push.ts`).** Wysyłka idzie wyłącznie pod adresy znanych usług push (`isKnownPushService`), bo adres subskrypcji podaje klient. Wiersz w `notifications` z unikalnym `dedupe_key` powstaje przed wysyłką, więc restart niczego nie dubluje. Treść powiadomień nie trafia do logów. Klucze VAPID muszą być stałe: zmiana unieważnia subskrypcje na wszystkich telefonach. Obsługa po stronie telefonu to `apps/web/public/push-sw.js`, dołączony do `app-sw.js` przez `importScripts`.

### Migracje

Zmień `schema.ts`, uruchom `npm run db:generate` i dodaj do commita wygenerowany SQL razem z `drizzle/meta`. Migracje wykonują się same przy starcie API, także na produkcji. Tylko dodają kolumny i tabele: cofnięcie wersji na produkcji zakłada, że starszy kod działa na nowszej bazie. Zastosowanej migracji nie edytuj.

### Front

- Nie ma routera: `App.tsx` trzyma bieżący ekran w stanie i rysuje dolny pasek nawigacji. Nowy ekran to wpis w `SCREENS` i katalog w `src/features/<nazwa>/` z `api.ts` (zapytania, klucze, hooki) obok komponentów.
- **Ustawienia** to jeden arkusz `<dialog>` (`features/settings/SettingsSheet.tsx`) z menu i podstronami. Nowe ustawienie to pozycja menu i podstrona (typ `SubPage`, `TITLES`, `BACK`), komponent strony w katalogu funkcji; nie otwieraj drugiego arkusza na pierwszym. Przewijanie tła pod każdym modalnym `<dialog>` blokuje `html:has(dialog:modal)` w `index.css`.
- Odpowiedź `401` staje się `UnauthorizedError`, a globalna obsługa w `main.tsx` czyści dane i pokazuje logowanie. Nie obsługuj jej lokalnie.
- Klucze zapytań mają wspólny początek (np. `TASKS_KEY`), żeby jedna zmiana odświeżała tablicę, archiwum i „Dziś” naraz.
- **Kolory tylko przez nazwane zmienne** z `@theme` w `src/index.css` (`paper`, `ink`, `brand`, `card`, `chrome`…), nigdy wpisane w komponencie. Wartości trybu ciemnego są w dwóch blokach: `:root[data-theme='dark']` i `@media (prefers-color-scheme: dark)`. Zmieniaj oba. Kolor tła powtarzają jeszcze `lib/theme.ts`, `index.html` i manifest w `vite.config.ts`.
- Projektujemy pod telefon: jedna kolumna, `env(safe-area-inset-*)`, elementy dostępne po roli i etykiecie (na tym opierają się testy e2e).
- **CSP** (`secureHeaders` w `apps/api/src/app.ts`) wpuszcza tylko zasoby z tej samej domeny: żadnych skryptów ani arkuszy wpisanych w `index.html`, żadnych zewnętrznych CDN. Skrypt motywu przed pierwszym malowaniem to `public/theme.js`. Wartości `style={…}` w React działają, bo ustawia je JavaScript. CSP działa tylko na zbudowanej aplikacji (`npm run demo`), nie w `npm run dev`.
- Service worker nazywa się `app-sw.js` i tej nazwy nie wolno zmienić: telefony z zainstalowaną aplikacją zostałyby ze starym. W `npm run dev` go nie ma; start bez sieci sprawdza się na `npm run build && npm start`.

### Lista zakupów: jedyny ekran offline

Zakupy nie używają zwykłych mutacji. Każda zmiana przechodzi przez `ShoppingSync` (`apps/web/src/features/shopping/sync.ts`): trafia do kolejki w IndexedDB, od razu na ekran, a na serwer, gdy jest sieć. Z tego wynikają reguły, których trzeba pilnować przy każdej zmianie w tym obszarze:

- Każdą operację da się bezpiecznie wysłać drugi raz: dodanie niesie UUID z telefonu, edycja i odhaczenie czas `changedAt`, czyszczenie listę identyfikatorów.
- Konflikty rozstrzyga serwer w `routes/shopping.ts`: późniejszy `changedAt` wygrywa, osobno dla odhaczenia i osobno dla nazwy z ilością; usunięcie wygrywa zawsze.
- `applyShoppingChange` w `shared` odtwarza na telefonie to, co zrobi serwer. Zmiana zachowania po jednej stronie wymaga zmiany po drugiej.

Pełny opis: `docs/PROJEKT.md`, rozdział 8.

## Testy

**API (Vitest).** Każdy test otwiera świeżą bazę `openDatabase(':memory:', './drizzle')`, składa `createApp({ db, now })` z własnym zegarem i woła `app.request()` z nagłówkiem `Cookie`; odpowiedzi parsuje schematami z `shared`. Ścieżka `./drizzle` jest względna wobec `apps/api`, dlatego testy uruchamiaj przez workspace, jak wyżej.

**E2E (Playwright).** Przed pisaniem testów przeczytaj `e2e/README.md`. Najważniejsze zasady: `test` i `expect` importuj z `src/fixtures`; selektory tylko w page objectach, po roli i etykiecie; `parent` i `child` to aktorzy w osobnych kontekstach i nie wolno ich wylogowywać; dane przygotowuj przez `actor.api`; baza `apps/api/data/e2e.db` nie jest czyszczona, a projekty `iphone` i `android` biegną naraz, więc nazwy buduj przez `uniqueTitle()`.

**Front (Vitest).** Testy jednostkowe w `apps/web/src/**/*.test.ts` biegną w Node z własnym `vitest.config.ts` (bez wtyczek PWA i Tailwind). IndexedDB daje `fake-indexeddb`, a serwer to atrapa `fetch`; stan modułów resetuje `vi.resetModules()`.

**Serwer testów e2e.** Playwright zawsze startuje własny `npm run dev` na portach 5180 (front) i 3080 (API), z bazą `e2e.db`, więc testy można uruchamiać obok serwera deweloperskiego. Porty przekazuje zmiennymi `WEB_PORT` i `PORT`, które czyta `apps/web/vite.config.ts`. Zajęty port kończy testy błędem zamiast użyć cudzego serwera, dlatego dwa worktree nie uruchomią testów e2e jednocześnie. Serwer ma `TEST_CLOCK=true`, więc test przesuwa czas serwera dla swojej osoby przez `actor.setServerTime(chwila)` (nagłówek `X-Test-Now`); na produkcji ta zmienna blokuje start.

## Wdrożenie

- **Merge do `main` to wdrożenie na produkcję.** Po zielonym CI zadanie `promote` przesuwa gałąź `prod`, a instalacje śledzące `prod` same pobierają nową wersję. Pracuj na gałęzi i przez PR; nie pushuj na `main` ani `prod`. Pilnują tego rulesety z `.github/rulesets`: PR do `main` scala się tylko squashem i po zielonych `test` i `container`, bez wymogu zatwierdzenia, a scalić może tylko właściciel. Na PR otwartym dla właściciela włącz auto-merge (`gh pr merge --auto --squash`): scali się sam po zielonym CI, czyli trafi na produkcję bez dodatkowego przeglądu.
- Obie drogi instalacji muszą działać: Docker (`Dockerfile`, `docker-compose.yml`, budowane i uruchamiane w CI) i Node 24 bez Dockera (opis: `docs/instrukcje/WDROZENIE.md`). Repozytorium nie opisuje żadnej konkretnej instalacji ani dostawcy hostingu.
- Z produkcji korzystają prawdziwi użytkownicy, a migracje wykonają się na ich danych przy starcie nowej wersji.

## Dokumentacja i commity

- Mapa dokumentacji i zasady jej utrzymania: `docs/README.md`.
- `docs/PROJEKT.md` opisuje tylko to, co **jest** w kodzie. Plik jest duży, więc czytaj potrzebny rozdział: 2 funkcje i wygląd, 3 architektura, 4 model danych, 5 tabela tras API, 6 role i uprawnienia, 7 push i kalendarze, 8 offline, 9 bezpieczeństwo, 10 hosting, 11 testy, 12 ryzyka.
- Wszystko, co planowane (projekt, kryteria „Gotowe, gdy”, decyzje, odrzucone warianty), mieszka w jednym miejscu: w pliku z `docs/plany/` (np. `KONTA.md`, `UTWARDZENIE.md`). `PROJEKT.md` daje do niego najwyżej jedno zdanie z odnośnikiem, bez kopii szczegółów. `docs/PLAN.md` to tylko przegląd etapów: hasło, stan i odnośnik.
- Zrobione części planu (analizy, notatki z wykonania) przechodzą do `docs/archiwum/`, a to, co opisuje działający kod, do `PROJEKT.md`. Zamknięty etap przenosi listę do `docs/archiwum/ETAPY.md`.
- Zmiana funkcji aktualizuje w tym samym PR `PROJEKT.md` (tabele, opis modelu), plik planu (odhaczone punkty), w razie potrzeby wiersz w `PLAN.md` i datę „Stan na”, zmiana konwencji z tego pliku także `CLAUDE.md`, a zmiana page objectów `e2e/README.md`.
- Przed większą funkcją przeczytaj jej plik w `docs/plany/` (kryteria „Gotowe, gdy”, decyzje już podjęte, odrzucone warianty) i odpowiedni rozdział `PROJEKT.md` (jak działa to, co już jest).
- Commity po polsku, tytuł w trybie rozkazującym („Dodaj…”, „Napraw…”), a w treści powód zmiany i jej skutek dla użytkownika.
