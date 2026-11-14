# Zamknięte etapy

Pełne listy kontrolne etapów, które są już zrobione. Bieżący plan i to, co zostało, jest w [PLAN.md](../PLAN.md). Ten plik się nie zmienia, poza dopisaniem kolejnego zamkniętego etapu.

## Etap 0: domknięcie fundamentów

**Cel:** repozytorium i kontener są gotowe do wdrażania.

- [x] `git init` i pierwszy commit z lockfile i migracją
- [x] Pobranie przeglądarek i uruchomienie `npm run test:e2e` na profilach iPhone i Android
- [x] Zbudowanie i uruchomienie obrazu przez `docker compose up -d --build`
- [x] Automatyczne testy przed wdrożeniem: `.github/workflows/ci.yml` działa na GitHubie przy każdym pushu na `main` i przy każdym PR

**Gotowe, gdy:** świeży klon przechodzi testy, a kontener obsługuje pełny przepływ zadania.

## Etap 1: test hostingu i push

**Cel:** potwierdzić najbardziej ryzykowne założenie małym kosztem.

Aplikacja nie ma jeszcze logowania, więc na serwer trafia osobna, mała strona testowa: tylko manifest, service worker, przycisk zgody i wysyłka testowa. Nie ma w niej API zadań ani żadnych danych. Wysyłkę zabezpiecza losowy token, a po teście stronę usuwamy.

Strona leżała w `apps/push-test` z instrukcją w `docs/TEST-PUSH.md`. Po teście na obu telefonach usunęliśmy ją z repozytorium (11 listopada 2026); obie są w historii gita.

- [x] Serwer z Node 24, dostępem do repozytorium i stroną na domenie z HTTPS
- [x] Wygenerowanie kluczy VAPID
- [x] Instalacja strony na ekranie głównym prawdziwego iPhone'a w Polsce
- [x] Odebranie push przy zamkniętej aplikacji i zablokowanym telefonie
- [x] Powtórka na iPhonie po restarcie telefonu i po kilku dniach (10 listopada 2026)
- [x] Ten sam test na Androidzie (11 listopada 2026, już na docelowej aplikacji)
- [x] Decyzja o docelowym hostingu, wdrażanym od razu ze względu na pilotaż

**Gotowe, gdy:** push dochodzi na iPhone'a i Androida w każdym z powyższych scenariuszy.

**Jeśli się nie uda:** zatrzymujemy prace i wybieramy między innym hostingiem, powiadomieniami przez e-mail lub komunikator a aplikacją natywną.

## Etap 2: logowanie, backup, wdrożenie

**Cel:** bezpiecznie przyjąć pierwsze prawdziwe dane.

- [x] Tabele `users` i `sessions`
- [x] Logowanie, wylogowanie i ekran logowania
- [x] Sprawdzenie logowania w zainstalowanej PWA na iPhonie, po wdrożeniu (8 listopada 2026)
- [x] Zakładanie kont skryptem, bez publicznej rejestracji: `npm run cli -w @ogarniacz/api -- user add`
- [x] Ochrona wszystkich tras `/api` i limit prób logowania
- [x] Role rodzic i dziecko: archiwizuje tylko rodzic, reszta zasad doszła w etapie 3
- [x] Nocny backup o 3:30 przez backupowe API SQLite, 14 dni kopii i skrypt odtwarzania sprawdzony w testach
- [x] Wysyłka kopii poza serwer przez rclone do zaszyfrowanego katalogu na Google Drive, 60 dni historii
- [ ] Konfiguracja rclone i Google Drive na serwerze według [BACKUP.md](../instrukcje/BACKUP.md): odłożona; otwarty punkt przeniesiony do etapu 8 w [PLAN.md](../PLAN.md)
- [x] Próba odtworzenia bazy produkcyjnej z backupu 8 listopada 2026: konta odtworzone z kopii; odtąd `backup verify` w CLI
- [x] Wdrożenie i aktualizacja sprawdzone w symulacji: [WDROZENIE.md](../instrukcje/WDROZENIE.md)
- [x] Wdrożenie na produkcję 8 listopada 2026: konta rodziny założone, aplikacja sama wstaje po zatrzymaniu
- [x] Prosty monitoring dostępności: sprawdzanie `/api/health` co 5 minut

**Gotowe, gdy:** bez sesji API zwraca `401`, testy obejmują role, a baza została odtworzona z backupu.

## Etap 3: pełny Kanban i „Dziś”

