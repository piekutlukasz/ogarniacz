# Kalendarze ICS: analiza, projekt i zagrożenia

Stan na 10 listopada 2026. To projekt **etapu 6** z [PLAN.md](../PLAN.md), zachowany w archiwum jako uzasadnienie decyzji. **Kod jest gotowy, przetestowany i wdrożony na produkcji** (10 listopada 2026 kalendarz zaimportowany, wydarzenia na dziś zgadzają się z „Dziś”). Rozdział 9 opisuje, czym wykonanie różni się od pierwotnego projektu. Instrukcja dla rodziny jest osobno: [instrukcje/KALENDARZE.md](../instrukcje/KALENDARZE.md).

## 1. Co etap ma dać

Ekran „Dziś” pokazuje wydarzenia z kalendarzy Google i iCloud, obok zadań i zakupów. Aplikacja tylko **czyta** kalendarze: wydarzenia dodaje się nadal w Google albo w Kalendarzu Apple.

Kryterium z planu: *prawdziwe kalendarze Google i iCloud zgadzają się z „Dziś”, a błąd jednego z nich nie psuje pozostałych.*

## 2. Analiza: co jest łatwe, a co nie

Pobranie pliku ICS pod linkiem to najprostsza część. Trudność leży w trzech miejscach.

1. **Poprawne wyliczenie „kiedy to jest”.** Plik ICS nie zawiera listy wystąpień. Wydarzenie powtarzalne to jedna reguła (`RRULE`), od której odejmuje się wyjątki (`EXDATE`), a pojedyncze przesunięte lub odwołane wystąpienia są osobnymi wpisami (`RECURRENCE-ID`). Do tego dochodzą wydarzenia całodniowe (data bez godziny), czas UTC, czas „pływający” bez strefy, strefy zapisane po nazwie z Windowsa i zmiana czasu.
2. **Link jest hasłem.** Tajny adres Google i publiczny adres iCloud nie wymagają logowania: kto zna link, czyta cały kalendarz razem ze szczegółami.
3. **Serwer pobiera adres podany przez człowieka.** To klasyczny wektor SSRF, a my mamy publiczne demo, w którym „rodzicem” może zostać każdy.

### Wyniki prób (ical.js 2.2.1, 10 listopada 2026)

Przed zaproponowaniem biblioteki sprawdziłem ją na przykładowych plikach (poza repozytorium, w katalogu tymczasowym):

| Przypadek | Wynik |
|---|---|
| Seria tygodniowa z `EXDATE` i przesuniętym wystąpieniem (`RECURRENCE-ID`) | Poprawnie: pominięty dzień, przesunięta godzina |
| Strefa `Europe/Warsaw` z `VTIMEZONE`, przejście na czas zimowy | Poprawnie (18:00 zostaje 18:00) |
| Czas UTC (`Z`) | Poprawnie |
| Wydarzenie całodniowe, dwudniowe | Daty poprawne, ale **`toJSDate()` zwraca chwilę zależną od strefy serwera**: północ w Warszawie przy `TZ=Europe/Warsaw`, północ UTC przy `TZ=UTC` |
| Czas „pływający” bez strefy | Jak wyżej: zależy od strefy serwera |
| `TZID` z nazwą Windows (`W. Europe Standard Time`) bez `VTIMEZONE` | Traktowane jak czas pływający, więc godzina zależy od strefy serwera |
| Nieistniejąca godzina przy zmianie czasu (02:30 w dniu przejścia na letni) | Przesunięta o godzinę we wcześniejszą stronę; rzadki przypadek, akceptujemy |
| `FREQ=DAILY` od 2020 bez końca | 2500 kroków i 41 ms do dnia dzisiejszego, więc iteracja jest tania, ale **bez limitu kroków `FREQ=SECONDLY` nie kończy się nigdy** |
| 2000 wydarzeń (1,1 MB) | 122 ms parsowania |
| 10 000 wydarzeń (5,6 MB) | 1,9 s parsowania, całe w jednym wątku |
| 25 000 wydarzeń (14 MB) | 17 s parsowania; czas rośnie szybciej niż rozmiar |

Wnioski, które trafiają do projektu:

