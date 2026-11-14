# Ogarniacz: dokumentacja projektu

Stan na 14 listopada 2026. Kolejność prac opisuje [PLAN.md](PLAN.md).

Plik opisuje tylko to, co **jest** w kodzie. Planowane prace, ich projekt i decyzje są w [plany/](plany/), a tutaj najwyżej jednym zdaniem z odnośnikiem.

## 1. Cel

Ogarniacz to prywatna aplikacja dla jednej rodziny. Zbiera w jednym miejscu to, co dziś jest rozproszone: domowe zadania, listę zakupów i kalendarze. Ma odpowiadać na pytanie „co dziś mam ogarnąć?” i przypominać o tym powiadomieniem na telefonie.

**Użytkownicy:** rodzice i dzieci, każde z własnym telefonem. Aplikacja musi działać zarówno na iPhonie, jak i na Androidzie.

**Poza zakresem:**

- rejestracja otwarta dla obcych i obsługa wielu rodzin,
- aplikacje w App Store i Google Play,
- integracja z Google Keep, bo oficjalne API obsługuje tylko konta firmowe Workspace,
- zapis do kalendarzy Google i iCloud w pierwszej wersji.

## 2. Funkcje

| Funkcja | Opis | Stan |
|---|---|---|
| Kanban | Statusy „Do zrobienia”, „W trakcie”, „Gotowe”, archiwum zamiast kasowania, historia zmian | Jest, z filtrem „moje”, kolorem karteczki i widokiem archiwum otwieranym z tablicy |
| Konta i role | Rodzic i dziecko, konta zakłada rodzic zaproszeniem | Jest: logowanie, sesje, uprawnienia z rozdziału 6, zmiana własnego hasła i „Wyloguj inne urządzenia” w ustawieniach, a dla rodzica podstrona „Rodzina”: zaproszenie z linkiem i kodem QR, link do nowego hasła, lista kont, wyłączanie kont dzieci, oczekujące zaproszenia i dziennik logowań; ekran przyjęcia zaproszenia pod adresem `/#zaproszenie=…`; kreator pierwszego uruchomienia zakłada pierwszego rodzica na pustej bazie, z kodem z logu serwera ([plany/KONTA.md](plany/KONTA.md)). CLI zostaje drogą zapasową |
| Przypisanie i termin | Osoba odpowiedzialna i data wykonania | Jest; termin to dzień, bez godziny |
| Zadania cykliczne | Np. śmieci, podlewanie kwiatów | Jest: co tydzień w wybrane dni, co N dni, co miesiąc, pauza |
| Lista zakupów | Podpowiedzi z historii, działanie offline | Jest: wspólna lista, ilość, koszyk, podpowiedzi, praca bez sieci z kolejką zmian |
| Kalendarze | Odczyt linków ICS z Google i iCloud, tylko do odczytu; projekt w [archiwum/KALENDARZE-PROJEKT.md](archiwum/KALENDARZE-PROJEKT.md), instrukcja w [instrukcje/KALENDARZE.md](instrukcje/KALENDARZE.md) | Jest, działa na produkcji (etap 6): link ICS szyfrowany, synchronizacja co 15 minut, sekcja w „Dziś”, zarządzanie w ustawieniach |
| Ekran „Dziś” | Wydarzenia, moje zadania, zakupy | Jest: wydarzenia z kalendarzy rodziny (ze stanem synchronizacji), moje zadania na dziś i zaległe, pasek postępu dnia, skrót listy zakupów |
| Ustawienia osoby | Wygląd, tryb, kolor osoby, powiadomienia, hasło, wylogowanie; dla rodzica rodzina i kalendarze | Jest: arkusz otwierany imieniem w nagłówku, z menu i podstronami (opis niżej, „Ustawienia”) |
| Kieszonkowe i nagrody | Stała kwota na tydzień i nagrody za wyróżnione zadania | Jest: nagroda na zadaniu, ekran „Kieszonkowe” dla dziecka i rodzica, stawki, oznaczanie wypłat |
| Powiadomienia | Web Push: przypomnienie o przypisanym zadaniu, o terminie jutro i poranne podsumowanie; ustawienia osoby | Jest, wdrożone na produkcji z kluczami VAPID (etap 7): zgoda po kliknięciu, urządzenia osoby, rodzaje, godzina podsumowania, cisza nocna. Sprawdzone na prawdziwych telefonach, także na Androidzie (11 listopada 2026) |

**Zasady UX na telefonie:** widać jedną kolumnę Kanbana naraz, a status zmienia się przyciskiem. Przeciąganie jest tylko dodatkiem: kartę przytrzymuje się palcem i upuszcza na zakładce statusu, a krótki ruch dalej przewija listę. Ekrany przełącza pasek nawigacji przypięty do dołu ekranu, w zasięgu kciuka. Pasek ma najwyżej pięć pozycji i pokazuje same ikony (kalendarz, whiteboard, wózek, strzałki, skarbonka), każda w komórce tej samej szerokości; nazwę ekranu niesie `aria-label`. W jasnym trybie jest białą karteczką z koralowym podświetleniem aktywnej pozycji, w ciemnym ciemnym brązem z żółtą ikoną. Archiwum nie ma w nim miejsca: otwiera je przycisk na tablicy, obok filtra „Tylko moje”.

**Wygląd „Lodówka”:** kremowe tło, zadania jako białe karteczki przekrzywione o ułamek stopnia, ciemny koral jako kolor marki i krój Bricolage Grotesque, dołączony do aplikacji, żeby wyglądała tak samo bez internetu. Każda osoba ma swój kolor, widoczny jako kółko z inicjałem na karcie zadania, w archiwum i przy regułach cyklicznych. Logo to kremowa lodówka z żółtą karteczką z ptaszkiem przypiętą magnesem na koralowym tle (źródło: `apps/web/public/icons/logo.svg`, PNG-i generuje `scripts/icons.mjs`); jest ikoną aplikacji i stoi obok nazwy w nagłówku. Powiadomienia na Androidzie mają na pasku stanu osobny znak, białą sylwetkę lodówki z ptaszkiem na przezroczystym tle (`badge.svg`, `badge-96.png`), bo Android maluje ten znak jednym kolorem według przezroczystości i pełna ikona dałaby jednolity kwadrat.