**Cel:** aplikacja nadaje się do codziennego przydzielania zadań.

- [x] Osoba przypisana, termin (dzień w czasie polskim) i autor zadania
- [x] Autor każdej zmiany w historii
- [x] Pełne uprawnienia dziecka: tworzy zadania tylko dla siebie, zmienia swoje, a zadanie bez osoby może wziąć do zrobienia i oddać z powrotem
- [x] Cofanie statusu o krok
- [x] Filtr „moje” i oznaczenie zaległych
- [x] Widok archiwum i przywracanie zadań
- [x] Pierwsza wersja ekranu „Dziś”: moje zadania na dziś i zaległe
- [x] Wdrożenie na produkcję i próba z rodziną 8 listopada 2026: rodzic przydzielił dziecku zadanie, dziecko widzi je w „Dziś”
- [x] Przeciąganie przez dnd-kit jako dodatek: przytrzymaną kartę upuszcza się na zakładce statusu, a zakładki są przypięte u góry ekranu
- [x] Wygląd „Lodówka” (9 listopada 2026): karteczki z kolorem osoby, dolny pasek nawigacji, pasek postępu w „Dziś”, nowe ikony aplikacji
- [x] Tryb ciemny i panel ustawień: motyw na urządzeniu, kolor osoby widoczny dla rodziny, wylogowanie przeniesione do panelu
- [x] Dolny pasek: jasny w jasnym trybie i same ikony w równych komórkach (10 listopada 2026)
- [x] Wybór wyglądu w ustawieniach: „Lodówka”, „Wieczorny las” i „Naklejki”, każdy w trybie jasnym i ciemnym (10 listopada 2026)
- [x] Wdrożenie wyglądu i ustawień na produkcję, sprawdzone bez błędów (10 listopada 2026); na zainstalowanych telefonach iOS może pokazywać starą ikonę do ponownego dodania aplikacji do ekranu głównego

**Gotowe, gdy:** rodzic przydziela dziecku zadanie z terminem, a dziecko widzi je w „Dziś”.

**Zamknięty 10 listopada 2026.**

## Etap 4: zadania cykliczne

**Cel:** powtarzalne obowiązki nie wymagają ręcznego dodawania.

- [x] Tabela `recurrences` i ekran „Cykliczne” dla rodzica
- [x] Wzorce: co tydzień w wybrane dni, co N dni, co miesiąc (31. dnia wypada ostatniego dnia krótszego miesiąca)
- [x] Tworzenie kolejnych wystąpień przez harmonogram co godzinę i przy starcie, bez duplikatów po restarcie
- [x] Pauza do wybranego dnia albo do wznowienia, np. na wakacje
- [x] Jedno otwarte wystąpienie naraz, żeby niewykonane zadania się nie mnożyły
- [x] Testy: zmiana czasu, przestępny luty, restart serwera, pauza, przestój serwera
- [x] Wdrożenie na produkcję i pierwsze reguły rodziny: śmieci, kwiaty

**Gotowe, gdy:** testy obejmują zmianę czasu, przestępny luty, restart serwera i pauzę.

**Zamknięty 9 listopada 2026.**

## Etap 5: lista zakupów offline

**Cel:** lista działa w sklepie bez zasięgu.

Etap podzielony na dwie części, bo offline jest tu najtrudniejsze.

**Część A, online:**

- [x] Dodawanie, ilość, odhaczanie, czyszczenie kupionych; poprawianie i usuwanie pomyłek
- [x] Podpowiedzi z historii: tylko kupione produkty, od najczęstszych, z ostatnią ilością
- [x] Odświeżanie zmian od innych osób: co 10 sekund na ekranie i po powrocie do aplikacji
- [x] Sekcja zakupów w „Dziś”
- [x] Pod część B: identyfikator nadawany na telefonie i ponowione dodanie bez duplikatu, czyszczenie tylko produktów widzianych w koszyku
- [x] Wdrożenie części A na produkcję, sprawdzone bez błędów (10 listopada 2026)
- [x] Pierwsze zakupy z rodziną, sprawdzone na produkcji (10 listopada 2026)

**Część B, offline:**

- [x] Lokalna kopia w IndexedDB i kolejka operacji; aplikacja otwiera się bez sieci z zapamiętaną osobą (sprawdzone na buildzie produkcyjnym z service workerem)
- [x] Identyfikatory nadawane na telefonie, bezpieczne ponawianie: test e2e z odpowiedzią zgubioną po drodze
- [x] Wysyłka po starcie, powrocie do aplikacji i odzyskaniu sieci
- [x] Widoczna informacja o niezsynchronizowanych zmianach
- [x] Konflikty: późniejsza zmiana wygrywa według czasu z telefonu, osobno odhaczenie i osobno nazwa z ilością; usunięcie wygrywa zawsze
- [x] Próba z „Gotowe, gdy” na prawdziwym iPhonie po wdrożeniu (10 listopada 2026)