- Wydarzeń całodniowych i bez strefy **nigdy** nie zamieniamy na `Date` przez `toJSDate()`. Czytamy rok, miesiąc i dzień jako liczby i składamy `RRRR-MM-DD`, tak jak robi to już `due_on`. Testy uruchamiamy przy `TZ=UTC` i `TZ=America/Los_Angeles`, żeby wynik od strefy serwera nie zależał.
- Strefy rozwiązujemy sami, w kolejności: nazwa IANA (przez `Intl`, jedno źródło prawdy) → tabela nazw Windows → `VTIMEZONE` z pliku → `Europe/Warsaw` z ostrzeżeniem w logu. Google dodaje też `X-WR-TIMEZONE`, który służy za strefę dla czasu pływającego.
- Parsowanie jest synchroniczne i blokuje jedyny wątek API, który obsługuje całą rodzinę. Stąd limity rozmiaru (rozdział 4.4 i 9).
- Seria bez końca potrzebuje twardego limitu kroków i czasu.

### Wybór biblioteki

| Opcja | Za | Przeciw |
|---|---|---|
| **`ical.js`** (2.2.1) | Bez zależności, obsługuje `RRULE`, `EXDATE`, `RECURRENCE-ID`, `VTIMEZONE`; sprawdzona wyżej | MPL-2.0 (obowiązuje tylko na zmienione pliki biblioteki, więc nie przeszkadza w prywatnym projekcie); pakiet ma 1,2 MB, musi się dać zbundlować esbuildem (do sprawdzenia w kroku 1) |
| `node-ical` | Gotowy `fetch` | Dwie zależności, w tym polyfill `Temporal`, a własny `fetch` omijałby nasze zabezpieczenia przed SSRF |
| Własny parser | Pełna kontrola | Dokładnie to, przed czym ostrzega PROJEKT.md: „biblioteka zamiast własnego parsera” |

**Rekomendacja: `ical.js`**, dodany do `apps/api` jako jedyna nowa zależność. Pobieraniem zajmuje się nasz kod.

## 3. Czego świadomie nie robimy

- Zapisu do kalendarzy, zaproszeń i odpowiedzi na zaproszenia.
- Logowania do Google (OAuth) i CalDAV dla iCloud: PROJEKT.md rozdział 7 podaje powody.
- Zapamiętywania opisu wydarzenia, uczestników i linków do spotkań. Opis bywa miejscem z tajnymi linkami do wideorozmów, a do „Dziś” nie jest potrzebny.
- Własnych wydarzeń rodzinnych (etap 9).
- Powiadomień o wydarzeniach: dojdą w etapie 7 jako część porannego podsumowania, na podstawie tych samych tabel.

## 4. Proponowana implementacja

Droga jak zwykle: schemat w `shared` → trasa w `apps/api/src/routes` → rejestracja w `app.ts` → `api.ts` w katalogu funkcji frontu → testy.

### 4.1. Model danych

Migracja `0008_calendars.sql` tylko dodaje dwie tabele (zgodnie z zasadą „migracje tylko dodają”).

**`calendars`**

| Kolumna | Znaczenie |
|---|---|
| `id` | UUID |
| `name` | Nazwa wpisana przez rodzica, np. „Rodzina” |
| `url_enc` | Link zaszyfrowany AES-256-GCM, format `v1:<iv>:<tag>:<szyfrogram>`; identyfikator kalendarza jako dane uwierzytelniane, więc szyfrogramu nie da się przenieść do innego wiersza |
| `url_host` | Sam host, np. `calendar.google.com`; jedyna część linku, jaką pokazujemy |
| `scope` | `family` (widzą wszyscy) albo `private` (widzi tylko osoba, która dodała) |
| `owner_id` | Kto dodał |
| `last_attempt_at`, `last_success_at` | Czas ostatniej próby i ostatniego udanego pobrania |
| `last_error` | **Kod** błędu (`auth`, `not_found`, `rate_limited`, `network`, `format`, `too_large`, `blocked`, `key`), nie tekst. Polskie komunikaty leżą w `shared`. Nigdy adres |
| `failures` | Kolejne nieudane próby, steruje odstępem |
| `next_sync_at` | Kiedy najwcześniej spróbować ponownie |
| `etag`, `last_modified` | Do pytania warunkowego (`If-None-Match`) |
| `content_hash`, `synced_day` | Skrót treści i dzień, dla którego rozwinięto wystąpienia |
| `created_at`, `updated_at`, `archived_at` | Jak w pozostałych tabelach |

Wyjątek od zasady „nic nie kasujemy”: **przy archiwizacji kalendarza zerujemy `url_enc`**. Link to poświadczenie, a nie dana historyczna, więc nie ma powodu go przechowywać (ani wysyłać w kopiach na Google Drive).

**`calendar_events`**: rozwinięte wystąpienia z okna od wczoraj do 45 dni w przód.

