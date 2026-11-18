# Konta w aplikacji: zaproszenia, sekcja „Rodzina” i kreator

Stan na 13 listopada 2026. Część etapu 8 w [PLAN.md](../PLAN.md). **Wszystkie trzy kroki są zrobione 13 listopada 2026:** 1 (zmiana hasła i wylogowanie innych urządzeń), 2 (zaproszenia i sekcja „Rodzina”, w dwóch częściach: 2a API, 2b ekrany) i 3 (kreator pierwszego uruchomienia). Wcześniej weszły warunki wstępne z przeglądu bezpieczeństwa: tabela `auth_events` (B4), limit rozmiaru żądania (B6) i nowa blokada logowania (B1) działają od 13 listopada 2026. Analiza, z której wynika ten plan (ustalenie B7: kontami zarządza się tylko przez SSH), jest w [archiwum/UTWARDZENIE-PRZEGLAD.md](../archiwum/UTWARDZENIE-PRZEGLAD.md).

**Decyzja z 11 listopada 2026:** konta zakłada rodzic w aplikacji przez jednorazowe zaproszenie, a pierwszego rodzica na pustej bazie zakłada kreator pierwszego uruchomienia. Całość powstaje przed wersją 1.0. CLI przestaje być zwykłą drogą i zostaje narzędziem awaryjnym.

Pełnego panelu administracyjnego nie budujemy. Rodzina to kilka osób, więc wystarczy sekcja w ustawieniach. Musi ona jednak pokryć to, co zdarza się w zwykłym życiu bez dostępu do serwera: nowa osoba, zapomniane hasło, zgubiony telefon.

## Lista kontrolna

Kolejność: najpierw z przeglądu bezpieczeństwa ([archiwum](../archiwum/UTWARDZENIE-PRZEGLAD.md)) dziennik logowań (B4), limit rozmiaru żądania (B6) i nowa blokada logowania (B1), bo chronią nowe trasy publiczne. Kreator jest ostatni, bo produkcja rodziny ma już konta i nic na nim nie zyskuje.

- [x] **Krok 1, hasło i urządzenia** (13 listopada 2026)
  - [x] Zmiana własnego hasła w ustawieniach (wymaga obecnego hasła, wylogowuje pozostałe urządzenia)
  - [x] „Wyloguj ze wszystkich urządzeń”: w interfejsie „Wyloguj inne urządzenia”, bo bieżące zostaje zalogowane
  - [x] Reguła hasła w `shared` (`passwordProblem`): 8 znaków, bez loginu i słów imienia; ta sama w formularzu, API i CLI
  - [x] Testy API (zmiana, złe obecne hasło, reguła hasła, limit prób, dziennik, tryb demo) i e2e na kontach projektu (`ACCOUNT_USERS`)
- [x] **Krok 2, zaproszenia i sekcja „Rodzina”** (dwa PR: 2a to API, 2b to ekrany; 13 listopada 2026)
  - [x] 2a: Tabela `invites` (migracja `0011`) i trasy zaproszeń: utworzenie z potwierdzeniem hasłem rodzica, lista, unieważnienie, publiczny podgląd i przyjęcie
  - [x] 2a: Link do ustawienia nowego hasła dla dziecka i drugiego rodzica (ten sam mechanizm); nowszy link unieważnia starszy
  - [x] 2a: Lista kont ze stanem, ostatnim logowaniem i ostatnim użyciem; wyłączenie i włączenie konta dziecka z potwierdzeniem hasłem
  - [x] 2a: Dziennik logowań w API (`GET /api/auth/events`) z wpisami o zaproszeniach i zmianach kont
  - [x] 2a: Push do rodziców po dodaniu konta, po ustawieniu nowego hasła z linku i przy blokadzie logowania konta
  - [x] 2a: Limity: 5 oczekujących zaproszeń, 10 aktywnych kont (razem z oczekującymi zaproszeniami), 20 złych tokenów na 15 minut z adresu
  - [x] 2a: Blokada zaproszeń i zmian kont w trybie `DEMO_MODE`, `invites` w `clearDatabase`
  - [x] 2a: Testy API każdej trasy (`accounts.test.ts`)
  - [x] 2b: Zaproszenie nowej osoby w interfejsie: link z tokenem po `#` i kod QR generowany w przeglądarce (biblioteka `uqr`, rysowanie w React)
  - [x] 2b: Ekran przyjęcia zaproszenia: powitanie, ustawienie hasła, logowanie, przypomnienie o instalacji na ekranie początkowym
  - [x] 2b: Sekcja „Rodzina” dla rodzica: lista kont, oczekujące zaproszenia, „Nowe hasło”, wyłączenie konta dziecka, dziennik logowań
  - [x] 2b: Scenariusze e2e na nowych kontach z zaproszeń (`family.spec.ts`), wyłączanych po teście, żeby baza e2e nie dobiła do limitu kont
