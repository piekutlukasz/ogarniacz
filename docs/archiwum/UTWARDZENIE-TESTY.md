# Utwardzenie po przeglądzie: testy i decyzje

Archiwum, zamknięte 17 listopada 2026: dawny `plany/UTWARDZENIE.md` z testami po 1.0 (T2–T4, T8), notatkami z ich wykonania i decyzjami. Przegląd z 11 listopada 2026 (ustalenia B1–B9, luki T1–T8, sprawdzenia na produkcji, wyniki obu skanów ZAP) i notatki z wykonania poprawek są w [UTWARDZENIE-PRZEGLAD.md](UTWARDZENIE-PRZEGLAD.md). Zrobione są B1–B6, B8, B9, T1–T8, test tras bez sesji i powtórzenie skanu ZAP z trasami kont. Konta w aplikacji, które wyrosły z ustalenia B7, mają osobny plan: [plany/KONTA.md](../plany/KONTA.md). Lista kontrolna przeglądu przed wydaniem obowiązuje dalej i jest w [PROJEKT.md](../PROJEKT.md), rozdział 9.

## Lista kontrolna

**Przed 1.0:**

Nic nie zostało. Skan ZAP z trasami kont, powtórzony 14 listopada 2026 na instancji bez `DEMO_MODE`, nie znalazł podatności; wynik jest w [UTWARDZENIE-PRZEGLAD.md](UTWARDZENIE-PRZEGLAD.md), rozdział 5.

**Po 1.0:**

- [x] T2: testy jednostkowe frontu, najpierw `ShoppingSync` (kolejka, ponawianie, zmiana konta), 15 listopada 2026
- [x] T3: sterowanie czasem serwera w e2e i scenariusz „Wypłacone” za zamknięty tydzień, 15 listopada 2026
- [x] T4: e2e logowania: wygaśnięcie sesji w trakcie pracy, komunikat o blokadzie, wyłączone konto, 15 listopada 2026
- [x] T8: automatyczne sprawdzenie dostępności (`@axe-core/playwright`) na każdym ekranie, 17 listopada 2026

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

**Wykonanie T8 (17 listopada 2026):** `e2e/tests/accessibility.spec.ts`, reguły WCAG 2.2 A i AA. Jeden scenariusz rodzica przechodzi „Dziś”, trzy zakładki tablicy, archiwum, „Cykliczne”, „Zakupy”, „Kieszonkowe” oraz menu i pięć podstron ustawień w każdym wyglądzie („Lodówka”, „Wieczorny las”, „Naklejki”) i obu trybach; drugi sprawdza ekran logowania. Scenariusz zakłada własne zadania zaległe, z kolorem, w trakcie i gotowe. Pierwszy skan znalazł ponad 600 miejsc z za słabym kontrastem i 2 przyciski z nazwą niezgodną z widocznym tekstem. Poprawki:

- Przygaszony tekst (`text-ink/35`–`/65`, 111 miejsc) dawał na białej karteczce 3,5–4,1:1 zamiast 4,5:1. Zastąpił go nazwany kolor `ink-muted`: tusz na 70%, najsłabszy, który przechodzi na każdym tle we wszystkich wyglądach i trybach (najgorzej 4,97:1 w „Wieczornym lesie”). Zostało tylko przygaszenie podpowiedzi w polach (`placeholder`).
- Gotowe zadanie i zakończone wydarzenie z kalendarza przygasały całą kartę przezroczystością 55%, więc opis pod tytułem spadał do 3:1. Teraz przygasa tylko tytuł (gotowe zadanie zostaje też przekreślone). Dzień tygodnia na „Dziś”: przezroczystość 70% zamiast 60%.
- Imię w nagłówku i zakładki statusów miały `aria-label` inny niż widoczny tekst, co przeszkadza w sterowaniu głosem. Nazwa jest teraz z widocznego tekstu, uzupełnionego tekstem tylko dla czytnika (`sr-only`), więc się nie zmieniła. Przycisk powrotu z archiwum pokazuje „Wróć” zamiast „Tablica”, bo nazywa się „Wróć na tablicę”.

Skan nie widzi zakończonych wydarzeń w sposób pewny (wydarzenia testowe są o 18:00), dialogów otwieranych z kart ani widoku dziecka; poprawki obejmują je tym samym kolorem.

**Zostaje ręczne:** instalacja na ekranie głównym i prawdziwy push na iPhonie i Androidzie. Emulacja telefonu w Playwright tego nie zastąpi.

Scenariusz e2e kreatora pierwszego uruchomienia jest w teście dymnym (`e2e/smoke/setup.spec.ts`, opis w [plany/KONTA.md](../plany/KONTA.md), rozdział „Testy”).

## Lista kontrolna przeglądu przed wydaniem

Przeniesiona do [PROJEKT.md](../PROJEKT.md), rozdział 9, bo obowiązuje dalej.

## Decyzje

**Ustalone 13 listopada 2026:**

- Przed wersją 1.0 weszły poprawki B1–B6, B8, B9 oraz testy T1, T5, T6 i test tras bez sesji, a dodatkowo T7.
- Skan ZAP (przebieg 2) powtarzamy przed 1.0 z trasami kont w aplikacji, na lokalnej instancji bez `DEMO_MODE` z jednorazową bazą.
- Dwa tygodnie bez awarii z etapu 8 liczymy od wdrożenia kont w aplikacji, bo to ostatnia duża zmiana przed 1.0.
- Dziennik logowań trzymamy 90 dni (stała `AUTH_EVENTS_KEEP_DAYS`).

**Ustalone 15 listopada 2026:**

- Czas w e2e (T3) steruje zmienna tylko do testów `TEST_CLOCK`, odrzucana na produkcji, ale przesunięcie dotyczy jednego żądania (nagłówek `X-Test-Now`), a nie całego serwera: przesunięty zegar całego serwera psułby testy biegnące równolegle. Odrzucony wariant: dane wstecz przez skrypt seedujący, bo tydzień założenia konta zależy od chwili pierwszego uruchomienia testów.

**Ustalone 17 listopada 2026:**

- Analiza statyczna to darmowy CodeQL w domyślnej konfiguracji GitHuba (włączony 14 listopada 2026, po upublicznieniu repozytorium; języki JavaScript i TypeScript oraz workflow Actions), razem z `npm audit` w CI i listą kontrolną przeglądu przed wydaniem. Zostajemy przy tym rozwiązaniu i nie zmieniamy go na inne. Odrzucone: Semgrep i inne narzędzia, darmowe albo płatne, bo dublowałyby CodeQL i dokładały utrzymania przy jednej rodzinie jako użytkownikach.