| Kolumna | Znaczenie |
|---|---|
| `calendar_id`, `uid`, `instance` | Klucz unikalny. `instance` to `RECURRENCE-ID` albo początek wystąpienia |
| `title` | Do 200 znaków, bez znaków sterujących |
| `location` | Do 120 znaków; opcjonalne |
| `all_day` | Całodniowe |
| `starts_at`, `ends_at` | Chwile UTC; puste przy całodniowych |
| `start_on`, `end_on` | Dzień `RRRR-MM-DD` w `Europe/Warsaw`, **włącznie** z ostatnim dniem, dla wszystkich wydarzeń |

Dzięki `start_on` i `end_on` zapytanie „co jest w dniu D” to zwykłe `start_on <= D AND end_on >= D`, bez rachunków na strefach w SQL. Wydarzenie kończące się dokładnie o północy kończy się poprzedniego dnia (`end_on` liczymy od `ends_at - 1 ms`). Dla całodniowych koniec w ICS jest wyłączny, więc odejmujemy dzień.

**Dlaczego rozwinięte wystąpienia w bazie, a nie surowy plik.** Odrzucone warianty: (a) trzymanie pliku ICS i parsowanie przy każdym wejściu na „Dziś” (koszt CPU na każde żądanie, błędy czasu ujawniałyby się w trasie), (b) trzymanie samych reguł i rozwijanie przy odczycie (cała logika `RRULE` w ścieżce odczytu). Przy rozwijaniu w synchronizacji trasa odczytu jest prostym `SELECT`, a błąd parsera nie psuje ekranu.

### 4.2. Synchronizacja

Zaślepka `*/15 * * * *` w `jobs/scheduler.ts` wywołuje `runCalendarSync(db, { fetch, key, now })`. Zasady:

- **Każdy kalendarz osobno, każdy w `try/catch`.** Błąd jednego zapisuje kod błędu i idzie dalej. To wprost kryterium „błąd jednego nie psuje pozostałych”.
- **Kalendarze po kolei, nie równolegle.** Rodzina ma ich kilka; oszczędza to pamięć przy parsowaniu.
- **Blokada przed nakładaniem.** Flaga w pamięci procesu (aplikacja i tak ma jedną instancję), żeby wolna synchronizacja nie nałożyła się na następną.
- **Bezpieczne ponawianie.** Zadanie działa też przy starcie, ale respektuje `next_sync_at`, więc pętla restartów nie bombarduje Google.
- **Odstęp po błędach.** Po sukcesie `next_sync_at = teraz + 10 min`. Po porażce rośnie: 15, 30, 60, 120, maksymalnie 240 minut. Martwy link nie jest odpytywany co 15 minut w nieskończoność.
- **Najpierw parsowanie, potem jedna transakcja.** Pobieramy i parsujemy całość poza transakcją, a dopiero potem w jednej transakcji usuwamy stare wystąpienia kalendarza i wstawiamy nowe. Każda porażka zostawia poprzednie dane nietknięte.
- **Pomijanie pracy.** Odpowiedź `304` albo ten sam `content_hash` z tym samym `synced_day` oznacza tylko odświeżenie `last_success_at`. Sam skrót nie wystarcza, bo okno przesuwa się codziennie: `synced_day` wymusza ponowne rozwinięcie raz na dobę.
- **Poprawny plik, a nie strona z błędem.** Treść musi zaczynać się od `BEGIN:VCALENDAR`; inaczej to błąd `format` (na przykład strona logowania zwrócona kodem 200). Poprawny, ale pusty kalendarz jest legalny i zastępuje stare dane.
- **Wydarzenia odwołane.** `STATUS:CANCELLED` (także na pojedynczym wystąpieniu serii) usuwa wystąpienie, zamiast je pokazać.
- **Czas z `now()`.** Jak wszędzie w zadaniach w tle; testy sterują zegarem.

### 4.3. Pobieranie i szyfrowanie

**Pobieranie** (`calendars/fetch.ts`, jedno miejsce, wstrzykiwane do `createApp` i zadania, żeby testy używały atrapy):

