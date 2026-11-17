# Utwardzenie i testy: co zostało

Stan na 17 listopada 2026. Część etapu 8 i wątek po 1.0 w [PLAN.md](../PLAN.md). Przegląd z 11 listopada 2026 (ustalenia B1–B9, luki T1–T8, sprawdzenia na produkcji, wyniki obu skanów ZAP) i notatki z wykonania poprawek są w archiwum: [archiwum/UTWARDZENIE-PRZEGLAD.md](../archiwum/UTWARDZENIE-PRZEGLAD.md). Zrobione są B1–B6, B8, B9, T1, T4–T7, test tras bez sesji i powtórzenie skanu ZAP z trasami kont. Konta w aplikacji, które wyrosły z ustalenia B7, mają osobny plan: [KONTA.md](KONTA.md).

## Lista kontrolna

**Przed 1.0:**

Nic nie zostało. Skan ZAP z trasami kont, powtórzony 14 listopada 2026 na instancji bez `DEMO_MODE`, nie znalazł podatności; wynik jest w archiwum, rozdział 5.

**Po 1.0:**

- [ ] T2: testy jednostkowe frontu, najpierw `ShoppingSync` (kolejka, ponawianie, zmiana konta)
- [ ] T3: sterowanie czasem serwera w e2e i scenariusz „Wypłacone” za zamknięty tydzień
- [x] T4: e2e logowania: wygaśnięcie sesji w trakcie pracy, komunikat o blokadzie, wyłączone konto (17 listopada 2026, opis niżej)
- [ ] T8: automatyczne sprawdzenie dostępności (`@axe-core/playwright`) na każdym ekranie

## Testy po 1.0

| Nr | Luka | Skutek | Propozycja |
|---|---|---|---|
| T2 | Brak testów jednostkowych frontu | `ShoppingSync` (kolejka w IndexedDB, ponawianie, zmiana konta) to najtrudniejszy kod po stronie telefonu, a pokrywają go 2 scenariusze e2e | Vitest dla `apps/web` z atrapą IndexedDB: kolejność wysyłki, błąd 5xx zostawia zmianę, ostateczna odmowa ją pomija, zalogowanie innej osoby porzuca kolejkę |
| T3 | Serwer testowy używa prawdziwego zegara | Przepływy zależne od czasu mają tylko testy API. Przykład: przycisk „Wypłacone” za zamknięty tydzień nie ma scenariusza e2e | Zmienna tylko do testów (wzorem `CALENDAR_ALLOW_HTTP`, odrzucana na produkcji), która przesuwa zegar serwera, albo przygotowanie danych wstecz przez skrypt seedujący bazę e2e |
| T8 | Brak automatycznego sprawdzenia dostępności | Testy opierają się na rolach i etykietach, ale nic nie pilnuje kontrastu ani brakujących nazw | `@axe-core/playwright` na każdym ekranie w obu trybach, jako jeden scenariusz |

**T4, zrobione 17 listopada 2026.** Wygaśnięcie sesji i blokada są w `e2e/tests/auth.spec.ts`, a logowanie na wyłączone konto dopisane do testu zaproszeń w `family.spec.ts`, który i tak kończy się wyłączeniem konta. Żaden z nich nie zakłada stałego konta testowego: baza e2e ma 8 aktywnych kont, a dwa równoległe testy zaproszeń zajmują dwa ostatnie miejsca do limitu 10. Sesję kończy wylogowanie przez API na świeżym logowaniu dziecka (`ApiClient.logOut`), więc zapisana sesja aktora zostaje, a blokada trafia w login spoza bazy. Scenariusz wygaśnięcia sesji wykrył błąd: 401 z żądań, które były już w drodze, czyściło dane drugi raz i usuwało trwające sprawdzenie kreatora, więc aplikacja zostawała na „Wczytuję…” zamiast pokazać logowanie. Poprawka w `apps/web/src/main.tsx`.

**Zostaje ręczne:** instalacja na ekranie głównym i prawdziwy push na iPhonie i Androidzie. Emulacja telefonu w Playwright tego nie zastąpi.

Scenariusz e2e kreatora pierwszego uruchomienia jest w teście dymnym (`e2e/smoke/setup.spec.ts`, opis w [KONTA.md](KONTA.md), rozdział „Testy”).

## Lista kontrolna przeglądu przed wydaniem

Powtarzana przed większym wydaniem: trasy przed `requireSession` w `app.ts`, `requireRole` na nowych trasach, test uprawnień dziecka dla każdej nowej trasy, sekrety poza repozytorium, `npm audit`.

## Decyzje

**Ustalone 13 listopada 2026:**

- Przed wersją 1.0 weszły poprawki B1–B6, B8, B9 oraz testy T1, T5, T6 i test tras bez sesji, a dodatkowo T7.
- Skan ZAP (przebieg 2) powtarzamy przed 1.0 z trasami kont w aplikacji, na lokalnej instancji bez `DEMO_MODE` z jednorazową bazą.
- Dwa tygodnie bez awarii z etapu 8 liczymy od wdrożenia kont w aplikacji, bo to ostatnia duża zmiana przed 1.0.
- Dziennik logowań trzymamy 90 dni (stała `AUTH_EVENTS_KEEP_DAYS`).

**Otwarte:**

| Pytanie | Propozycja |
|---|---|
| Analiza statyczna w CI (Semgrep; CodeQL na prywatnym repozytorium jest płatny, do potwierdzenia)? | Nie na start: `npm audit` i lista kontrolna przeglądu. Po publikacji repozytorium CodeQL jest darmowy i warto go włączyć |
| Sposób sterowania czasem w e2e (T3) | Zmienna tylko do testów, odrzucana na produkcji (serwer e2e działa w trybie deweloperskim) |