- [x] **Krok 3, kreator pierwszego uruchomienia** (13 listopada 2026)
  - [x] Trasy `/api/setup`: dostępne tylko przy pustej tabeli kont, poza tym `404`; nigdy w trybie demo
  - [x] Kod pierwszego uruchomienia wypisywany w logu przy starcie z pustą bazą, z limitem prób
  - [x] Ekran kreatora zamiast logowania: imię, login, hasło, kod; po założeniu konta przejście do ustawień na „Rodzinie”
  - [x] Testy API (`setup.test.ts`) i trasy kreatora na liście tras publicznych (`routes.test.ts`)
  - [x] Scenariusz e2e kreatora w teście dymnym (`e2e/smoke/setup.spec.ts`) na dwóch serwerach z pustą bazą, po jednym na telefon
  - [x] Zadanie `container` w CI sprawdza, że świeży kontener czeka na kreator i wypisuje kod w logu
  - [x] `instrukcje/WDROZENIE.md` i README: krok „Konta rodziny” opisuje kreator i zaproszenia; `user add` zostaje jako droga zapasowa

## Rozważone warianty zakładania kont

| Wariant | Decyzja | Powód |
|---|---|---|
| Zaproszenie: jednorazowy link albo kod QR od rodzica, hasło ustawia nowa osoba | **Wybrany** | Rodzic nie zna cudzego hasła, konto powstaje na właściwym telefonie, a ten sam mechanizm obsługuje zapomniane hasło |
| Formularz u rodzica z hasłem tymczasowym | Odrzucony | Rodzic zna hasło dziecka, a wymuszona zmiana przy pierwszym logowaniu to osobny mechanizm |
| Passkeys zamiast haseł | Odłożony | Duża zmiana logowania; wymaga próby na zainstalowanej PWA na iPhonie i Androidzie. Możliwy następny krok, bo zaproszenie pasuje też do rejestracji klucza |
| Rejestracja z „kodem rodziny” | Odrzucony | Wspólny sekret da się zgadywać, a otwarta rejestracja jest poza zakresem projektu |
| Link wysyłany e-mailem | Odrzucony | Wymaga wysyłki poczty, a dzieci nie muszą mieć adresu |
| Tylko CLI (stan obecny) | Odrzucony | Każde nowe konto i każde zapomniane hasło wymaga administratora z SSH |

## Zakres