- **Kolory w jednym miejscu.** Wszystkie kolory interfejsu to nazwane zmienne w `apps/web/src/index.css` (`paper`, `ink`, `brand`, `card`, `chrome` i inne). Komponenty nie używają wpisanych na sztywno kolorów, dzięki czemu tryb ciemny podmienia tylko wartości zmiennych.
- **Wygląd.** Trzy kierunki graficzne do wyboru w ustawieniach: „Lodówka” (domyślna), „Wieczorny las” (ciemnozielony pas z pierścieniem postępu w „Dziś”, zaokrąglone karty, miękkie cienie, krój DM Sans) i „Naklejki” (żółte tło, grube kontury i twarde cienie, krój Space Grotesk). Wybór dotyczy jednego urządzenia, leży w `localStorage` (`ogarniacz.look`) i ustawia `data-look` na `<html>`; „Lodówka” nie ma atrybutu. Wygląd jest niezależny od trybu jasny/ciemny, a każdy ma trzy bloki zmiennych w `index.css` (jasny, ciemny wymuszony, ciemny z telefonu). Kształt kart (promienie, cienie, przechył) idzie przez nadpisanie zmiennych Tailwinda `--radius-*`, `--shadow-card`, `--shadow-lift` i `--tilt`, więc komponenty nie znają wyglądów.
- **Tryb.** Domyślnie jak w telefonie (`prefers-color-scheme`), w ustawieniach można wymusić jasny albo ciemny. Wybór dotyczy jednego urządzenia i leży w `localStorage`. Plik `public/theme.js`, wczytany w `index.html` jako zwykły blokujący skrypt, ustawia `data-theme` (i `data-look`) na `<html>` przed pierwszym malowaniem, więc ekran nie miga przy starcie. Tryb ciemny to ciepły brąz zamiast czerni i jaśniejszy koral z ciemnym tekstem.
- **Kolor osoby.** Do wyboru jest 8 nazwanych kolorów (`PERSON_COLORS` w `packages/shared`). Kolory mogą się powtarzać między osobami. Bez wyboru osoba dostaje kolor według kolejności zakładania kont, więc jest on taki sam na każdym telefonie. Wszystkie odcienie są jasne, a inicjał zostaje ciemny w obu motywach.
- **Kolor karteczki.** Przy dodawaniu i w edytorze zadania można wybrać jeden z 6 kolorów (`TASK_COLORS` w `packages/shared`) albo zostawić zwykłą karteczkę. Kolor jest cechą zadania, więc cała rodzina widzi go tak samo, na tablicy i w „Dziś”. Karteczka nie bierze pełnego odcienia, tylko jego domieszkę do koloru karteczki danego wyglądu (`--color-task-*` w `index.css`): 30% w trybie jasnym i 18% w ciemnym (`--task-tint`), tak żeby szary tekst pod tytułem był czytelny jak na zwykłej karteczce. Zaległa karteczka z kolorem zachowuje go, a o zaległości mówią obwódka i napis „Zaległe”.
- **Ustawienia.** Arkusz od dołu z krótkim menu, które mieści się na ekranie bez przewijania: grupa „Ty” („Wygląd i kolor”, „Powiadomienia”, „Hasło i urządzenia”), dla rodzica grupa „Dom” („Rodzina”, „Kalendarze”) i „Wyloguj”. Przy pozycji stoi jej stan, np. „Włączone”, „3 osoby · zaproszenia: 1” albo „Problem: 1” przy kalendarzu z błędem. Pozycja otwiera podstronę w tym samym arkuszu (bez arkusza na arkuszu), a „Dziennik logowań” jest podstroną „Rodziny”. Escape i przycisk „Wróć” cofają o poziom, a zamknięcie arkusza wraca do menu i zapomina otwarte formularze z hasłem oraz link z tokenem. W demo nie ma „Powiadomień” ani „Hasła i urządzeń”. Na podstronie „Rodzina” akcje konta pokazują się dopiero po stuknięciu w osobę.
- **Dostępność.** Kolor osoby i kolor karteczki są tylko ozdobą: imię zawsze stoi obok tekstem, a wybór koloru ma nazwy kolorów dla czytnika ekranu. Animacje wyłączają się przy ograniczonym ruchu w ustawieniach telefonu.

**Kieszonkowe i nagrody:**

- **Stała kwota.** Każde dziecko ma kieszonkowe na tydzień, domyślnie 50 zł. Rodzic zmienia je na ekranie „Kieszonkowe”, osobno dla każdego dziecka; zero oznacza same nagrody. Nowa kwota obowiązuje od trwającego tygodnia i nie działa wstecz.
- **Nagroda na zadaniu.** Rodzic może dodać do zadania nagrodę: 5, 10, 15 zł albo własną kwotę w pełnych złotych. Na karteczce widać ją jako żółtą plakietkę. Dziecko nie ustawia nagrody i nie zmienia nazwy zadania, które ją ma.
- **Naliczanie.** Nagrodę dostaje dziecko przypisane do zadania, gdy trafia ono do „Gotowe”, także po terminie. Zadanie dla chętnych nagradza dziecko, które je wzięło. Cofnięcie z „Gotowe” zdejmuje nagrodę, archiwizacja ukończonego zadania jej nie zabiera. Nie ma osobnego zatwierdzania: rodzic przegląda listę przy wypłacie.
- **Tydzień i wypłata.** Tydzień trwa od poniedziałku do niedzieli według dnia ukończenia zadania w czasie polskim, a wypłata jest w następny poniedziałek. Rodzic oznacza ją przyciskiem „Wypłacone” z potwierdzeniem; kwota zapisuje się wtedy na stałe. Niewypłacony tydzień czeka na ekranie przez cztery tygodnie.
- **Kto co widzi.** Dziecko widzi tylko swoją kwotę: ile dostanie w poniedziałek, z czego się składa i na czym może jeszcze zarobić. Rodzic widzi wszystkie dzieci, sumę do przygotowania i ostatnie wypłaty.

Planowane dokończenie kieszonkowego (m.in. ukrycie ekranu, gdy w rodzinie nie ma dziecka) i pomysły na rozwój, także te ze szkicem, są w [plany/ROZWOJ.md](plany/ROZWOJ.md).

## 3. Architektura

```text
iPhone / Android (PWA)
        │ HTTPS, cookie sesji
        ▼
proxy z HTTPS (np. nginx albo Caddy)
        │ 127.0.0.1:3000
        ▼
Proces Node.js: Hono
  ├── /api/*        API
  ├── /*            zbudowany front
  ├── node-cron     zadania cykliczne, backup, synchronizacja ICS, powiadomienia push
  └── SQLite        plik z DATABASE_PATH, poza katalogiem z kodem
        │
        ├──► Google / iCloud: pobieranie linków ICS
        └──► Apple / Google / Mozilla: wysyłka Web Push
```

### Stack

| Warstwa | Wybór | Uzasadnienie |
|---|---|---|
| Front | React, Vite, TypeScript, `vite-plugin-pwa` | Instalacja na ekranie głównym, bez sklepów |
| Stan i UI | TanStack Query, Tailwind, dnd-kit | Prosta synchronizacja z API i obsługa dotyku |
| Backend | Hono, Zod | Dobre typowanie, testy bez stawiania serwera |
| Baza | SQLite, `better-sqlite3`, Drizzle | Jeden plik, łatwy backup, wystarcza dla kilku osób |
| Zadania w tle | `node-cron` w procesie API | Bez kolejek i osobnych usług |
| Testy | Vitest, Playwright | Push wymaga dodatkowo prawdziwego iPhone'a |

Odrzucone: NestJS (przesada przy tej skali) i Next.js (cała aplikacja jest za logowaniem, więc SSR niewiele daje).

### Struktura repozytorium

```text
apps/api          # Hono, Drizzle, harmonogram; w produkcji serwuje też front
apps/web          # PWA
packages/shared   # schematy Zod i typy wspólne dla frontu i API
e2e               # testy Playwright na profilach telefonów
docs              # dokumentacja
```