**Gotowe, gdy:** w trybie samolotowym na iPhonie można zamknąć aplikację, a po powrocie zasięgu zmiany trafiają na drugi telefon bez duplikatów.

**Zamknięty 10 listopada 2026.**

## Etap 6: kalendarze ICS

**Cel:** „Dziś” pokazuje wydarzenia rodziny.

Analiza, projekt i zagrożenia (10 listopada 2026): [KALENDARZE-PROJEKT.md](KALENDARZE-PROJEKT.md). Instrukcja dla rodziny i administratora: [instrukcje/KALENDARZE.md](../instrukcje/KALENDARZE.md). Kroki poniżej odpowiadają planowi prac z rozdziału 6 analizy.

- [x] Analiza, wybór biblioteki (`ical.js`, sprawdzona na próbnych plikach) i projekt
- [x] Dokumentacja projektowa i instrukcja obsługi kalendarzy
- [x] 1. Parser ICS i czas: serie, wyjątki, całodniowe, strefy, limity; testy przy czterech strefach procesu
- [x] 2. Pobieranie (lista hostów, przekierowania, limity) i szyfrowanie linków (`CALENDAR_ENCRYPTION_KEY`)
- [x] 3. Tabele `calendars` i `calendar_events`, migracja `0008`, synchronizacja co 15 minut w miejscu zaślepki z `apps/api/src/jobs/scheduler.ts`, odstęp po błędach, demo
- [x] 4. API: dodawanie linku przez rodzica ze sprawdzeniem od razu, wymiana, archiwizacja, odświeżanie, wydarzenia dnia; polecenia `calendar list` i `calendar sync` w CLI
- [x] 5. Interfejs: sekcja wydarzeń w „Dziś” z czasem ostatniej synchronizacji, zarządzanie w ustawieniach, informacja o błędzie, gdy link przestanie działać
- [x] 6. Testy e2e z lokalnym serwerem ICS, aktualizacja `e2e/README.md`
- [x] 7. Klucz w ustawieniach serwera, wdrożenie i próba odbioru na prawdziwych kalendarzach (10 listopada 2026: kalendarz zaimportowany na produkcji, wydarzenia na dziś zgadzają się z „Dziś”)

**Gotowe, gdy:** prawdziwe kalendarze Google i iCloud zgadzają się z „Dziś”, a błąd jednego z nich nie psuje pozostałych.

**Przyjęte decyzje:** widoczność kalendarza `family` i `private`, ścisła lista hostów (Google, iCloud, reszta w `CALENDAR_ALLOWED_HOSTS`), zarządzanie w ustawieniach zamiast nowej zakładki (pasek ma już pięć pozycji), brak zbiorczego `/api/today`. Parsowanie zostało w głównym wątku z limitem 2 MB zamiast wątku roboczego, powody w rozdziale 9 analizy.

## Etap 7: powiadomienia

**Cel:** aplikacja sama przypomina o sprawach na dziś.

Ten etap celowo jest po 3–6, bo poranne podsumowanie składa się z ich danych. Jeśli przypomnienia o zadaniach będą pilniejsze niż zakupy lub kalendarz, można je wdrożyć wcześniej.

Projekt i decyzje (10 listopada 2026): [PROJEKT.md](../PROJEKT.md), rozdział 7. Stan: kod przetestowany (testy API, e2e) i wdrożony na produkcji razem z kluczami VAPID w ustawieniach serwera, więc powiadomienia są tam włączone. Próba na prawdziwych telefonach przeszła 11 listopada 2026, etap zamknięty.

