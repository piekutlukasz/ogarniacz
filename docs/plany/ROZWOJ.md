# Rozwój po 1.0

Stan na 17 listopada 2026. Drobniejsze prace i pomysły z [PLAN.md](../PLAN.md), które nie mają osobnego planu. Instalacja dla innych i publikacja repozytorium są zrobione: [archiwum/PUBLIKACJA.md](../archiwum/PUBLIKACJA.md). Testy po 1.0 są zrobione: [archiwum/UTWARDZENIE-TESTY.md](../archiwum/UTWARDZENIE-TESTY.md). Dokończenie kieszonkowego też: [archiwum/KIESZONKOWE-DOKONCZENIE.md](../archiwum/KIESZONKOWE-DOKONCZENIE.md).

Kolejność wynika z tego, czego rodzina będzie faktycznie potrzebować.

## Demo

Lokalne demo i tryb `DEMO_MODE` działają, a od 13 listopada 2026 pilnuje ich test e2e w teście dymnym (T7 w [archiwum/UTWARDZENIE-PRZEGLAD.md](../archiwum/UTWARDZENIE-PRZEGLAD.md)). Opis: [instrukcje/DEMO.md](../instrukcje/DEMO.md). Publicznego demo w internecie nie będzie: pomysł z Fly.io porzucony 13 listopada 2026, konfiguracja usunięta. W tym wątku nie zostało nic do zrobienia.

## Panel ustawień

Przebudowany 13 listopada 2026 po uwagach z produkcji: panel rodzica był przeładowany, bo wszystkie sekcje leżały rozwinięte jedna pod drugą, a „Rodzina” i „Kalendarze” otwierały drugi arkusz na pierwszym. Teraz to menu z podstronami w jednym arkuszu (opis w [PROJEKT.md](../PROJEKT.md), rozdział 2, „Ustawienia”). Odrzucone warianty: zwijane sekcje na tej samej liście (formularze z hasłem źle się w nich mieszczą, a arkusz na arkuszu zostaje) i osobny ekran „Dom” w pasku nawigacji (pasek ma już pięć pozycji, jak w [KONTA.md](KONTA.md)). W tym wątku nie zostało nic do zrobienia.

## Pomysły

Bez ustalonej kolejności. Tam, gdzie pomysł ma już szkic, odnośnik prowadzi do opisu.

| Pomysł | Szkic |
|---|---|
| Data ostatniej kopii zapasowej widoczna dla rodzica | [KONTA.md](KONTA.md), „Zakres” |
| Premie i potrącenia bez zadania | — |
| Częstotliwość wypłaty kieszonkowego: co tydzień, co dwa tygodnie albo co miesiąc, z wybranym dniem | Niżej, „Częstotliwość wypłaty” (zmiana modelu danych) |
| Kolor karteczki w regułach cyklicznych, przekazywany tworzonym zadaniom (dziś zadanie z reguły powstaje bez koloru) | — |
| Zdjęcie jako potwierdzenie wykonania | — |
| Własne wydarzenia rodzinne | — |
| Statystyki z archiwum | — |
| Eksport terminów do ICS | — |
| Środowisko UAT: instalacja, aktualizacja, backup i odtworzenie po awarii na żywo | Niżej, „Środowisko UAT” |
| Passkeys zamiast haseł | [KONTA.md](KONTA.md), „Rozważone warianty” |

## Szkice pomysłów

Przeniesione z PROJEKT.md 13 listopada 2026, bo PROJEKT.md opisuje tylko to, co już działa.

### Częstotliwość wypłaty (11 listopada 2026)

Dziś okres jest stały: tydzień od poniedziałku do niedzieli, wypłata w następny poniedziałek. Pomysł: rodzic wybiera okres, np. co tydzień, co dwa tygodnie albo co miesiąc, i dzień wypłaty, osobno dla dziecka albo dla całej rodziny. Zmiana dotyka modelu danych: `payouts.week_start` i `allowance_rates.effective_from` zakładają tydzień, a funkcje `weekStart` i `payoutDay` w `shared` liczą tylko tygodnie. Potrzebne są: okres przy stawce (stawka „na okres”, nie „na tydzień”), zmiana okresu bez działania wstecz (od najbliższego pełnego okresu), migracja zgodna z zasadą „tylko dodajemy” (dotychczasowe wiersze pozostają tygodniowe) oraz testy dla przełomu miesiąca i zmiany czasu.

### Środowisko UAT (11 listopada 2026)

Osobna, stała instalacja do testów na żywo, na której sprawdza się to, czego nie pokryją testy automatyczne ani lokalne demo:

- **Instalacja od zera** według instrukcji, z Dockerem i bez ([PUBLIKACJA.md](../archiwum/PUBLIKACJA.md)), łącznie z kreatorem pierwszego uruchomienia.
- **Aktualizacja** nowej wersji tą samą drogą co produkcja, przed produkcją, na kopii prawdziwych danych albo na danych demo.
- **Backup i odtworzenie po awarii:** kopia nocna, wysyłka poza serwer, odtworzenie na czystej maszynie z samych kopii i kluczy z menedżera haseł (`CALENDAR_ENCRYPTION_KEY`, klucze VAPID, hasła rclone), z zapisanym czasem odtworzenia.
- **Push i PWA na prawdziwych telefonach** bez ryzyka dla danych rodziny.

Do ustalenia: gdzie stoi (osobny kontener lub VPS, nie na produkcji), czy dostaje kopię danych rodziny (wymaga takiej samej ochrony jak produkcja) czy tylko dane demo, osobne klucze VAPID i szyfrujące, osobna domena oraz to, czy UAT dostaje wersję z `main` przed promocją na `prod` w CI. Wynik prób odtworzenia warto zapisywać jako ćwiczenie powtarzane np. raz na kwartał.