### Decyzje architektoniczne

1. **Jedna domena i jedno wdrożenie.** Hono serwuje front, więc odpada CORS, a sesja to zwykłe cookie.
2. **Brak kasowania.** Rekordy dostają `archived_at`, a zmiany trafiają do tabeli historii.
3. **Kontrakt w `packages/shared`.** Schematy Zod są jedynym źródłem typów dla frontu i walidacji API.
4. **Jeden proces.** Harmonogram działa w API, więc aplikacja musi mieć dokładnie jedną instancję.
5. **Czas.** W bazie trzymamy UTC, a harmonogram i pojęcie „dziś” liczymy w strefie `Europe/Warsaw`.
6. **Identyfikatory nadaje klient tam, gdzie działa offline.** UUID z telefonu sprawia, że ponowne wysłanie tej samej operacji jej nie zdubluje.
7. **Ustawienia urządzenia lokalnie, ustawienia osoby w bazie.** Wygląd i tryb zapisujemy na telefonie, bo ta sama osoba może chcieć innego na różnych urządzeniach. Kolor osoby jest w bazie, bo widzi go cała rodzina. Tak samo kolor karteczki: zapisany przy zadaniu, a nie wyliczany z osoby, bo osobę pokazuje już kółko z inicjałem.

## 4. Model danych

**Jest:** `tasks` (tytuł, status, `assignee_id`, `assigned_by`, `due_on`, `created_by`, `recurrence_id`, `reward`, `color` (kolor karteczki, pusty przy zwykłej), `completed_at`, `payout_id`, daty, `archived_at`), `task_events` (historia zmian z `actor_id`), `recurrences`, `shopping_items`, `allowance_rates`, `payouts`, `users` (z kolorem osoby `color`, pustym przy przydziale domyślnym), `sessions` i `auth_events`.

**Dziennik logowań (migracja `0010`):** `auth_events` zapisuje `type` (`login_ok`, `login_failed`, `locked`, `logout`, `logout_all`, `password_changed`, `account_created`, `password_reset`, `account_disabled`, `account_enabled`, `invite_created`, `invite_accepted`, `invite_revoked`, `setup_done` po kreatorze pierwszego uruchomienia), konto `user_id` (puste, gdy login nie istnieje), wykonawcę `actor_id`, adres klienta `ip`, opis przeglądarki `user_agent` (do 200 znaków) i krótki kod `detail` (powód nieudanego logowania, `password_change` albo `confirm` przy złym haśle potwierdzającym, zakres blokady, `sessions:N`, czyli liczba wylogowanych urządzeń, `cli` albo `invite` jako źródło zmiany konta, rodzaj i login zaproszenia). Wpisanego loginu, który nie pasuje do konta, nie zapisujemy, bo w polu loginu bywa hasło. Wpisy starsze niż 90 dni usuwa harmonogram: to wyjątek od zasady „nic nie kasujemy”, bo adres IP to dana osobowa, a dziennik nie jest daną rodziny. Podgląd: `user log` w CLI i `GET /api/auth/events` dla rodzica.

**Zaproszenia (migracja `0011`):** `invites` to jednorazowe zaproszenie na nowe konto (`kind` `new_account`, z `login`, `name` i `role`) albo link do nowego hasła (`password_reset`, z `user_id` konta i kopią loginu oraz imienia). Rodzic, który je wystawił, to `created_by`. Token ma 256 bitów, a w bazie jest tylko jego skrót SHA-256 (`token_hash`, unikalny). Zaproszenie jest ważne 24 godziny (`expires_at`); użyte dostaje `used_at` (przy nowym koncie `user_id` wskazuje wtedy założone konto), unieważnione `revoked_at`. Wierszy nie kasujemy.

Kieszonkowe opiera się na trzech kolumnach zadania i dwóch tabelach. `reward` to nagroda w pełnych złotych. `completed_at` to chwila wejścia w „Gotowe”, czyszczona przy cofnięciu; od niej zależy tydzień nagrody. `payout_id` wskazuje wypłatę, w której nagroda została już policzona, więc cofnięte i ponownie ukończone zadanie nie liczy się drugi raz. `allowance_rates` trzyma stawkę dziecka z poniedziałkiem, od którego obowiązuje (`effective_from`); stawka tygodnia to ostatni wiersz nie późniejszy niż ten tydzień, a dziecko bez wiersza ma 50 zł. `payouts` to wypłata oznaczona przez rodzica: dziecko, tydzień, zapisane kwoty `base` i `rewards`, kto i kiedy; jedna na dziecko i tydzień. Sumy niewypłaconych tygodni liczymy na żywo z zadań. Niewypłacona nagroda należy do tygodnia ukończenia zadania, a gdy ten jest już wypłacony albo starszy niż cztery tygodnie, przechodzi na trwający tydzień.

`shopping_items` trzyma produkt z listy zakupów: `name`, `name_key` (nazwa małymi literami, bez zbędnych spacji), `quantity` jako wolny tekst, `checked_at` i `checked_by` dla koszyka, `added_by`, daty i `archived_at`. Kolumny `checked_changed_at` i `edited_at` to czasy ostatniej zmiany odhaczenia i nazwy z ilością według telefonu, potrzebne do rozstrzygania konfliktów (rozdział 8). Identyfikator nadaje telefon, a ponowione dodanie z tym samym identyfikatorem zwraca istniejący produkt. Wyczyszczone z koszyka i usunięte produkty dostają `archived_at` i zostają w bazie. Podpowiedzi liczymy z tej samej tabeli: to produkty odhaczone kiedykolwiek, zgrupowane po `name_key`, z pisownią i ilością z ostatniego zakupu. Usunięta bez kupienia pomyłka do nich nie trafia. Osobna tabela podpowiedzi okazała się niepotrzebna.

`recurrences` trzyma regułę cykliczną: tytuł, osobę, wzorzec w JSON (`weekly` z dniami tygodnia, `interval` co N dni od `start_on`, `monthly` z dniem miesiąca przycinanym do ostatniego dnia), pauzę (`paused_at`, `paused_until`) i kursor `last_due_on`. Harmonogram co godzinę i przy starcie tworzy zadanie z terminem na dzień wystąpienia. Kursor i zadanie zapisują się w jednej transakcji, a indeks unikalny `(recurrence_id, due_on)` blokuje duplikaty. Gdy poprzednie zadanie z reguły jest otwarte, nowe nie powstaje, a dzień przepada. Po przestoju serwera powstaje tylko ostatnie zaległe wystąpienie. Zadania z harmonogramu mają w historii pusty `actor_id`.