| Funkcja | Kto | Uwagi |
|---|---|---|
| Kreator pierwszego uruchomienia | Osoba z kodem z logu serwera | Tylko gdy w bazie nie ma żadnego konta; zakłada pierwszego rodzica |
| Zaproszenie nowej osoby | Rodzic | Imię, login i rola (rodzic albo dziecko); wymaga hasła rodzica |
| Link do ustawienia nowego hasła | Rodzic | Dla dziecka i dla drugiego rodzica; wymaga hasła rodzica; po użyciu wylogowuje tę osobę wszędzie |
| Lista oczekujących zaproszeń i ich unieważnienie | Rodzic | Bez tokenów: token widać tylko raz, przy utworzeniu |
| Zmiana własnego hasła | Każdy | Wymaga obecnego hasła; wylogowuje pozostałe urządzenia, bieżące zostaje |
| „Wyloguj ze wszystkich urządzeń” | Każdy | Usuwa wszystkie sesje osoby poza bieżącą |
| Lista kont: imię, login, rola, stan, ostatnie logowanie | Rodzic | Bez haseł i bez tokenów |
| Wyłączenie i włączenie konta dziecka | Rodzic | Wymaga hasła rodzica |
| Dziennik logowań | Rodzic | Ostatnie wpisy: logowania, blokady, zaproszenia, zmiany haseł i stanu kont |

**Poza zakresem:** zmiana roli i loginu istniejącego konta, wyłączanie konta rodzica z aplikacji oraz logi serwera (backup, synchronizacja, wdrożenia), które zostają w plikach. Do aplikacji warto dodać najwyżej datę ostatniej kopii zapasowej, bo to jedyny stan serwera, o który rodzic może chcieć zapytać (pomysł w [ROZWOJ.md](ROZWOJ.md)).

## Zaproszenie

Zaproszenie ma dwa rodzaje: `new_account` (nowe konto) i `password_reset` (nowe hasło dla istniejącego konta). Przebieg jest ten sam:

1. Rodzic w sekcji „Rodzina” wybiera „Zaproś osobę” albo „Nowe hasło” przy koncie, potwierdza operację swoim hasłem i dostaje link oraz kod QR. Link można też przekazać systemowym „Udostępnij”.
2. Nowa osoba otwiera link na swoim telefonie. Aplikacja pokazuje, dla kogo jest zaproszenie („Cześć, Kasia. Ustaw hasło”), i prosi o hasło wpisane dwa razy.
3. Serwer zakłada konto albo zmienia hasło, oznacza zaproszenie jako użyte i od razu loguje tę osobę.
4. Ekran po zalogowaniu przypomina o dodaniu aplikacji do ekranu początkowego. Na iPhonie zainstalowana aplikacja ma dane oddzielne od Safari, więc po instalacji trzeba się zalogować jeszcze raz, już ustawionym hasłem.

Ustalenia projektowe:

- **Token.** Losowe 256 bitów, w bazie tylko skrót (tak jak token sesji), jednorazowy, ważny 24 godziny. Serwer zwraca go raz, przy utworzeniu zaproszenia.
- **Token poza logami.** Link ma postać `https://DOMENA/#zaproszenie=<token>`. Część po `#` nie jest wysyłana do serwera, więc token nie trafia do logów nginx ani proxy. Front czyta go z adresu, od razu sprząta adres i wysyła token w treści żądania.
- **Kod QR powstaje w przeglądarce rodzica.** Tokenu nie wolno wysyłać do zewnętrznej usługi generującej obrazki. Wybrana biblioteka: `uqr` (opis w „Interfejsie”).
- **Rola, login i imię są ustalone w zaproszeniu.** Osoba przyjmująca wybiera tylko hasło.
- **Login jest zajęty od chwili zaproszenia.** Drugie zaproszenie albo konto z tym samym loginem jest odrzucane, dopóki pierwsze nie wygaśnie albo nie zostanie unieważnione.
- **Nic nie kasujemy.** Zaproszenie użyte, wygasłe albo unieważnione zostaje w bazie z odpowiednią datą; skrót tokenu jest wtedy bezużyteczny.
- **Limity.** Najwyżej 5 oczekujących zaproszeń i 10 aktywnych kont. To rodzina, a limit zamyka drogę do zapchania bazy.

## Kreator pierwszego uruchomienia

