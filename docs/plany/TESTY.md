# Testy: pokrycie i nowe rodzaje testów

Plan z 18 listopada 2026, etap 9. Wychodzi z rozmowy o tym, czego brakuje obecnym testom (API, front, e2e, test dymny, axe). Kolejność wyznacza ryzyko: najpierw pomiar, żeby było z czym porównywać, potem miejsca, gdzie błąd kosztuje najwięcej (reguły wspólne dla telefonu i serwera, migracje na danych rodziny). Jak działają testy, które już są: [PROJEKT.md](../PROJEKT.md), rozdział 11.

## Lista kontrolna

- [x] 1. Pomiar pokrycia w Vitest (API z `packages/shared`, front), progi i podsumowanie w CI, 18 listopada 2026
- [ ] 2. Własne testy `packages/shared`, w tym testy właściwości (`fast-check`)
- [ ] 3. Test migracji i powrotu do poprzedniej wersji
- [ ] 4. Pokrycie e2e: trasy API bez scenariusza i ekrany bez sprawdzenia dostępności
- [ ] 5. Aktualizacja service workera w teście dymnym
- [ ] 6. Regresja wizualna kluczowych ekranów
- [ ] 7. Testy mutacyjne (Stryker), uruchamiane okresowo
- [ ] 8. Fikstury ICS z prawdziwych kalendarzy

## 1. Pomiar pokrycia

**Gotowe, gdy:** `npm run test:coverage` liczy pokrycie API i frontu, spadek poniżej progów kończy CI błędem, a przebieg CI pokazuje tabelę z wynikiem i listę słabo pokrytych plików.

**Wykonanie (18 listopada 2026):**

- `@vitest/coverage-v8` w `apps/api` i `apps/web`; konfiguracja w `vitest.config.ts` każdej paczki (API dostało własny plik).
- Raport API obejmuje też `packages/shared` (`allowExternal`), bo API importuje jego źródła. Front liczy tylko swoje pliki: dwa osobne wyniki tego samego pliku z `shared` tylko by się myliły. Własne testy `shared` (punkt 2) dadzą mu jeden, pełny wynik.
- Front pomija w pomiarze komponenty `.tsx` (przechodzi je e2e) oraz `api.ts` i `hooks.ts` w katalogach funkcji, czyli cienkie opakowania TanStack Query.
- `scripts/coverage-summary.mjs` składa Markdown z raportów `json-summary`; CI dopisuje go do podsumowania przebiegu, a raport HTML zapisuje jako artefakt `pokrycie-…` na 14 dni.

**Stan wyjściowy (18 listopada 2026):**

| Paczka | Linie | Gałęzie | Funkcje |
|---|---|---|---|
| API z `packages/shared` | 83,4% | 76,7% | 80,5% |
| Front (logika bez widoku) | 53,5% | 29,7% | 56,9% |

Najmocniej pokryte są trasy (`src/routes`: 98,7% linii) i uprawnienia (`src/auth`: 97%). Bez testów: start i konfiguracja serwera (`index.ts`, `config.ts`, `jobs/scheduler.ts`), CLI, wysyłka push (`push/sender.ts`), pliki `format.ts` frontu i `lib/theme.ts`. Z `shared` najsłabiej `shopping.ts` (62% w raporcie API), bo `applyShoppingChange` działa na telefonie.

**Progi:** podłoga tuż pod stanem wyjściowym, nie docelowy procent. Globalny próg API (linie 80%, gałęzie 75%) oraz wyższe dla `src/auth/**` (linie 95%, gałęzie 88%) i `src/routes/**` (linie 97%, gałęzie 89%). Front ma próg tylko dla `ShoppingSync` (linie 86%, gałęzie 77%). Kiedy nowe testy podniosą wynik, podnosimy też próg w tym samym PR.

## 2. Testy `packages/shared`

**Gotowe, gdy:** `shared` ma własny `vitest.config.ts` z pomiarem pokrycia i testy, które sprawdzają niezmienniki z [PROJEKT.md](../PROJEKT.md) (rozdział 8) na losowych danych.

- `applyShoppingChange`: losowy ciąg operacji, z powtórzeniami i w zmienionej kolejności, daje na telefonie ten sam stan co na serwerze; powtórzona operacja niczego nie zmienia; usunięcie wygrywa zawsze. Porównanie z serwerem przez test API, który odtwarza ten sam ciąg na trasach zakupów.
- `warsawDate` i `addDays`: zmiana czasu w marcu i w październiku, przełom roku, północ w Warszawie przy innej strefie procesu.
- Reguły cykliczne: każdy wyliczony dzień pasuje do reguły i żadnego nie brakuje w zadanym przedziale.
- Zwykłe testy dla uprawnień (`canChangeTask`, `canTakeTask`, `canReleaseTask`) i `passwordProblem`, oraz dla `format.ts` we froncie.