`calendars` trzyma kalendarz z linku ICS: nazwę, link zaszyfrowany AES-256-GCM (`url_enc`, format `v1:<iv>:<tag>:<szyfrogram>`, z identyfikatorem kalendarza jako danymi uwierzytelnianymi), sam host do pokazania (`url_host`), widoczność `scope` (`family` albo `private`), właściciela, stan synchronizacji (`last_attempt_at`, `last_success_at`, `last_error` jako kod, `failures`, `next_sync_at`, `etag`, `last_modified`, `content_hash`, `synced_day`) i `archived_at`. Przy odpięciu kalendarza link jest zerowany: to poświadczenie, a nie dana historyczna. `calendar_events` trzyma rozwinięte wystąpienia z okna od wczoraj do 45 dni: tytuł (do 200 znaków), miejsce (do 120), `all_day`, chwile UTC `starts_at` i `ends_at` oraz dni `start_on` i `end_on` w czasie polskim, obie granice włącznie. Każda synchronizacja podmienia wystąpienia kalendarza w jednej transakcji, a opisów, uczestników i linków do spotkań nie zapisujemy. Szczegóły i uzasadnienia: [archiwum/KALENDARZE-PROJEKT.md](archiwum/KALENDARZE-PROJEKT.md).

Termin `due_on` to dzień kalendarzowy `RRRR-MM-DD` w strefie `Europe/Warsaw`, a nie chwila w UTC. Zadanie jest zaległe, gdy termin minął, a status nie jest „Gotowe”.

**Powiadomienia (etap 7, migracja `0009`):** `push_subscriptions` to urządzenie osoby: `user_id`, `endpoint` (unikalny, więc ten sam telefon po zmianie konta przechodzi na nową osobę), klucze `p256dh` i `auth`, `last_success_at`, `last_error` i `failures`. Wygasłą subskrypcję (odpowiedź `404` albo `410`) usuwamy od razu, a urządzenie z pięcioma nieudanymi wysyłkami z rzędu uznajemy za martwe. `notification_prefs` trzyma ustawienia osoby (rodzaje `morning`, `assigned`, `due`, `morning_hour`, cisza nocna `quiet_from` i `quiet_to`); brak wiersza oznacza wartości domyślne z `DEFAULT_NOTIFICATION_PREFS` w `shared`. `notifications` to dziennik wysłanych powiadomień z unikalnym `dedupe_key`, np. `morning:2026-11-10:<osoba>`: wiersz powstaje przed wysyłką, więc drugie uruchomienie zadania (restart serwera, nakładające się wywołania) niczego nie dubluje.

## 5. API

**Jest:**

| Metoda | Ścieżka | Działanie |
|---|---|---|
| GET | `/api/tasks` | Zadania niezarchiwizowane; `?archived=true` zwraca 200 ostatnio zarchiwizowanych |
| GET | `/api/tasks/today` | Moje zadania na dziś i zaległe, z dzisiejszą datą według serwera |
| POST | `/api/tasks` | Nowe zadanie z osobą, terminem, nagrodą i kolorem karteczki (`color`); dziecko tylko dla siebie i bez nagrody |
| PATCH | `/api/tasks/:id` | Zmiana pól, osoby, terminu, statusu, nagrody (`reward`, tylko rodzic), koloru karteczki (`color`, nazwa z palety albo `null`), archiwizacja lub przywrócenie, według rozdziału 6 |
| GET | `/api/allowance` | Kieszonkowe: trwający tydzień i zamknięte tygodnie; rodzic dostaje wszystkie dzieci, dziecko siebie i otwarte zadania z nagrodą |
| PUT | `/api/allowance/rates` | Stawki dzieci (`{ rates: [{ childId, amount }] }`), od trwającego tygodnia; tylko rodzic |
| POST | `/api/allowance/payouts` | Oznacza wypłatę za zamknięty tydzień (`{ childId, weekStart }`); powtórzone nic nie zmienia; tylko rodzic |
| GET | `/api/users` | Aktywni członkowie rodziny do wyboru osoby, z kolorem każdej osoby |
| PATCH | `/api/users/me` | Zmiana własnego koloru (`{ color }`, nazwa z palety albo `null`); każdy, także dziecko |
| GET | `/api/shopping` | Lista zakupów: do kupienia i w koszyku; każdy, także dziecko |
| GET | `/api/shopping/suggestions` | Kupowane produkty od najczęstszych, z ostatnią ilością |
| POST | `/api/shopping` | Nowy produkt (`{ id?, name, quantity? }`); ten sam `id` drugi raz zwraca istniejący |
| PATCH | `/api/shopping/:id` | Nazwa, ilość, odhaczenie (`checked`) albo usunięcie pomyłki (`removed`); `changedAt` to czas zmiany na telefonie |
| POST | `/api/shopping/clear` | Czyści z koszyka wskazane produkty (`{ ids }`); nieodhaczone zostają |
| GET | `/api/recurrences` | Reguły cykliczne z najbliższym dniem wystąpienia, tylko rodzic |
| POST | `/api/recurrences` | Nowa reguła; jeśli wypada dziś, od razu tworzy zadanie |
| PATCH | `/api/recurrences/:id` | Zmiana tytułu, osoby, wzorca, pauza (`{ until }`), wznowienie (`null`) i usunięcie |
| POST | `/api/auth/login` | Logowanie, ustawia cookie sesji |
| POST | `/api/auth/logout` | Wylogowanie |
| GET | `/api/auth/me` | Zalogowany użytkownik |
| GET | `/api/auth/events` | Dziennik logowań i zmian kont, ostatnie 100 wpisów, z imieniem osoby i wykonawcy; tylko rodzic |
| GET | `/api/invites` | Oczekujące zaproszenia (rodzaj, dla kogo, kto wystawił, termin ważności), bez tokenów; tylko rodzic |
| POST | `/api/invites` | Zaproszenie nowej osoby (`{ kind: 'new_account', login, name, role, confirm }`) albo link do nowego hasła (`{ kind: 'password_reset', userId, confirm }`), gdzie `confirm` to hasło rodzica; `201` z tokenem, jedyny raz; najwyżej 5 oczekujących i 10 aktywnych kont razem z oczekującymi zaproszeniami; login zajęty od chwili zaproszenia; nowszy link do hasła unieważnia starszy; tylko rodzic; w demo `403` |
| DELETE | `/api/invites/:id` | Unieważnia oczekujące zaproszenie (`204`); tylko rodzic; w demo `403` |
| POST | `/api/invites/preview` | Rodzaj, imię i login dla tokenu z treści żądania; publiczne |
| POST | `/api/invites/accept` | Ustawia hasło (`{ token, password }`): zakłada konto (`201`) albo zmienia hasło i wylogowuje tę osobę wszędzie (`200`), a potem loguje na tym urządzeniu; rodzice dostają push; publiczne; w demo `403` |
| GET | `/api/setup` | `{ needed: true }`, gdy serwer wystartował z pustą bazą, kod jest ważny i nadal nie ma żadnego konta (także wyłączonego); inaczej `404`; publiczne; w demo zawsze `404` |
| POST | `/api/setup` | Kreator pierwszego uruchomienia (`{ code, name, login, password }`): zakłada pierwszego rodzica (`201`) i loguje go; zły kod `403`, 5 złych kodów z adresu w 15 minut `429`, a po 20 złych kodach razem kod wygasa do restartu serwera; gdy konto już jest, `404`; publiczne; w demo `404` |
| GET | `/api/users/accounts` | Konta rodziny ze stanem, ostatnim logowaniem (z dziennika, do 90 dni) i ostatnim użyciem; tylko rodzic |
| PATCH | `/api/users/:id` | Wyłączenie albo włączenie konta dziecka (`{ disabled, confirm }`); wyłączenie wylogowuje je wszędzie; konto rodzica `403`; tylko rodzic; w demo `403` |
| POST | `/api/auth/password` | Zmiana własnego hasła (`{ current, next }`, `204`); złe obecne hasło `403` z tym samym limitem prób co logowanie; wylogowuje pozostałe urządzenia, bieżące zostaje; w demo `403` |
| POST | `/api/auth/logout-all` | Wylogowuje osobę na pozostałych urządzeniach, bieżące zostaje; zwraca `{ count }`; w demo `403` |
| GET | `/api/calendars` | Kalendarze z hostem, widocznością, czasem ostatniego sukcesu i błędem (kod i komunikat); link nigdy nie wraca; tylko rodzic (własne prywatne i rodzinne) |
| POST | `/api/calendars` | Nowy kalendarz (`{ name, url, scope }`): link jest od razu pobierany i parsowany, błędny nie zostaje zapisany; link `webcal://` jest zamieniany na `https://`; tylko rodzic; w demo `403`, bez klucza na serwerze `503` |
| PATCH | `/api/calendars/:id` | Nazwa, widoczność (`scope`), wymiana linku (`url`, sprawdzana od razu) albo odpięcie (`archived`, kasuje link i wydarzenia, `204`); tylko rodzic |
| POST | `/api/calendars/:id/sync` | „Odśwież teraz”, najwyżej raz na minutę (`429`); tylko rodzic |
| GET | `/api/events` | Wydarzenia od `date` (domyślnie dziś) przez `days` dni (1 do 14) z kalendarzy widocznych dla osoby, ze stanem synchronizacji (`lastSuccessAt`, `stale`, `failing`); każdy, także dziecko |
| GET | `/api/push/config` | Czy serwer ma powiadomienia (`enabled`), klucz publiczny VAPID i liczba urządzeń zalogowanej osoby; każdy |
| POST | `/api/push/subscriptions` | Zapisuje urządzenie osoby (`{ endpoint, keys }`); tylko znane usługi push (Apple, Google, Mozilla, Microsoft), najwyżej 10 urządzeń na osobę; bez kluczy VAPID na serwerze `503` |
| DELETE | `/api/push/subscriptions` | Wyłącza urządzenie (`{ endpoint }`); tylko własne, `204` |
| GET, PATCH | `/api/push/prefs` | Ustawienia powiadomień osoby; `PATCH` przyjmuje dowolny podzbiór pól |
| POST | `/api/push/test` | Testowe powiadomienie na własne urządzenia, najwyżej raz na 15 sekund |
| GET | `/api/demo` | Lista kont przykładowych; tylko w trybie `DEMO_MODE`, poza nim zwykłe `404`; publiczne |
| POST | `/api/demo/login` | Wejście na konto przykładowe bez hasła (`{ login }`); tylko w trybie `DEMO_MODE`; publiczne |
| GET | `/api/health` | Stan serwera, publiczny dla monitoringu |