Zaproszenie wymaga istniejącego rodzica, więc pierwszego trzeba założyć inaczej. Gdy w tabeli `users` nie ma żadnego wiersza, aplikacja zamiast logowania pokazuje kreator: imię, login, hasło wpisane dwa razy i kod pierwszego uruchomienia. Hasło podlega tej samej regule co w aplikacji i CLI (`passwordProblem`: 8 znaków, bez loginu i słów imienia). Kreator zakłada konto rodzica, loguje je, zapisuje w dzienniku `setup_done` i otwiera ustawienia na „Rodzinie”, żeby od razu zaprosić pozostałych.

- **Kod pierwszego uruchomienia.** Świeża instancja wystawiona do internetu bez żadnej ochrony należałaby do pierwszej osoby, która trafi na adres. Dlatego serwer przy starcie z pustą bazą wypisuje w logu jednorazowy kod, a kreator go wymaga. Kto ma dostęp do logu serwera, ma też dostęp do samej instalacji, więc kod potwierdza, że kreator przechodzi jej właściciel.
- **Postać kodu.** 8 losowych znaków z alfabetu bez znaków łatwych do pomylenia (bez `0`/`O`, `1`/`I`/`L`), pisanych z myślnikiem, np. `K7M2-9QXD`; to około 40 bitów. Wielkość liter, spacje i myślnik przy wpisywaniu nie mają znaczenia (`normalizeSetupCode` w `shared`), a porównanie idzie w stałym czasie. W logu są dwa wiersze: `[start] pusta baza, kod pierwszego uruchomienia: K7M2-9QXD` i wskazówka, żeby otworzyć aplikację i założyć konto w kreatorze (zapasowo CLI `user add`).
- **Gdzie go szukać.** Kod wypisuje tylko proces serwera, nie CLI. Bez Dockera to log procesu (np. `journalctl` przy systemd), w Dockerze `docker compose logs ogarniacz`, przy `npm run dev` terminal z logiem API. Instrukcje instalacji podają to miejsce wprost.
- **Kod zmienia się przy każdym starcie.** Żyje tylko w pamięci procesu i przestaje istnieć po założeniu konta. Restart nie musi być ręczny: menedżer usług podnosi serwer po awarii, a aktualizacja restartuje go przy wdrożeniu. Ważny jest więc kod z **ostatniego** startu w logu; ekran kreatora przypomina, że kod zmienia się przy każdym starcie. Konto założone przez CLI w trakcie działania serwera wyłącza kreator od razu, bo trasy sprawdzają bazę przy każdym żądaniu.
- **Wyjątek od zasady „sekretów nie logujemy”.** Linków do kalendarzy ani treści powiadomień nie zapisujemy w logu. Kod pierwszego uruchomienia jest wyjątkiem, bo log to jedyny kanał do administratora, który nie wymaga żadnego konta. Ryzyko jest małe: kod działa tylko na pustej bazie, najwyżej do restartu i tylko do założenia pierwszego konta. Po tym stare wpisy w logu są bezużyteczne.
- **Limit prób.** Zły kod to `403` („Nieprawidłowy kod pierwszego uruchomienia. Kod jest w logu serwera”). 5 złych kodów z jednego adresu w 15 minut daje `429`, a po 20 złych kodach łącznie, z dowolnych adresów, kod wygasa do restartu serwera: limit na adres nie chroni przed atakującym, który zmienia adresy, a 40 bitów przy 20 próbach na start wyklucza zgadnięcie. Ceną jest to, że obcy może wyczerpać kod także właścicielowi; restart daje wtedy nowy kod, a API i log mówią to wprost. Złe kody nie trafiają do dziennika logowań, bo nie dotyczą żadnego konta; wygaśnięcie kodu zostawia ostrzeżenie w logu serwera.
- **Tylko na pustej bazie.** Warunek „brak kont” jest sprawdzany w tej samej transakcji, w której powstaje konto, więc dwa równoczesne żądania nie założą dwóch kont. Liczą się także konta wyłączone: baza, w której kiedykolwiek było konto, kreatora nie pokaże.
- **Poza kreatorem trasy odpowiadają `404`,** tak jak trasy demo poza trybem demo. Nie `401`, bo front traktuje `401` jako wylogowanie.
- **Demo.** W trybie `DEMO_MODE` baza jest wypełniana przy starcie, więc kreator nigdy się nie pokazuje, a jego trasy nie są montowane.
- **Produkcja rodziny** ma już konta, więc kreatora nie zobaczy. Służy nowym instalacjom ([PUBLIKACJA.md](../archiwum/PUBLIKACJA.md)) i pozwala usunąć z instrukcji wdrożenia krok „załóż konta przez CLI”.
- **Pomyłka w ścieżce bazy.** Literówka w `DATABASE_PATH` albo przeniesiony katalog danych dają na działającej instalacji pustą bazę, a z nią publiczny kreator. Przed obcym chroni wtedy kod. Sygnałem dla administratora jest wpis `[start] pusta baza` w logu działającej instalacji; rodzina zobaczy kreator zamiast logowania i nie powinna go przechodzić, tylko zgłosić problem. Pomysł na później: wypisywać przy tym pełną ścieżkę bazy, żeby zły plik był widoczny od razu.