- Tylko `https`. `webcal://` zamieniamy na `https://` (tak wygląda link z iCloud).
- **Lista dozwolonych hostów** jako główna ochrona przed SSRF: domyślnie `calendar.google.com` i `*.icloud.com`. Rozszerza ją zmienna `CALENDAR_ALLOWED_HOSTS`. Zwykłe sprawdzanie „czy to nie adres prywatny” zostaje jako druga warstwa dla hostów dodanych ręcznie (rozwiązanie DNS i odrzucenie `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`, `fc00::/7`).
- Przekierowania ręcznie (`redirect: 'manual'`), najwyżej 3, a **każdy** cel przechodzi te same sprawdzenia.
- Limit czasu 15 s na całość, limit 4 MB liczony po rozpakowaniu (czytamy strumień i przerywamy, nie ufamy `Content-Length`; gzip może być bombą).
- Nagłówek `User-Agent: Ogarniacz` bez danych osobowych.
- Błędy HTTP zamieniamy na kody: `401`/`403` → `auth`, `404`/`410` → `not_found`, `429` → `rate_limited`, reszta i błędy sieci → `network`. Komunikat błędu biblioteki nigdy nie trafia do logu ani do odpowiedzi, bo może zawierać adres.

**Szyfrowanie** (`calendars/crypto.ts`): klucz 32 bajty z `CALENDAR_ENCRYPTION_KEY` (base64, `openssl rand -base64 32`), przechowywany w ustawieniach serwera (`chmod 600`), poza repozytorium. Prefiks `v1:` pozwala kiedyś zmienić klucz.

- **Brak klucza nie przewraca aplikacji.** `loadConfig` go nie wymaga; trasy kalendarzy odpowiadają wtedy `503` z komunikatem „Kalendarze nie są skonfigurowane”, a synchronizacja się nie uruchamia. Aplikacja bez kalendarzy działa dalej, więc wdrożenie kodu może wyprzedzić dodanie klucza.
- **Klucz nie jest w kopii zapasowej.** Backup zawiera tylko bazę, więc wyciek kopii z Google Drive nie ujawnia linków. Skutek uboczny: po odtworzeniu bazy na nowej maszynie bez klucza linki są nieczytelne (kod `key`) i trzeba dodać je ponownie. Klucz trzeba więc zapisać poza serwerem, w menedżerze haseł.
- **Szyfrowanie chroni przed wyciekiem bazy i kopii, nie przed przejęciem serwera.** Klucz leży na tym samym serwerze co aplikacja. Tak samo jest z hasłami do rclone, więc to ten sam poziom zaufania. Warto to mieć jasno opisane, żeby nikt nie uznał linków za bezpieczne po włamaniu na serwer.

### 4.4. Parsowanie

`calendars/ics.ts` (czysta funkcja: tekst ICS, bieżąca chwila → lista wystąpień):

1. Wstępne odrzucenie starych wydarzeń **przed** parserem: Google oddaje w pliku całą historię kalendarza, a koszt rośnie z rozmiarem. Blok `VEVENT` bez `RRULE`, `RDATE` i `RECURRENCE-ID`, który skończył się przed oknem, wypada bez parsowania. Opłaca się to zmierzyć na prawdziwym pliku (krok 1) i zostawić tylko, jeśli daje wyraźny zysk.
2. Parsowanie `ical.js` w **wątku roboczym** (`worker_threads`), żeby 2 sekundy pracy nad dużym plikiem nie zatrzymały API dla całej rodziny. Wymaga to dodatkowego wejścia w skrypcie `build` (esbuild). Jeśli okaże się to zbyt kłopotliwe: limit 2 MB i parsowanie w głównym wątku (do ok. 0,3 s).
3. Rozwijanie serii w oknie z limitem 2000 kroków i 2 s na wydarzenie; po przekroczeniu seria jest pomijana, a w logu zostaje licznik (bez treści).
4. Czas według reguł z rozdziału 2: bez `toJSDate()` dla dat i czasu pływającego, strefy przez IANA → Windows → `VTIMEZONE` → `Europe/Warsaw`.
5. Czyszczenie tekstu: usunięcie znaków sterujących, przycięcie długości, brak interpretacji jako HTML.
6. Limit 3000 wystąpień na kalendarz; nadmiar jest odcinany od najdalszych dat.

### 4.5. API

Wszystkie trasy za `requireSession`, zgodnie z `docs/PROJEKT.md` (rozdział 6).

| Metoda | Ścieżka | Działanie |
|---|---|---|
| GET | `/api/calendars` | Kalendarze z nazwą, hostem, widocznością, czasem ostatniego sukcesu i kodem błędu; tylko rodzic |
| POST | `/api/calendars` | `{ name, url, scope }`; tylko rodzic. **Od razu pobiera i parsuje** (limit 15 s). Błędny link jest odrzucany z czytelnym komunikatem i nie zostaje zapisany; sukces zwraca liczbę znalezionych wydarzeń w oknie |
| PATCH | `/api/calendars/:id` | Nazwa, widoczność, **wymiana linku** (`url`, od razu synchronizuje) albo archiwizacja (`archived`, zeruje link); tylko rodzic |
| POST | `/api/calendars/:id/sync` | „Odśwież teraz”; tylko rodzic; najwyżej raz na minutę na kalendarz |
| GET | `/api/events?date=RRRR-MM-DD&days=1` | Wydarzenia widoczne dla zalogowanej osoby (1 do 14 dni, domyślnie dziś), z nazwą kalendarza i znacznikiem nieaktualności |