Zbiorczy `/api/today` (zadania, zakupy, wydarzenia w jednej odpowiedzi) nie jest planowany: „Dziś” składa się z osobnych zapytań.

Wszystko poza logowaniem, `/api/health`, podglądem i przyjęciem zaproszenia oraz kreatorem pierwszego uruchomienia wymaga sesji (bez niej `401`), a uprawnienia są sprawdzane w API, nie tylko w interfejsie. Żądania zmieniające dane z innej domeny są odrzucane (`403`). Pierwszego rodzica zakłada kreator, kolejne konta przyjęte zaproszenie od rodzica, a w razie awarii CLI na serwerze.

**Kod pierwszego uruchomienia.** Serwer, który startuje poza demo z pustą bazą, losuje kod z 8 znaków (alfabet bez 0, O, 1, I i L, około 40 bitów) i wypisuje go w logu jako `[start] pusta baza, kod pierwszego uruchomienia: K7M2-9QXD`. Kod żyje tylko w pamięci procesu: zmienia się przy każdym starcie, a po założeniu konta albo 20 złych próbach wygasa. Formularz przyjmuje małe litery, spacje i myślnik. Warunek „brak kont” jest sprawdzany w tej samej transakcji co zapis, więc dwa równoczesne żądania nie założą dwóch kont.

Zły, użyty, wygasły i unieważniony token zaproszenia dają ten sam `404` „To zaproszenie jest nieważne. Poproś rodzica o nowe”, a 20 złych tokenów z jednego adresu w 15 minut daje `429`. Hasło potwierdzające (`confirm`) i obecne hasło przy jego zmianie liczą się do tego samego limitu prób co logowanie; pomyłka to `403`, nie `401`.

Każdy błąd ma postać `{ error: 'komunikat po polsku' }`, także błąd walidacji (pierwszy komunikat ze schematu; pole bez własnego komunikatu daje „Niepoprawne dane w polu …”), niepoprawny JSON i nieoczekiwany błąd serwera (`500`, „Coś poszło nie tak”, szczegóły tylko w logu). Żądanie większe niż 100 kB dostaje `413` jeszcze przed logowaniem.


## 6. Role i uprawnienia

Założenie robocze do potwierdzenia, od etapu 3 egzekwowane w API. „Swoje zadanie” dziecka to zadanie przypisane do niego. Zadanie bez osoby dziecko może wziąć: zmiana statusu przypisuje je do dziecka, ale tytuł i termin takiego zadania zmienia tylko rodzic. Status można cofnąć o krok. Zadanie w „Do zrobienia” dziecko może oddać, żeby wróciło jako „dla chętnych”, ale tylko gdy samo je wzięło lub dodało; zadania przydzielonego przez rodzica nie odda. Kto ustawił osobę, zapisuje kolumna `assigned_by`. Role są dwie, ale szczegóły mogą się zmienić po zobaczeniu, jak aplikacji używają dzieci:

| Akcja | Rodzic | Dziecko |
|---|---|---|
| Widzi zadania i zakupy rodziny | Tak | Tak |
| Tworzy zadania | Tak | Tylko dla siebie |
| Przypisuje innym, edytuje cudze | Tak | Nie |
| Zmienia status | Każdego zadania | Swojego zadania i zadania bez osoby, które wtedy staje się jego |
| Archiwizuje | Tak | Nie |
| Ustawia nagrodę za zadanie | Tak | Nie |
| Zmienia nazwę zadania z nagrodą | Tak | Nie, także swojego |
| Widzi kieszonkowe | Wszystkich dzieci | Tylko swoje |
| Ustawia stawki i oznacza wypłaty | Tak | Nie |
| Dodaje i odhacza zakupy | Tak | Tak |
| Zarządza kalendarzami i regułami cyklicznymi | Tak | Nie |
| Zarządza kontami | Sekcja „Rodzina”: zaproszenia nowych osób (rodzica albo dziecka), linki do nowego hasła (także dla drugiego rodzica), wyłączanie kont dzieci, dziennik logowań. Konto rodzica wyłącza tylko CLI | Nie |
| Zmienia własne hasło, wylogowuje inne urządzenia | Tak | Tak |
| Widzi wydarzenia kalendarzy | Rodzinnych i własnych prywatnych | Tylko rodzinnych |
| Wybiera swój kolor, wygląd i tryb | Tak | Tak |