## Zasady bezpieczeństwa

- **Ponowne podanie hasła.** Utworzenie zaproszenia, linku do nowego hasła, wyłączenie konta i zmiana własnego hasła wymagają hasła osoby, która je wykonuje. Przejęta sesja rodzica (np. odblokowany telefon) nie wystarcza do założenia albo przejęcia konta.
- **Powiadomienie i ślad.** Utworzenie zaproszenia i jego przyjęcie zostawiają wpis w dzienniku logowań, a rodzice dostają push („Dodano konto: Kasia”, „Nowe hasło: Tata”). Rodzic może zaprosić drugiego rodzica i wystawić mu link do nowego hasła, więc ta operacja nie może przejść po cichu.
- **Nowe trasy publiczne.** Podgląd i przyjęcie zaproszenia oraz kreator działają bez sesji, więc w `app.ts` stoją przed `requireSession`. Obowiązuje je `sameOriginOnly`, limit rozmiaru żądania (B6) i limit prób na adres klienta. Test przekrojowy tras (`routes.test.ts`) dostaje jawną listę tras publicznych, żeby kolejna nie pojawiła się przypadkiem.
- **Odpowiedź nie zdradza stanu tokenu.** Zły, użyty, wygasły i unieważniony token dają ten sam komunikat: „To zaproszenie jest nieważne. Poproś rodzica o nowe”.
- **Limit prób** na trasach sprawdzających hasło (zmiana hasła, potwierdzenia) taki sam jak przy logowaniu.
- **Wymagania wobec hasła.** Zostaje 8 znaków, dochodzi zakaz hasła zawierającego login albo imię. Dla dziecka długie hasło to realny koszt, a ochronę przed zgadywaniem daje limit prób.
- **Demo.** W trybie `DEMO_MODE` zaproszenia, zmiana haseł i wyłączanie kont odpowiadają `403`: bezpiecznik `isDemoDatabase` rozpoznaje bazę demo po kontach z hasłem demo, a goście blokowaliby się nawzajem.

## Szkic API