Link nie wraca z API **nigdy**, także do rodzica, który go dodał: edycja to wymiana, a nie podgląd. Zgodnie z `CLAUDE.md` komunikaty błędów są po polsku i zrozumiałe dla domownika.

Odpowiedź `/api/events` zawiera też `sync`: czas najstarszego udanego pobrania wśród widocznych kalendarzy i liczbę kalendarzy z błędem. Dziecko dostaje tylko „dane mogą być nieaktualne”; kody i nazwy kalendarzy z błędem widzi rodzic.

**Odstępstwo od PROJEKT.md:** tam jako planowane figurują `/api/events` i zbiorcze `/api/today`. Zbiorczego `/api/today` nie budujemy: „Dziś” składa się już dziś z osobnych zapytań (zadania, zakupy), a wydarzenia dojdą jako trzecie. Po wdrożeniu poprawić rozdział 5.

### 4.6. Interfejs

Pasek nawigacji ma już pięć pozycji, a PROJEKT.md ogranicza go do pięciu. **Zarządzanie kalendarzami trafia więc do panelu ustawień** (sekcja „Kalendarze”, widoczna tylko rodzicowi), tak jak planowane są tam ustawienia powiadomień.

- `apps/web/src/features/calendars/`: `api.ts` (klucze zapytań `CALENDARS_KEY` i `EVENTS_KEY`, hooki), `CalendarsSheet.tsx` (lista, dodawanie, wymiana linku, odświeżenie, archiwizacja), `TodayEvents.tsx`.
- **Sekcja „Wydarzenia” w „Dziś”** nad zadaniami: całodniowe pierwsze, potem według godziny; zakończone dzisiaj wydarzenia przygaszone. Pod nagłówkiem tekst „Zsynchronizowano 12 min temu”. Gdy dane mają ponad godzinę albo kalendarz zgłasza błąd, widać ostrzeżenie z czasem ostatnich danych (stare wydarzenia zostają na ekranie, ale jawnie oznaczone).
- Ekran pusty: dzisiejszy komunikat „Na dziś nie masz żadnych zadań z terminem” wymaga rozróżnienia, gdy są wydarzenia.
- Tytuły i miejsca są renderowane jako zwykły tekst. Bez `dangerouslySetInnerHTML` i bez automatycznych linków.
- Kolory wyłącznie przez nazwane zmienne z `index.css`, w obu blokach trybu ciemnego.
- Wydarzenia nie są offline: tylko lista zakupów jest. Bez sieci sekcja pokazuje błąd połączenia jak reszta ekranu „Dziś”.

### 4.7. Demo, CLI i e2e

- **Demo.** `DEMO_MODE` nie może pobierać żadnych adresów: w publicznym demo każdy zostaje „rodzicem”, więc dodawanie kalendarzy dałoby każdemu otwarty serwer pośredniczący. Trasy zapisu kalendarzy odpowiadają w demo `403`, a seed wstawia gotowy kalendarz z wydarzeniami bez adresu (`url_enc` pusty, synchronizacja go pomija). `clearDatabase` w `demo.ts` dostaje nowe tabele (kolejność: wydarzenia przed kalendarzami), a `demo.test.ts` pilnuje kompletności.
- **CLI** (pomocniczo, mały koszt): `calendar list` (nazwa, host, ostatni sukces, błąd) i `calendar sync` (wymusza synchronizację i wypisuje wynik). Przydatne, gdy interfejs nie działa, a CLI jest już narzędziem operatora.
- **E2E.** Playwright uruchamia lokalny serwer ICS, a serwer deweloperski testów dostaje `CALENDAR_ALLOWED_HOSTS` i `CALENDAR_ALLOW_HTTP=true`. `loadConfig` odmawia startu, gdy `NODE_ENV=production` i ustawiono `CALENDAR_ALLOW_HTTP`, żeby ta furtka nie trafiła na produkcję. Nowe page objecty trzeba opisać w `e2e/README.md`.

## 5. Zagrożenia