## 7. Integracje

### Powiadomienia na iOS

- Działają tylko po dodaniu aplikacji do ekranu głównego.
- Zgodę trzeba wywołać kliknięciem użytkownika.
- Logowanie musi odbyć się w zainstalowanej aplikacji, bo jej dane są oddzielone od Safari.
- PWA działa w UE: Apple wycofało się w 2024 roku z planu jej wyłączenia (potwierdzone na telefonie w Polsce).
- Nieaktywne subskrypcje trzeba usuwać po odpowiedziach `404` i `410` z usługi push.

Klucze VAPID muszą być stałe. Ich zmiana unieważnia wszystkie subskrypcje.

**Jak to działa (etap 7):**

- **Włączenie.** W ustawieniach przycisk „Włącz powiadomienia na tym telefonie” prosi o zgodę i zapisuje subskrypcję na koncie osoby. Na iPhonie poza ekranem głównym przeglądarka nie udostępnia push, więc zamiast przycisku jest instrukcja. Pozycji „Powiadomienia” nie ma w menu ustawień, gdy serwer nie ma kluczy (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) i w trybie demo, gdzie wysyłka trafiałaby na telefony gości. Klucze generuje `npm run vapid -w @ogarniacz/api`; to nowe klucze, osobne od tych ze strony testowej.
- **Wylogowanie.** Serwer zapomina wtedy ten telefon, żeby powiadomienia poprzedniej osoby nie trafiały do następnej. Subskrypcja w przeglądarce zostaje, więc kolejna osoba włącza powiadomienia jednym przyciskiem.
- **Poranne podsumowanie.** Zadanie sprawdza co 5 minut i po starcie serwera. Osoba dostaje je od wybranej godziny (5:00 do 10:00, domyślnie 7:00) i najpóźniej do 12:00, więc po awarii podsumowanie jest nadrabiane, ale nie po południu. Zawiera zadania na dziś i liczbę zaległych, wydarzenia (z godziną) oraz liczbę rzeczy do kupienia; bez niczego mówi „Nic na dziś”, bo każda osoba ma dostać jedno dziennie. Wyłączone konta go nie dostają.
- **Przypisanie.** Powiadomienie dostaje osoba, której ktoś inny przypisał zadanie (nowe lub zmiana osoby). Samodzielne wzięcie zadania go nie wywołuje, a wysyłka w tle nie może zepsuć zapisu zadania. Zadania z reguł cyklicznych nie powiadamiają: pojawiają się w porannym podsumowaniu.
- **Termin jutro.** Jedno zbiorcze powiadomienie na osobę, między 18:00 a 22:59, o otwartych zadaniach z terminem na jutro.
- **Cisza nocna.** Domyślnie 21:00 do 7:00, do zmiany. Obejmuje przypomnienia o przypisaniu i terminie, które w ciszy są pomijane (zadanie i tak wejdzie do porannego podsumowania). Podsumowanie ignoruje ciszę, bo godzinę wybiera sama osoba.
- **Kliknięcie.** Powiadomienie niesie adres `/?ekran=today|board|shopping`. Zamknięta aplikacja otwiera się na tym ekranie, otwarta dostaje wiadomość od service workera i przełącza ekran. Nieznany albo niedostępny ekran (np. cykliczne dla dziecka) otwiera „Dziś”.
- **Service worker.** Obsługa push leży w `apps/web/public/push-sw.js` i jest dołączona do `app-sw.js` przez `importScripts`, więc nazwa service workera się nie zmieniła. Powiadomienie jest pokazywane zawsze, bo Safari cofa zgodę, gdy push nic nie pokaże.
- **Bezpieczeństwo.** Wysyłka idzie tylko pod adresy znanych usług push: adres subskrypcji podaje klient, więc bez listy byłby to otwarty serwer pośredniczący. Treść powiadomień nie trafia do logów. Powiadomienie zawiera tytuły zadań, więc widać je na zablokowanym ekranie telefonu.

### Kalendarze

Na start używamy linków ICS z Google i iCloud, pobieranych co 15 minut. To jedna ścieżka kodu, bez OAuth i tylko do odczytu.

- **Pełne API Google:** odłożone, bo wymaga publikacji aplikacji OAuth. W trybie testowym tokeny wygasają po 7 dniach.
- **iCloud:** bezpośredni dostęp wymaga CalDAV i hasła dla aplikacji, a zmiany i tak trzeba sprawdzać cyklicznie.
- **Trudne przypadki ICS:** wydarzenia powtarzalne, wyjątki od serii, wydarzenia całodniowe i zmiana czasu. `ical.js` liczy serie, wyjątki i strefy z `VTIMEZONE`, ale z `toJSDate()` daty całodniowe i czas bez strefy zależałyby od strefy serwera, więc kod czyta daty jako liczby i sam rozstrzyga strefy (także nazwy Windows bez `VTIMEZONE`).
- **Skutek uboczny:** zmiana w kalendarzu pojawi się z opóźnieniem. Interfejs pokazuje czas ostatniej synchronizacji i ostrzega o nieaktualnych danych.
- **Link jako poświadczenie i adres pobierany przez serwer:** link jest szyfrowany, nie wraca w API ani w logach, a pobieranie ogranicza lista dozwolonych hostów. Szczegóły i pozostałe zagrożenia: [archiwum/KALENDARZE-PROJEKT.md](archiwum/KALENDARZE-PROJEKT.md), rozdział 5.

### Google Keep

Nie integrujemy. Własna lista zakupów jest prostsza i lepiej dopasowana.

## 8. Offline

Offline dotyczy tylko listy zakupów, bo w sklepie bywa słaby zasięg.

- Lista, podpowiedzi i kolejka zmian są zapisane lokalnie w IndexedDB (`apps/web/src/features/shopping/sync.ts`). Ekran pokazuje ostatnią listę z serwera z nałożonymi zmianami z kolejki, więc każda zmiana jest widoczna od razu.
- Kolejkę wysyłamy po kolei: po starcie aplikacji, powrocie na pierwszy plan, odzyskaniu sieci i zaraz po każdej zmianie. Nie zakładamy Background Sync, bo nie jest dostępny w Safari. Brak sieci i błąd 5xx zostawiają zmianę w kolejce, a ostateczną odmowę serwera, np. odhaczenie wyczyszczonego już produktu, pomijamy.
- Licznik „Niewysłane zmiany” rośnie dopiero po zapisie kolejki na telefonie, więc pokazane zmiany przetrwają zamknięcie aplikacji.
- Każdą zmianę można bezpiecznie powtórzyć: dodanie ma identyfikator z telefonu, a czyszczenie listę produktów.
- Konflikty: przy tym samym produkcie wygrywa późniejsza zmiana według czasu z telefonu (`changedAt`), osobno dla odhaczenia i dla nazwy z ilością, więc odhaczenie w sklepie nie kasuje zmiany ilości z domu. Czas z przyszłości serwer przycina do bieżącego. Usunięcie wygrywa zawsze.
- Aplikacja otwiera się bez sieci: service worker podaje zbudowany front, a zalogowaną osobę pamiętamy w `localStorage`. Sesję sprawdza serwer przy pierwszym żądaniu po powrocie sieci. Bez sieci działa tylko lista zakupów; inne ekrany pokazują błąd połączenia.
- Wylogowanie usuwa z telefonu kopię listy i niewysłane zmiany. Po wygaśnięciu sesji kolejka czeka i wysyła się po ponownym zalogowaniu tej samej osoby; zalogowanie innej osoby ją porzuca.