- [x] 1. Instrukcja instalacji na iPhonie i prośba o zgodę po kliknięciu: w ustawieniach przycisk zgody albo, na iPhonie poza ekranem głównym, instrukcja „Do ekranu głównego”
- [x] 2. Subskrypcje dla każdego urządzenia (`push_subscriptions`), usuwanie wygasłych (`404`, `410`) i martwych (5 nieudanych wysyłek z rzędu), zapominanie telefonu przy wylogowaniu
- [x] 3. Przypomnienia: o zadaniu przypisanym przez kogoś innego (od razu) i o terminach na jutro (jedno zbiorcze, o 18:00)
- [x] 4. Poranne podsumowanie (domyślnie 7:00, godzina do wyboru) w miejscu zaślepki z harmonogramu: zadania na dziś i zaległe, wydarzenia, liczba rzeczy do kupienia
- [x] 5. Ustawienia: rodzaje powiadomień, godzina podsumowania i cisza nocna jako nowa sekcja panelu ustawień
- [x] 6. Ochrona przed podwójną wysyłką: unikalny `dedupe_key` w `notifications`, także po restarcie serwera
- [x] 7a. Klucze VAPID w ustawieniach serwera i wdrożenie na produkcję (10 listopada 2026)
- [x] 7b. Próba na prawdziwych telefonach (iPhone i Android): przycisk zgody, test z ustawień, poranne podsumowanie o wybranej godzinie, kliknięcie otwiera właściwy ekran (11 listopada 2026)

**Gotowe, gdy:** każda osoba dostaje jedno podsumowanie dziennie, także po restarcie serwera, a kliknięcie otwiera właściwy ekran.

**Zamknięty 11 listopada 2026.**

## Zrobione przed 1.0 z planu rozwoju

**Kieszonkowe i nagrody za zadania (9 listopada 2026, na prośbę rodziny):**

- [x] Nagroda na zadaniu: 5, 10, 15 zł albo własna kwota, ustawiana tylko przez rodzica
- [x] Ekran „Kieszonkowe”: dziecko widzi kwotę na poniedziałek, rodzic kwoty wszystkich dzieci
- [x] Stawka tygodniowa osobno dla dziecka, domyślnie 50 zł, zmiana bez działania wstecz
- [x] Oznaczanie wypłaty z zapisaną kwotą; ukończone zadanie nie liczy się drugi raz
- [x] Archiwum przeniesione z paska nawigacji na tablicę
- [x] Wdrożenie na produkcję z migracją `0007`, sprawdzone bez błędów (10 listopada 2026)

**Demo (10 listopada 2026):**

- [x] Lokalne demo jedną komendą: `npm run demo` (przykładowe konta, zadania, zakupy i kieszonkowe, baza jednorazowa)
- [x] Tryb `DEMO_MODE`: reset bazy co godzinę, logowanie jednym przyciskiem, baner, limit wierszy, bez indeksowania i kopii
- [x] Konfiguracja publicznego demo: `fly.toml`, ręczny workflow „Demo”, `docker-compose.demo.yml`, opis w [DEMO.md](../instrukcje/DEMO.md)

## Podjęte decyzje

| Pytanie | Decyzja |
|---|---|
| Czy dzieci mają uprawnienia z PROJEKT.md? | Tak |
| Gdzie trzymać kopię poza serwerem? | Google Drive przez rclone, zaszyfrowane |
| Czy godzina 7:00 pasuje wszystkim? | Domyślnie 7:00, każda osoba wybiera od 5:00 do 10:00 w ustawieniach |
| Widoczność kalendarzy i lista hostów | `family` i `private`; ścisła lista, inne hosty dopisuje administrator |
| Czy konta w aplikacji powstają przed 1.0? | Tak, wszystkie trzy kroki (11 listopada 2026, [KONTA.md](../plany/KONTA.md)) |
| Czy zakładanie kont zostaje wyłącznie w CLI? | Nie: zaproszenie od rodzica i kreator pierwszego uruchomienia (11 listopada 2026) |
| Licencja | MIT (11 listopada 2026), plik `LICENSE` |
| Czy imiona w demo i testach są fikcyjne? | Tak (11 listopada 2026) |

## Źródła ustaleń sprzed projektu

Ustalenia o iOS, Google i iCloud pochodzą z badania wykonanego przed projektem. Etap 1 sprawdził najważniejsze w praktyce. Przeniesione z PROJEKT.md 13 listopada 2026.

- [Monterail: PWA na iOS](https://monterail.com/blog/pwa-for-apple-ios)
- [9to5Mac: PWA w UE](https://9to5mac.com/?p=936361)
- [MagicBell: ograniczenia PWA na iOS](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [Jentic: Google Keep API](https://jentic.com/apis/googleapis.com/keep)
- [Nylas: iCloud Calendar API](https://developer.nylas.com/docs/cookbook/calendar/apple-calendar-api/)
- [Hack Your Way: wygasanie tokenów Google OAuth](https://hackyourway.substack.com/p/google-oauth-agent-access)