Ocena: P to prawdopodobieństwo, W to wpływ (W/Ś/N: wysoki, średni, niski).

| # | Zagrożenie | P | W | Jak ograniczamy | Co zostaje |
|---|---|---|---|---|---|
| 1 | **Wyciek tajnego linku**: kopia bazy na Google Drive, log, odpowiedź API, zrzut ekranu, wiadomość na czacie | Ś | W | Szyfrowanie z kluczem poza kopią, link nigdy w API ani logu, wymiana linku w aplikacji, instrukcja resetu po stronie Google i Apple | Ktoś z dostępem do serwera ma klucz; link wysłany przez człowieka czatem nie jest naszą sprawą |
| 2 | **SSRF**: adres kalendarza wskazuje na `127.0.0.1:3001`, metadane chmury, sieć kontenera; przekierowanie na adres wewnętrzny | Ś | W | Lista hostów, tylko `https`, ręczne przekierowania z ponowną kontrolą, blokada adresów prywatnych dla hostów dodanych ręcznie | DNS rebinding dla hostów spoza listy; stąd lista jako główna ochrona |
| 3 | **Demo jako otwarty serwer pośredniczący** | W (gdy demo ruszy) | W | W demo zapis kalendarzy zwraca `403`, seed bez adresów | — |
| 4 | **Zły dzień lub godzina**: całodniowe i czas pływający zależne od strefy serwera, nazwy stref z Windowsa, zmiana czasu | W | W | Daty jako liczby, strefy przez IANA, testy przy dwóch strefach procesu, prawdziwe pliki w protokole z rozdziału 7 | Nieistniejąca godzina w dniu zmiany czasu (może wyjść o godzinę inaczej) |
| 5 | **Wyczerpanie zasobów**: ogromny plik, bomba gzip, `RRULE` bez końca, tysiące wyjątków | Ś | Ś | Limit 4 MB po rozpakowaniu, limit czasu, limity kroków i wystąpień, parsowanie w wątku roboczym | Powolne, ale ograniczone parsowanie przy skrajnych plikach |
| 6 | **Cicha nieaktualność**: synchronizacja po cichu przestaje działać, rodzina ufa starym danym | W | W | Widoczny czas ostatniej synchronizacji, ostrzeżenie po godzinie, kod błędu dla rodzica, monitoring dostępności nie obejmuje kalendarzy, więc ostrzeżenie w interfejsie jest jedyną ochroną | Opóźnienie po stronie Google (zmiany potrafią docierać do kilku godzin) |
| 7 | **Dostawca zmienia zasady**: Google unieważnia tajny adres, administrator Workspace go wyłącza, iCloud wyłączony jako „kalendarz publiczny” | Ś | Ś | Czytelne kody błędów (`auth`, `not_found`) z instrukcją wymiany linku; wersja awaryjna opisana w PROJEKT.md (zostaje CalDAV albo API) | Konto Workspace z zablokowanym linkiem wymaga administratora |
| 8 | **Prywatność w rodzinie**: wydarzenia osobistego kalendarza rodzica (praca, lekarz) widzą dzieci; zaproszenia od obcych lądują w kalendarzu i na „Dziś” | W | Ś | Widoczność `private`, zalecenie osobnego kalendarza „Rodzina”, tekst jako zwykły tekst, odrzucanie `STATUS:CANCELLED` | Aplikacja nie rozpozna odrzuconego zaproszenia ani spamu w kalendarzu; ten problem leży po stronie kalendarza źródłowego |
| 9 | **Utrata lub zmiana klucza szyfrującego** (odtworzenie bazy na innej maszynie, nadpisane ustawienia serwera) | Ś | N | Kod błędu `key` z komunikatem „dodaj kalendarz ponownie”, klucz zapisany w menedżerze haseł, notatka w BACKUP.md | Linki trzeba dodać ręcznie, bez utraty innych danych |
| 10 | **Atak przez zawartość pliku**: złośliwy tytuł (HTML, bardzo długi, znaki sterujące), plik tworzony tak, by wywrócić parser | N | Ś | Zwykły tekst, przycinanie, `try/catch` wokół parsera i wątek roboczy | Błąd w `ical.js` (zależność pilnuje Dependabot) |
| 11 | **Nadmierne odpytywanie Google/Apple** (pętla restartów, wiele kalendarzy, odświeżanie przyciskiem) | N | Ś | `next_sync_at`, odstęp rosnący po błędach, limit „Odśwież teraz” | — |
| 12 | **Migracja na danych prawdziwej rodziny** | N | Ś | Tylko dodaje tabele, świeży backup przed wdrożeniem (zasada ze „Wdrożenie”), nowy kod działa bez klucza | Cofnięcie wersji zostawia nieużywane tabele |
| 13 | **Zbyt optymistyczne „Gotowe”**: zgodność sprawdzona na kilku zdarzeniach, a rodzina ma serie z wyjątkami | Ś | Ś | Protokół z rozdziału 7 na prawdziwych kalendarzach, w tym wyjątki i zmiana czasu | — |

