# Utwardzenie i testy: co zostało

Stan na 15 listopada 2026. Część etapu 8 i wątek po 1.0 w [PLAN.md](../PLAN.md). Przegląd z 11 listopada 2026 (ustalenia B1–B9, luki T1–T8, sprawdzenia na produkcji, wyniki obu skanów ZAP) i notatki z wykonania poprawek są w archiwum: [archiwum/UTWARDZENIE-PRZEGLAD.md](../archiwum/UTWARDZENIE-PRZEGLAD.md). Zrobione są B1–B6, B8, B9, T1–T7, test tras bez sesji i powtórzenie skanu ZAP z trasami kont. Konta w aplikacji, które wyrosły z ustalenia B7, mają osobny plan: [KONTA.md](KONTA.md).

## Lista kontrolna

**Przed 1.0:**

Nic nie zostało. Skan ZAP z trasami kont, powtórzony 14 listopada 2026 na instancji bez `DEMO_MODE`, nie znalazł podatności; wynik jest w archiwum, rozdział 5.

**Po 1.0:**

- [x] T2: testy jednostkowe frontu, najpierw `ShoppingSync` (kolejka, ponawianie, zmiana konta), 15 listopada 2026
- [x] T3: sterowanie czasem serwera w e2e i scenariusz „Wypłacone” za zamknięty tydzień, 15 listopada 2026
- [x] T4: e2e logowania: wygaśnięcie sesji w trakcie pracy, komunikat o blokadzie, wyłączone konto, 15 listopada 2026
- [ ] T8: automatyczne sprawdzenie dostępności (`@axe-core/playwright`) na każdym ekranie

## Testy po 1.0

| Nr | Luka | Skutek | Propozycja |
|---|---|---|---|
| T2 | Brak testów jednostkowych frontu | `ShoppingSync` (kolejka w IndexedDB, ponawianie, zmiana konta) to najtrudniejszy kod po stronie telefonu, a pokrywają go 2 scenariusze e2e | Vitest dla `apps/web` z atrapą IndexedDB: kolejność wysyłki, błąd 5xx zostawia zmianę, ostateczna odmowa ją pomija, zalogowanie innej osoby porzuca kolejkę |
| T3 | Serwer testowy używa prawdziwego zegara | Przepływy zależne od czasu mają tylko testy API. Przykład: przycisk „Wypłacone” za zamknięty tydzień nie ma scenariusza e2e | Zmienna tylko do testów (wzorem `CALENDAR_ALLOW_HTTP`, odrzucana na produkcji), która przesuwa zegar serwera, albo przygotowanie danych wstecz przez skrypt seedujący bazę e2e |
| T4 | Logowanie ma 3 scenariusze | Nie ma testu wygaśnięcia sesji w trakcie pracy (`401` ma pokazać logowanie i nie zgubić kolejki zakupów), komunikatu o blokadzie ani wyłączonego konta | Trzy scenariusze w `auth.spec.ts`; sesję unieważnia `actor.api` albo CLI na osobnym koncie |
| T8 | Brak automatycznego sprawdzenia dostępności | Testy opierają się na rolach i etykietach, ale nic nie pilnuje kontrastu ani brakujących nazw | `@axe-core/playwright` na każdym ekranie w obu trybach, jako jeden scenariusz |

**Wykonanie T2–T4 (15 listopada 2026):**

- T2: `apps/web/src/features/shopping/sync.test.ts`, Vitest z `fake-indexeddb` i atrapą `fetch`; `npm test` uruchamia teraz testy API i frontu.
- T3: zegar sterowany nagłówkiem `X-Test-Now` dla jednego żądania (`apps/api/src/testClock.ts`, `TEST_CLOCK=true` tylko na serwerze e2e). Scenariusz w `allowance.spec.ts` przesuwa zegar rodzica i dziecka projektu o tydzień i szuka niewypłaconego tygodnia, bo baza e2e nie jest czyszczona.
- T4: blokada logowania w `auth.spec.ts` (na nieistniejącym loginie), wygaśnięcie sesji w trakcie pracy z kolejką zakupów bez sieci w teście „Wyloguj inne urządzenia” (`account.spec.ts`), wyłączone konto w teście zaproszeń (`family.spec.ts`). Bez nowych kont, bo limit 10 aktywnych kont ma w bazie e2e mały zapas. Scenariusz wyłączonego konta znalazł błąd: drugie `401` z żądania wysłanego przed wylogowaniem czyściło dane jeszcze raz, usuwało trwające pytanie o kreator i aplikacja zostawała na „Wczytuję…” zamiast logowania. Poprawka w `apps/web/src/main.tsx`.

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

**Ustalone 15 listopada 2026:**

- Czas w e2e (T3) steruje zmienna tylko do testów `TEST_CLOCK`, odrzucana na produkcji, ale przesunięcie dotyczy jednego żądania (nagłówek `X-Test-Now`), a nie całego serwera: przesunięty zegar całego serwera psułby testy biegnące równolegle. Odrzucony wariant: dane wstecz przez skrypt seedujący, bo tydzień założenia konta zależy od chwili pierwszego uruchomienia testów.

**Otwarte:**

| Pytanie | Propozycja |
|---|---|
| Analiza statyczna w CI (Semgrep; CodeQL na prywatnym repozytorium jest płatny, do potwierdzenia)? | Nie na start: `npm audit` i lista kontrolna przeglądu. Po publikacji repozytorium CodeQL jest darmowy i warto go włączyć |