| Metoda | Ścieżka | Dostęp | Działanie |
|---|---|---|---|
| GET | `/api/setup` | Publiczna | **Jest.** `{ needed: true }`, gdy baza nie ma kont; inaczej `404` |
| POST | `/api/setup` | Publiczna, z kodem | **Jest.** Zakłada pierwszego rodzica (`{ code, login, name, password }`) i loguje go; gdy konto już jest, `404` |
| GET | `/api/invites` | Rodzic | **Jest.** Oczekujące zaproszenia: rodzaj, dla kogo, termin ważności; bez tokenów |
| POST | `/api/invites` | Rodzic | **Jest.** Nowe zaproszenie (`{ kind, login?, name?, role?, userId?, confirm }`, gdzie `confirm` to hasło rodzica); zwraca token jeden raz |
| DELETE | `/api/invites/:id` | Rodzic | **Jest.** Unieważnia zaproszenie (zapisuje `revoked_at`) |
| POST | `/api/invites/preview` | Publiczna | **Jest.** Dla tokenu z treści żądania zwraca rodzaj i imię, żeby pokazać powitanie |
| POST | `/api/invites/accept` | Publiczna | **Jest.** Ustawia hasło (`{ token, password }`), zakłada konto albo zmienia hasło, loguje |
| POST | `/api/auth/password` | Każdy | **Jest.** Zmiana własnego hasła (`{ current, next }`) |
| POST | `/api/auth/logout-all` | Każdy | **Jest.** Wylogowanie pozostałych urządzeń, zwraca `{ count }` |
| GET | `/api/users/accounts` | Rodzic | **Jest.** Lista kont ze stanem i ostatnim logowaniem |
| PATCH | `/api/users/:id` | Rodzic | **Jest.** Wyłączenie albo włączenie konta dziecka (`{ disabled, confirm }`) |
| GET | `/api/auth/events` | Rodzic | **Jest.** Dziennik logowań, ostatnie 100 wpisów |

Wszystkie trasy są już zaimplementowane pod tymi nazwami. Trasy kont wywołują te same funkcje `createUser`, `setPassword` i `setDisabled` z `auth/users.ts`, z których korzysta CLI.

## Model danych

Oba elementy już są: `invites` (migracja `0011`) i `auth_events` (migracja `0010`). Kreator nie potrzebuje nowej tabeli. Migracje tylko dodają.

**`invites`:**

| Kolumna | Opis |
|---|---|
| `id`, `created_at`, `created_by` | Identyfikator, chwila w UTC i rodzic, który wystawił zaproszenie |
| `token_hash` | Skrót SHA-256 tokenu, unikalny |
| `kind` | `new_account` albo `password_reset` |
| `login`, `name`, `role` | Dane nowego konta; puste przy `password_reset` |
| `user_id` | Konto, którego dotyczy nowe hasło; puste przy `new_account`, a po przyjęciu wskazuje założone konto |
| `expires_at` | Termin ważności, 24 godziny od utworzenia |
| `used_at`, `revoked_at` | Chwila przyjęcia albo unieważnienia |

**`auth_events`** (już jest, z B4 w [archiwum](../archiwum/UTWARDZENIE-PRZEGLAD.md), migracja `0010`; doszły kolumna `detail` z powodem albo zakresem blokady i rodzaj `account_created`):

| Kolumna | Opis |
|---|---|
| `id`, `created_at` | Identyfikator i chwila w UTC |
| `type` | `login_ok`, `login_failed`, `locked`, `logout`, `logout_all`, `password_changed`, `password_reset`, `account_disabled`, `account_enabled`, `invite_created`, `invite_accepted`, `invite_revoked`, `setup_done` |
| `user_id` | Konto, którego dotyczy wpis; puste, gdy login nie istnieje |
| `actor_id` | Kto wykonał operację; puste przy logowaniu i operacjach z CLI |
| `ip`, `user_agent` | Adres klienta i przycięty opis przeglądarki |

Ustalone przy implementacji B4 (13 listopada 2026):

- **Retencja dziennika:** 90 dni, sprzątane przez harmonogram razem z wygasłymi sesjami. To wyjątek od zasady „nic nie kasujemy”, uzasadniony tym, że adres IP jest daną osobową, a dziennik nie jest daną rodziny.
- **Ochrona przed zapchaniem:** nieudane próby dla nieistniejących loginów zapisujemy najwyżej raz na minutę na adres; odrzucone przez blokadę nie są zapisywane.
- **Demo:** `clearDatabase` w `demo.ts` czyści `auth_events`. Wejście jednym przyciskiem w demo nie trafia do dziennika.

Ustalone przy kroku 2a (13 listopada 2026):