## 3. Migracje i powrót do poprzedniej wersji

**Dlaczego:** merge do `main` to wdrożenie, migracje wykonują się same na danych rodziny, a zasada „starszy kod działa na nowszej bazie” (CLAUDE.md, „Migracje”) nie ma testu.

**Gotowe, gdy:** CI buduje wersję z gałęzi `prod`, uruchamia ją na bazie z danymi demo zmigrowanej przez nowy kod i przechodzi na niej test dymny; osobny test odrzuca w nowych plikach `drizzle/*.sql` polecenia, które usuwają albo zmieniają nazwy (`DROP`, `RENAME`).

## 4. Pokrycie e2e

**Gotowe, gdy:**

- Serwer e2e (tylko z `TEST_CLOCK=true`) zapisuje metodę i wzorzec ścieżki każdego żądania, a skrypt po przebiegu porównuje je z listą tras, którą zbiera już `routes.test.ts`, i wypisuje trasy bez scenariusza w podsumowaniu CI.
- `accessibility.spec.ts` bierze listę ekranów z `SCREENS` i podstron ustawień z typu `SubPage` zamiast z ręcznej listy, więc nowy ekran bez sprawdzenia kończy test błędem.

Pokrycie kodu frontu z Playwright (`page.coverage`, V8) zadziała tylko na projekcie `android`, bo profil iPhone to WebKit. Dołożymy je dopiero, jeśli lista tras okaże się za mało dokładna.

## 5. Aktualizacja service workera

**Gotowe, gdy:** test dymny instaluje zbudowaną wersję A, podmienia pliki na wersję B i sprawdza, że strona przechodzi na B, także po starcie bez sieci. Nazwa `app-sw.js` jest stała, więc błąd w tym miejscu zostawiłby telefony na starej wersji bez drogi naprawy.

## 6. Regresja wizualna

**Gotowe, gdy:** `toHaveScreenshot` sprawdza „Dziś”, tablicę, zakupy, kieszonkowe i menu ustawień w trzech wyglądach i obu trybach. Wzorce powstają wyłącznie w CI albo w kontenerze z tą samą wersją Playwright, bo renderowanie czcionek na macOS i Linuksie się różni. Aktualizacja wzorców to osobne polecenie, opisane w `e2e/README.md`.

## 7. Testy mutacyjne

**Gotowe, gdy:** Stryker z wtyczką Vitest działa na `packages/shared` i wybranych modułach API (`auth`, `routes/shopping.ts`), uruchamiany ręcznie albo raz w tygodniu (`workflow_dispatch` i `schedule`), nie na każdym PR, bo trwa długo. Wynik to lista mutacji, które przeżyły, jako wskazówka do nowych testów, bez progu blokującego.

## 8. Fikstury ICS

**Gotowe, gdy:** testy parsera korzystają z zanonimizowanych plików z Google, iCloud i Outlooka (wydarzenia całodniowe, cykliczne z wyjątkami, strefy czasowe, zmiana czasu), a jeden test podaje parserowi losowo uszkodzone wejście i sprawdza, że kończy się kodem błędu, nie wyjątkiem.

## Decyzje

**Ustalone 18 listopada 2026:**

- Pokrycie mierzy `@vitest/coverage-v8`, a progi są podłogą pod bieżącym stanem, podnoszoną razem z nowymi testami. Odrzucone: jeden docelowy próg (np. 80%) dla całości, bo nagradza testy łatwego kodu i nic nie mówi o krytycznych miejscach.
- Odrzucone: testy obciążeniowe (użytkownikiem jest jedna rodzina), testy komponentów React z Testing Library (e2e przechodzi te ekrany, a logikę wyciągamy do czystych funkcji) i drugie narzędzie analizy statycznej (decyzja o CodeQL z 17 listopada 2026, [archiwum/UTWARDZENIE-TESTY.md](../archiwum/UTWARDZENIE-TESTY.md)).
- Sprawdzenie produkcji po wdrożeniu (zdrowie i numer wersji po przesunięciu `prod`) należy do konkretnej instalacji, więc nie trafia do repozytorium.
