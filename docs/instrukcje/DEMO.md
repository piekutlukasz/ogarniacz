# Demo

Demo to Ogarniacz z przykładowymi danymi, bez zakładania kont. Są dwa sposoby uruchomienia; oba działają na jednorazowej bazie i nie dotykają prawdziwych danych.

| Sposób | Komenda | Kiedy |
|---|---|---|
| Lokalnie, Node | `npm run demo` | Szybki podgląd podczas pracy nad aplikacją |
| Lokalnie, Docker | `docker compose -f docker-compose.demo.yml up --build` | Bez Node na maszynie albo test obrazu produkcyjnego |

## Co zawiera

Konta `tata` i `mama` (rodzice) oraz `kasia` (dziecko), wspólne hasło `demo-haslo`. Na ekranie logowania w trybie demo są przyciski „Wejdź jako…”, więc hasła nie trzeba wpisywać. Dane powstają w `apps/api/src/demo.ts`: zadania w trzech kolumnach (w tym zaległe i na dziś), reguły cykliczne, lista zakupów z historią i kieszonkowe z jednym tygodniem wypłaconym oraz jednym czekającym. Wszystkie daty liczą się od chwili wgrania danych, więc demo zawsze wygląda na bieżące.

## Tryb `DEMO_MODE=true`

Włączają go `npm run demo` i `docker-compose.demo.yml`. Zmienia zachowanie serwera:

- **Dane.** Przy starcie z pustą bazą serwer sam wgrywa dane przykładowe, więc nowy kontener jest od razu gotowy.
- **Reset co godzinę.** O pełnej godzinie (czas polski) cała baza jest czyszczona i wgrywana od nowa, a wszyscy są wylogowywani. Goście mogą więc dowolnie dodawać i kasować, a nic po nich nie zostaje. Zamiast nocnej kopii zapasowej to jest jedyne zadanie utrzymaniowe, a `BACKUP_REMOTE` jest ignorowane.
- **Bezpiecznik przed prawdziwymi danymi.** Reset i start sprawdzają, czy każde konto w bazie jest kontem przykładowym: ma login z listy demo **i** działa na nie hasło `demo-haslo`. Samo „tata” nie wystarcza, bo prawdziwa rodzina też może tak nazwać konto. Gdy znajdzie się inne, reset kończy się błędem w logu i niczego nie kasuje, a serwer z `DEMO_MODE=true` w ogóle nie startuje. Chroni to produkcję przed przypadkowym ustawieniem tej zmiennej: bez tego reset skasowałby dane rodziny, a wejście bez hasła wpuściłoby obcych na jej konta.
- **Wejście bez hasła.** `GET /api/demo` podaje listę kont, a `POST /api/demo/login` zakłada sesję. Działa tylko dla trzech kont przykładowych; żadne inne konto w bazie nie wpuści bez hasła. Poza trybem demo obie ścieżki odpowiadają zwykłym 404.
- **Limit wierszy.** Przy 300 zadaniach, pozycjach zakupów albo regułach dodawanie kolejnych kończy się komunikatem „Demo jest pełne”. Edycja, odhaczanie i czyszczenie nadal działają.
- **Baner** „Wersja demonstracyjna” na każdym ekranie.
- **Bez indeksowania:** nagłówek `X-Robots-Tag: noindex, nofollow` i `/robots.txt` z `Disallow: /`.
- **Brak push i zmiany haseł.** Powiadomienia są w demo wyłączone: serwer nie dostaje kluczy VAPID, a sekcja znika z ustawień, żeby wysyłka nie trafiała na telefony gości. Aplikacja nie ma też w API zmiany haseł ani wyłączania kont, więc goście nie mogą ich ruszyć. Robi to tylko CLI na serwerze.

Limit prób logowania pozostaje włączony dla hasła wpisywanego ręcznie. Adres klienta serwer bierze z nagłówka z `CLIENT_IP_HEADER` (domyślnie `X-Real-IP` za nginx). Ten nagłówek wolno ustawić tylko tam, gdzie ruch na pewno przechodzi przez własne proxy, bo inaczej klient mógłby go podrobić.

## Zmiana schematu bazy

Seed (`apps/api/src/demo.ts`) zapisuje dane bezpośrednio do tabel. Nowa tabela albo kolumna wymagana przez aplikację musi tu trafić, a `clearDatabase` musi ją czyścić przed resetem (w kolejności od tabel zależnych). Pilnuje tego `demo.test.ts`: reset i logowanie na konta demo przechodzą tylko przy poprawnym seedzie.