- **Push o blokadzie konta:** tak, do wszystkich rodziców, gdy blokada dotyczy konta (para login i adres albo bezpiecznik loginu), najwyżej raz na godzinę na konto i z poszanowaniem ciszy nocnej każdego rodzica, bo blokadę może wywołać obcy w nocy. Blokada samego adresu nie wskazuje konta, więc nie wysyła nic.

## Interfejs

- **Kreator** zastępuje ekran logowania, gdy `GET /api/setup` odpowie `needed`. Front pyta o to przed logowaniem, tak jak dziś o tryb demo; odpowiedź `404` oznacza zwykłe logowanie. Po założeniu konta otwiera się aplikacja z ustawieniami na podstronie „Rodzina”.
- **Ekran zaproszenia** otwiera się, gdy adres ma `#zaproszenie=…`, niezależnie od tego, czy ktoś jest zalogowany: zalogowana osoba najpierw dostaje pytanie, czy chce się wylogować.
- **„Hasło i urządzenia”** w panelu ustawień, dla każdego: zmiana hasła, „Wyloguj inne urządzenia”.

Ustalone przy kroku 2b (13 listopada 2026):

- **Kod QR** rysuje komponent React z macierzy z biblioteki `uqr` (MIT, bez zależności), w kolorach `qr-dark` i `qr-light`, takich samych w każdym motywie, bo odwróconego kodu wiele aparatów nie czyta.
- **Token z adresu** front czyta raz, przy wczytaniu aplikacji, i od razu sprząta adres; link otwarty w działającej karcie łapie zdarzenie `hashchange`.
- **Akcje na kontach** (zaproszenie, nowe hasło, wyłączenie, włączenie) pokazują pole „Twoje hasło” w miejscu przycisku; link z tokenem znika po „Gotowe”, wyjściu z podstrony albo zamknięciu ustawień.
- **Dziennik logowań** jest osobną podstroną „Rodziny” i wczytuje się dopiero po wejściu (do 13 listopada 2026 był zwiniętą sekcją).
- **„Rodzina”** w panelu ustawień, tylko dla rodzica: lista kont, oczekujące zaproszenia (tylko gdy jakieś są) i wejście do dziennika logowań. Od przebudowy ustawień 13 listopada 2026 to podstrona w tym samym arkuszu co menu, a nie osobny arkusz, i akcje konta pokazują się po stuknięciu w osobę. Nowego ekranu w pasku nawigacji nie ma, bo pasek ma już pięć pozycji.

## Testy

- **Testy API każdej trasy:** odmowa dla dziecka, brak hasła potwierdzającego, token zły, użyty, wygasły i unieważniony (ten sam komunikat), zajęty login, limity zaproszeń i kont, kreator na bazie z kontem (`404`), zły kod, dwa równoczesne żądania do kreatora, blokada w trybie demo.
- **Scenariusze e2e zaproszeń** na osobnych kontach projektu, wzorem `projectChild`: rodzic zaprasza, nowa osoba w świeżym kontekście przeglądarki ustawia hasło i widzi „Dziś”. Zmiana hasła wylogowuje, więc nie wolno jej robić na wspólnych aktorach `parent` i `child`.
- **Scenariusz e2e kreatora** (`e2e/smoke/setup.spec.ts`). Baza e2e ma konta od początku, więc test dymny startuje dwa dodatkowe serwery z pustą bazą (porty 3092 i 3093), po jednym na iPhone i Androida, bo kod działa raz na start. Zmienna z kodem tylko do testów odpadła, bo serwer testu dymnego działa z `NODE_ENV=production`, a zmienne testowe są wtedy odrzucane; `smokeServer.mjs` czyta kod z wyjścia serwera, więc test sprawdza prawdziwą drogę administratora. Testy API kreatora są w `setup.test.ts`.

## Co zostaje w CLI