## 6. Plan prac

Rozmiar całości: M, jak w planie. Kroki 1 i 2 da się zrobić bez interfejsu i bez prawdziwych kalendarzy.

1. **Parser i czas (`calendars/ics.ts`).** `ical.js`, sprawdzenie bundlowania esbuildem, wątek roboczy, wstępne odrzucanie starych wydarzeń (pomiar na prawdziwym pliku), strefy, limity. Testy na plikach z `apps/api/src/calendars/fixtures/` przy trzech strefach procesu.
2. **Pobieranie i szyfrowanie.** `fetch.ts` (lista hostów, przekierowania, limity), `crypto.ts`, konfiguracja (`CALENDAR_ENCRYPTION_KEY`, `CALENDAR_ALLOWED_HOSTS`, `CALENDAR_ALLOW_HTTP`), kody błędów.
3. **Schemat i synchronizacja.** Tabele, migracja `0008`, `runCalendarSync`, podmiana w miejscu zaślepki, odstępy, blokada, `demo.ts`.
4. **API.** Trasy z rozdziału 4.5, schematy w `shared`, testy uprawnień (dziecko nie dodaje, `private` niewidoczny dla innych, link nigdy w odpowiedzi).
5. **Interfejs.** `TodayEvents`, `CalendarsSheet`, sekcja w ustawieniach, stany błędów i nieaktualności, tryb ciemny.
6. **E2E i dokumentacja.** Serwer ICS w Playwright, page objecty, `e2e/README.md`, aktualizacja PLAN.md i PROJEKT.md, krótki wpis w BACKUP.md o kluczu i w WDROZENIE.md o zmiennych.
7. **Próba na produkcji.** Dodanie klucza do ustawień serwera, wdrożenie, protokół z rozdziału 7 z udziałem rodziców.

Testy automatyczne (kolejne punkty to konkretne przypadki):

- jednorazowe wydarzenie, całodniowe, wielodniowe, czas UTC, czas pływający, strefa Windows,
- seria tygodniowa z `EXDATE`, przesunięte wystąpienie, odwołane wystąpienie, seria z `COUNT` i `UNTIL`, seria bez końca, bomba `FREQ=SECONDLY`,
- zmiana czasu wiosną i jesienią, wydarzenie o 23:30 i kończące się o północy,
- ten sam wynik przy `TZ=UTC`, `TZ=Europe/Warsaw` i `TZ=America/Los_Angeles`,
- plik nie będący ICS (strona HTML), pusty kalendarz, plik za duży, bomba gzip, przekierowanie na adres prywatny, host spoza listy,
- awaria jednego kalendarza przy dwóch poprawnych, odstęp po błędach, brak duplikatów po powtórnym uruchomieniu, brak zmian przy tym samym skrócie i dniu,
- brak klucza (`503`), zły klucz (kod `key`), link nieobecny w żadnej odpowiedzi API ani logu.

## 7. Protokół odbioru („Gotowe, gdy”)

Ręczna próba na prawdziwych kalendarzach, jeden Google i jeden iCloud. W każdym utwórz wydarzenia, a potem porównaj ekran „Dziś” z aplikacją kalendarza na telefonie:

| Wydarzenie | Czego dowodzi |
|---|---|
| Dziś 18:00–19:00 | Podstawowa godzina w strefie polskiej |
| Dziś, cały dzień | Całodniowe bez przesunięcia o dzień |
| Od dziś na trzy dni | Wielodniowe widoczne każdego dnia |
| Co tydzień w poniedziałek, jedno wystąpienie usunięte | `EXDATE` |
| To samo, jedno wystąpienie przesunięte na inną godzinę | `RECURRENCE-ID` |
| Co dzień przez wiele dni w tygodniu przejścia na czas letni lub zimowy | Zmiana czasu |
| Dziś 23:30–00:30 | Granica dnia |
| Wydarzenie z zaproszeniem od innej osoby | Zwykłe wydarzenie z uczestnikami |
| Zmiana tytułu istniejącego wydarzenia | Odświeżenie po synchronizacji (do 15 minut plus opóźnienie dostawcy) |
| Celowo zepsuty link (reset w Google, wyłączenie publicznego kalendarza w iCloud) | Błąd widoczny, drugi kalendarz działa dalej |