## 9. Bezpieczeństwo

Aplikacja przechowuje dane dzieci, harmonogram domu i prywatne linki do kalendarzy.

- Hasła: `scrypt` z `node:crypto`, bez kolejnej natywnej zależności.
- Sesja: losowy token w cookie `HttpOnly`, `Secure`, `SameSite=Lax`; wylogowanie usuwa je z tymi samymi atrybutami. W bazie tylko jego skrót.
- Długa sesja z odnawianiem, bo ponowne logowanie w PWA na iOS jest uciążliwe.
- Łańcuch dostaw: `npm audit` zależności produkcyjnych (próg: wysokie) w CI, Dependabot dla npm, akcji GitHub i obrazu Docker (bez wersji głównych obrazu `node` i `@types/node`, które zmieniamy ręcznie razem z Node na produkcji), akcja z sekretem przypięta do commitu.
- Ochrona przed zgadywaniem haseł: 5 prób na 15 minut dla pary login i adres klienta (obcy blokuje tylko siebie), 20 prób na 15 minut z jednego adresu (IPv6 liczone po sieci `/64`) i bezpiecznik 100 prób na login na godzinę. Każda próba i początek blokady trafiają do dziennika logowań `auth_events`.
- Linki ICS traktujemy jak hasła: szyfrowane w bazie (AES-256-GCM, klucz `CALENDAR_ENCRYPTION_KEY` poza bazą i poza kopiami zapasowymi), niewidoczne dla dzieci, nigdy niezwracane przez API i nieobecne w logach. Szyfrowanie chroni przed wyciekiem bazy i kopii z Google Drive, ale nie przed przejęciem serwera, na którym leży klucz.
- Serwer pobiera adresy podane przez rodzica, więc to potencjalny SSRF: tylko `https`, lista dozwolonych hostów, ręcznie sprawdzane przekierowania, limity czasu i rozmiaru. W trybie demo dodawanie kalendarzy jest wyłączone.
- Sekrety (`.env`, klucze VAPID, klucz szyfrowania) poza repozytorium.
- Bez logowania aplikacji nie wolno wystawiać do internetu.
- Konto powstaje tylko z kreatora pierwszego uruchomienia (pusta baza i kod z logu serwera), z jednorazowego zaproszenia od rodzica (potwierdzonego jego hasłem) albo przez CLI. Kod kreatora to jedyny sekret, który trafia do logu: działa tylko do założenia pierwszego konta albo do restartu ([plany/KONTA.md](plany/KONTA.md)). Przyjęcie zaproszenia i nowe hasło z linku zostawiają wpis w dzienniku, a pozostali rodzice dostają push; push dostają też przy blokadzie logowania konta (najwyżej raz na godzinę, z poszanowaniem ciszy nocnej).
- API nasłuchuje tylko na `127.0.0.1` (zmienna `HOST`; w obrazie Docker `0.0.0.0`, a port wystawia mapowanie), bo zaufanie do nagłówków `X-Real-IP` i `X-Forwarded-Host` zakłada ruch wyłącznie przez nginx. nginx sam ustawia `X-Forwarded-Host`.
- Limit rozmiaru żądania 100 kB w aplikacji, niezależnie od proxy (obraz Docker nie ma nginx).
- Nagłówki bezpieczeństwa na każdej odpowiedzi: CSP bez zewnętrznych źródeł i bez skryptów wpisanych w stronę (skrypt motywu to osobny plik `theme.js`), `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` bez kamery, mikrofonu i lokalizacji. HSTS dodaje proxy hostingu (`max-age` dwa lata), więc aplikacja go nie wysyła.

**Przegląd z 11 listopada 2026** ([archiwum/UTWARDZENIE-PRZEGLAD.md](archiwum/UTWARDZENIE-PRZEGLAD.md)) potwierdził powyższe próbą na lokalnej instancji i wskazał luki. Poprawki B1–B6, B8 i B9 są wdrożone 13 listopada 2026, a konta w aplikacji (ustalenie B7) w krokach 1 i 2.

**Znane luki (stan obecny):**

- Własne hasło każdy zmienia w ustawieniach, potwierdzając obecnym. Wymóg wobec hasła (aplikacja i CLI): 8 znaków i bez loginu oraz słów imienia dłuższych niż dwa znaki (`passwordProblem` w `shared`).
- Skany OWASP ZAP na lokalnej instancji (bazowy oraz aktywny API z sesją rodzica i dziecka; 13 listopada 2026 na demo, 14 listopada 2026 bez `DEMO_MODE`, z trasami zaproszeń, kont, dziennika, zmiany hasła i kreatora) nie znalazły podatności; szczegóły w [archiwum/UTWARDZENIE-PRZEGLAD.md](archiwum/UTWARDZENIE-PRZEGLAD.md), rozdział 5.
- Ochrona gałęzi `main` nie jest dostępna dla prywatnego repozytorium na darmowym planie; wdrożenie chroni zadanie `promote`, które przesuwa `prod` tylko po zielonym CI. Gotowe rulesety do włączenia po upublicznieniu: [plany/PUBLIKACJA.md](plany/PUBLIKACJA.md), rozdział 3.

- Zaproszenie przenosi token w części adresu po `#` (`/#zaproszenie=…`), więc nie trafia on do logów nginx ani proxy; front od razu usuwa go z adresu, a kod QR rysuje w przeglądarce, bez zewnętrznej usługi.

Planowane: lista kontrolna przeglądu przed wydaniem ([plany/UTWARDZENIE.md](plany/UTWARDZENIE.md)).

## 10. Hosting i utrzymanie

Aplikacja działa w Dockerze albo bezpośrednio na Node.js 24, za proxy z HTTPS. Kod nie zależy od żadnego dostawcy hostingu: wszystko, co zależy od instalacji, jest zmienną środowiskową (`apps/api/src/config.ts`). Wymagania, przykład proxy, aktualizacja i obsługa: [instrukcje/WDROZENIE.md](instrukcje/WDROZENIE.md). Planowane ułatwienia instalacji: [plany/PUBLIKACJA.md](plany/PUBLIKACJA.md).