- **Sytuacja awaryjna:** żaden rodzic nie ma dostępu (`user passwd`), trzeba wyłączyć albo włączyć konto rodzica (`user disable`, `user enable`).
- **`user add`** zostaje jako droga zapasowa i dla skryptów (seed testów e2e), ale instrukcja wdrożenia przestaje go wymagać.
- **Kopie zapasowe, kalendarze i demo** bez zmian.

## Decyzje

**Ustalone 11 listopada 2026:** zaproszenia zamiast CLI, kreator pierwszego uruchomienia dla pierwszego rodzica, wszystkie trzy kroki przed wersją 1.0.

**Ustalone przy kroku 3 (13 listopada 2026):**

- **Kod pierwszego uruchomienia:** 8 znaków z alfabetu bez 0, O, 1, I i L (około 40 bitów), w logu jako dwie czwórki z myślnikiem; formularz przyjmuje małe litery, spacje i myślnik. Porównanie w stałym czasie.
- **Limit prób:** 5 złych kodów z adresu w 15 minut (`429`), a po 20 złych kodach razem, z dowolnych adresów, kod wygasa do restartu serwera. Zły kod to `403`, za słabe hasło `400` i nie zużywa kodu.
- **Kod tylko w pamięci:** serwer losuje go przy starcie, jeśli baza nie ma kont. Konto założone przez CLI w trakcie działania serwera wyłącza kreator od razu, bo trasy sprawdzają bazę przy każdym żądaniu.
- **Dziennik:** założenie konta kreatorem zapisuje wpis `setup_done`.
- **Test kreatora:** test dymny startuje dwa serwery z pustą bazą (porty 3092 i 3093), po jednym na iPhone i Androida, bo kod działa raz na start. Kod trafia do testu z logu serwera przez `smokeServer.mjs`, bez zmiennej, która ustawiałaby kod na produkcji. Scenariusz nie ma ponownej próby, bo druga trafiłaby na bazę z kontem.

**Ustalone przy kroku 2a (13 listopada 2026):**

- **Drugi rodzic:** rodzic może zaprosić kolejnego rodzica i wystawić drugiemu rodzicowi link do nowego hasła, z pushem do pozostałych rodziców i wpisem w dzienniku.
- **Ważność zaproszenia:** 24 godziny.
- **Push przy blokadzie konta:** tak (szczegóły w „Modelu danych”).
- **Kody odpowiedzi:** nieważny token to `404` z jednym komunikatem; złe hasło potwierdzające `403`; limity `409`. Przyjęcie zaproszenia na nowe konto daje `201`, nowego hasła `200`.
- **Link do nowego hasła** nie jest wystawiany dla siebie (od tego jest zmiana hasła w ustawieniach) ani dla wyłączonego konta, a wyłączenie konta unieważnia działanie wystawionego linku.
- **Lista kont** podaje ostatnie logowanie z dziennika (więc najwyżej 90 dni wstecz) i ostatnie użycie aplikacji z sesji, bo dziecko z długą sesją może się nie logować miesiącami.

**Ustalone przy kroku 1 (13 listopada 2026):**

- **Wymagania wobec hasła:** 8 znaków i zakaz hasła zawierającego login albo słowo imienia, bez względu na wielkość liter. Słowa krótsze niż 3 znaki nie blokują. Reguła obowiązuje też w CLI, więc hasła kont testowych e2e nie zawierają już loginu ani imienia.
- **Złe obecne hasło** to `403`, nie `401` (front traktuje `401` jako wylogowanie), wpis `login_failed` z `detail` `password_change` i ten sam licznik prób co logowanie: pięć pomyłek blokuje także logowanie tej osoby z tego adresu.
- **Ścieżka** zmiany hasła to `/api/auth/password` zamiast roboczego `/api/users/me/password`, bo trasa korzysta z limitu prób i dziennika z tras logowania.
- **Demo:** sekcji „Hasło i urządzenia” w demo nie ma, a API odpowiada `403` na podstawie trybu `DEMO_MODE`.

**Otwarte:** brak.