Przy iCloud pamiętaj, że kalendarzy „Urodziny” i „Święta” nie da się opublikować, więc nie należą do próby.

## 8. Decyzje do podjęcia

| Pytanie | Rekomendacja |
|---|---|
| Widoczność kalendarza: tylko `family` i `private`, czy też „tylko rodzice”? | Dwie wartości; dodatkowa zwiększyłaby tylko liczbę pytań w formularzu |
| Domyślna widoczność nowego kalendarza | `family`, ale z jawnym, widocznym wyborem w formularzu |
| Lista dozwolonych hostów: szeroka czy ścisła? | Ścisła (Google, iCloud); Outlook i inni po jednej zmiennej w ustawieniach, gdy będą potrzebni |
| Wątek roboczy czy limit 2 MB | Wątek roboczy; jeśli komplikuje build, limit 2 MB |
| Zarządzanie w ustawieniach czy nowa zakładka | Ustawienia, bo pasek ma już pięć pozycji |
| Okno przyszłości: tylko dziś czy kilka dni | Okno 45 dni w bazie, a „Dziś” pokazuje tylko dzisiaj; „najbliższe dni” bez kosztu zmian w danych |
| Rezygnacja ze zbiorczego `/api/today` | Tak, patrz rozdział 4.5 |

## 9. Wykonanie: różnice względem projektu

Etap zrobiony 10 listopada 2026. Zmiany względem rozdziałów 4 i 8, wprowadzone przy pisaniu kodu:

| Temat | Projekt | Wykonanie i powód |
|---|---|---|
| Parsowanie | Wątek roboczy (`worker_threads`) | **Główny wątek z limitem 2 MB** po odrzuceniu starych wydarzeń (wariant zapasowy z rozdziału 8). Wątek roboczy wymagał drugiego wejścia w `esbuild` i osobnego ładowania w testach, a wstępne odrzucanie starych wydarzeń (`dropOldEvents`) tnie koszt pliku z długą historią, więc zysk nie uzasadniał złożoności |
| Limity pobierania | 4 MB po rozpakowaniu | 5 MB po rozpakowaniu przy pobieraniu, a potem 2 MB tekstu po odrzuceniu starych wydarzeń; powyżej tego błąd `too_large` |
| Limit kroków serii | 2000 | 20 000 kroków albo 2 s na serię. Seria dzienna od 2020 roku potrzebuje 2500 kroków, więc 2000 odrzucałoby poprawne wydarzenia |
| Strefy | IANA → Windows → `VTIMEZONE` → polska | IANA → Windows → polska. `VTIMEZONE` z pliku pomijamy: czas ścienny liczymy w strefie z nazwy, co daje ten sam wynik bez rejestrowania stref w `ical.js` i bez zależności od jakości definicji w pliku |
| Nieistniejąca godzina przy zmianie czasu | Przesunięcie o godzinę wstecz (obserwowane w `ical.js`) | Przesunięcie o godzinę do przodu (02:30 → 03:30), zgodnie z RFC 5545; przetestowane |
| Dodawanie kalendarza | Pobranie i parsowanie, potem zapis | Tak samo: `probeCalendar` sprawdza link przed zapisem, a kalendarz i wydarzenia trafiają do bazy jednej transakcji |
| Zmiana nazwy | Dostępna | Dostępna w API (`PATCH`), ale interfejs jej jeszcze nie ma: rodzic zmienia widoczność, wymienia link, odświeża i odpina |
| CLI | `calendar list`, `calendar sync` | Zrobione; nie wypisują linków |

Dodatkowo: konfiguracja (`loadConfig`) odmawia startu przy `NODE_ENV=production` i `CALENDAR_ALLOW_HTTP=true`, a serwer ICS dla testów e2e (`e2e/src/setup/icsServer.mjs`) działa na porcie 5199.

Zakres testów: `calendars/ics.test.ts` (parser, strefy, zmiana czasu, serie, wyjątki, bomba, niezależność od `TZ` przy czterech strefach procesu), `calendars/fetch.test.ts` (lista hostów, przekierowania, adresy prywatne, limity, szyfrowanie), `calendars.test.ts` (API, uprawnienia, widoczność, synchronizacja, odstępy po błędach, brak adresu w odpowiedziach i logach) i `e2e/tests/calendars.spec.ts`.