- **Wymagania każdej instalacji:** HTTPS, własna domena albo subdomena, jedna instancja, proxy, które nadpisuje nagłówek z adresem klienta.
- **Aktualizacje:** commit z `main`, który przeszedł CI, trafia na gałąź `prod`; instalacja może ją śledzić.
- **Obraz Docker:** CI buduje i uruchamia go przy każdej zmianie, więc obie drogi instalacji pozostają sprawne.
- **Domena:** instalacja PWA i subskrypcje push są związane z adresem aplikacji, więc zmiana adresu oznacza ponowną instalację i logowanie na wszystkich telefonach.

**Backup:**

- nocna kopia przez backupowe API SQLite, bo zwykłe kopiowanie pliku w trybie WAL może dać uszkodzoną kopię,
- zapis w `BACKUP_DIR` (domyślnie `backups` obok bazy),
- dodatkowa kopia poza serwerem: zaszyfrowana przez rclone na Google Drive, opis w [instrukcje/BACKUP.md](instrukcje/BACKUP.md),
- próba odtworzenia, bo niesprawdzony backup nie daje pewności.

**Migracje** uruchamiają się przy starcie API, więc przed wdrożeniem nowej wersji trzeba mieć świeży backup.

**Demo.** `npm run demo` uruchamia aplikację z przykładowymi danymi na jednorazowej bazie, a tryb `DEMO_MODE=true` dodatkowo resetuje bazę co godzinę, wpuszcza na konta przykładowe jednym przyciskiem i blokuje to, co mogłoby zaszkodzić gościom (kalendarze, push, zmiany kont). Bezpiecznik odmawia startu i resetu, gdy w bazie są konta spoza demo. Publicznego demo nie ma. Pełny opis: [instrukcje/DEMO.md](instrukcje/DEMO.md).

## 11. Testy

| Poziom | Narzędzie | Zakres |
|---|---|---|
| API | Vitest, SQLite w pamięci | Logika, uprawnienia, parser ICS, reguły cykliczne |
| Przepływy | Playwright, profile iPhone i Android | Główne ścieżki w przeglądarce, na serwerze deweloperskim |
| Test dymny | Playwright na zbudowanej aplikacji (`npm run test:smoke`) | Service worker, start bez sieci, CSP, nagłówki pamięci podręcznej; tryb demo: wejście jednym przyciskiem, baner, blokada indeksowania; kreator pierwszego uruchomienia na dwóch serwerach z pustą bazą |
| Wdrożenie | `backup verify` w CLI, krok aktualizacji z [instrukcje/WDROZENIE.md](instrukcje/WDROZENIE.md) | Migracje nowej wersji na kopii bazy przed restartem |
| Ręczne | Prawdziwy iPhone i Android | Instalacja, push, offline |

Test przekrojowy `routes.test.ts` zbiera wszystkie trasy z aplikacji i sprawdza, że każda poza jawnie publicznymi odpowiada bez sesji `401`. Po nieudanym przebiegu e2e CI zapisuje ślady Playwright i raport HTML jako artefakt.

Testy API obejmują też demo (`demo.test.ts`): logowanie na każde konto, zawartość tablicy, zakupów i kieszonkowego, odmowę wgrania do niepustej bazy oraz tryb demo (wejście bez hasła tylko na konta przykładowe, limit wierszy, nagłówki, reset, seed pustej bazy).

Playwright nie zastąpi testu push na iPhonie, bo profil telefonu to tylko emulacja.

**Znane luki (stan na 13 listopada 2026: 39 scenariuszy e2e i 8 scenariuszy testu dymnego, każdy na profilu iPhone i Android, oraz 312 testów API):**

- Front nie ma testów jednostkowych; kolejkę zakupów offline (`ShoppingSync`) pokrywają tylko scenariusze e2e.
- Serwer testowy używa prawdziwego zegara, więc przepływy zależne od czasu (np. „Wypłacone” za zamknięty tydzień) mają tylko testy API.

Planowane testy (T2–T4, T8): [plany/UTWARDZENIE.md](plany/UTWARDZENIE.md).

## 12. Główne ryzyka

| Ryzyko | Skutek | Reakcja |
|---|---|---|
| Push na iPhonie nie działa zgodnie z oczekiwaniami | Traci sens główna wartość aplikacji | Test na początku, w etapie 1 |
| Utrata pliku bazy | Utrata danych rodziny | Backup i próba odtworzenia przed pierwszymi danymi |
| Wyciek linku ICS | Dostęp do kalendarza prywatnego | Szyfrowanie z kluczem poza kopią, wymiana linku w aplikacji, instrukcja resetu po stronie Google i Apple |
| Błędy w ICS | Złe terminy w „Dziś” | Biblioteka zamiast własnego parsera, daty jako liczby, testy przy kilku strefach procesu i na prawdziwych plikach |
| Cicha nieaktualność kalendarza | Rodzina ufa starym wydarzeniom | Widoczny czas ostatniej synchronizacji i ostrzeżenie; monitoring dostępności tego nie wykryje |
| Adres kalendarza jako wektor SSRF | Serwer pobiera adresy wewnętrzne lub służy za pośrednik w demo | Lista hostów, brak zapisu kalendarzy w demo; pełna lista zagrożeń etapu 6 w [archiwum/KALENDARZE-PROJEKT.md](archiwum/KALENDARZE-PROJEKT.md) |
| Podwójne powiadomienia po restarcie | Irytacja i wyłączenie push | Klucz unikalności w `notifications` |
| Odpuszczony serwis | Dane i push przestają działać po cichu | Monitoring dostępności i ostatniego backupu |
| Blokowanie logowania przez obcego | Osoba bez aktywnej sesji nie zaloguje się, dopóki trwa atak | Blokada na parę login i adres, dziennik logowań (od 13 listopada 2026); zostaje bezpiecznik 100 prób na login na godzinę ([archiwum/UTWARDZENIE-PRZEGLAD.md](archiwum/UTWARDZENIE-PRZEGLAD.md), B1 i B4) |
| Port API widoczny z pominięciem nginx | Ruch bez HTTPS i z podrobionymi nagłówkami proxy | Nasłuch tylko na `127.0.0.1` (zmienna `HOST`, archiwum/UTWARDZENIE-PRZEGLAD.md, B2); port niewidoczny z internetu (sprawdzenie 13 listopada 2026) |
| Przejęcie świeżej instancji przez kreator pierwszego uruchomienia | Obcy zakłada pierwsze konto rodzica | Kod z logu serwera, limit prób na adres i wygaśnięcie kodu po 20 złych próbach, kreator tylko na pustej bazie (od 13 listopada 2026, [plany/KONTA.md](plany/KONTA.md)) |
| Ciche dodanie konta z przejętej sesji rodzica | Trwały dostęp obcej osoby | Potwierdzenie hasłem, push do rodziców i wpis w dzienniku (od 13 listopada 2026) |
| Nieudana migracja przy automatycznym wdrożeniu | Aplikacja nie wstaje | Kopia przed aktualizacją; procedura aktualizacji sprawdza migracje na kopii (`backup verify`) przed restartem, a po błędzie zostawia starą wersję ([instrukcje/WDROZENIE.md](instrukcje/WDROZENIE.md)) |
