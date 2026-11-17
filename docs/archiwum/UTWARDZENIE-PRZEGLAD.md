# Utwardzenie przed 1.0: przegląd i wykonanie

Archiwum. Przegląd bezpieczeństwa i testów z 11 listopada 2026 (ustalenia B1–B9, luki w testach T1–T8, sprawdzenia na produkcji) oraz notatki z wykonania poprawek, zakończonego 13 listopada 2026, i powtórzenia skanu ZAP z 14 listopada 2026. Numeracja rozdziałów i ustaleń jest ta sama co w dawnym `plany/UTWARDZENIE.md`, więc odwołania w kodzie i dokumentach („B1”, „rozdział 8”) nadal prowadzą tutaj. Testy po 1.0 i późniejsze decyzje są w [UTWARDZENIE-TESTY.md](UTWARDZENIE-TESTY.md).

## 0. Zrobione punkty listy kontrolnej

- [x] Analiza kodu, konfiguracji wdrożenia i próba na lokalnej instancji (11 listopada 2026)
- [x] Sprawdzenia na produkcji: port 3001 z internetu, nagłówek `X-Real-IP` od proxy, HSTS, ochrona gałęzi `main` (rozdział 8, wyniki w „Wyniki z 13 listopada 2026”); wyniki w postaci ogólnej w `instrukcje/WDROZENIE.md` (13 listopada 2026)
- [x] B2: API nasłuchuje na `127.0.0.1` (zmienna `HOST`, w obrazie Docker `0.0.0.0`) (13 listopada 2026)
- [x] B6: limit rozmiaru żądania w aplikacji (`bodyLimit`, 100 kB) (13 listopada 2026)
- [x] B5: nagłówki bezpieczeństwa (`secureHeaders`, CSP bez skryptów w stronie: skrypt motywu przeniesiony do `theme.js`); HSTS zostaje po stronie proxy, które go już dodaje (13 listopada 2026)
- [x] B8: błędy walidacji i nieoczekiwane błędy jako `{ error: 'komunikat' }` (13 listopada 2026)
- [x] B3, część 1: `X-Forwarded-Host` ustawiany przez nginx (13 listopada 2026)
- [x] B3, część 2: źródło adresu klienta bez zmian, bo proxy hostingu nadpisuje `X-Real-IP` (13 listopada 2026)
- [x] B4: dziennik logowań (`auth_events`, migracja `0010`): udane i nieudane próby, blokady, wylogowanie, zmiany kont z CLI; podgląd `user log` w CLI; retencja 90 dni (13 listopada 2026)
- [x] B1: blokada logowania na parę login i adres (5 prób na 15 minut) zamiast na sam login, bezpiecznik 100 prób na login na godzinę, IPv6 po `/64` (13 listopada 2026)
- [x] B9: `npm audit` w CI, Dependabot dla `github-actions` i `docker` (bez głównych wersji Node), akcja wdrażająca demo przypięta do commitu (13 listopada 2026; workflow `demo.yml` z tą akcją usunięty razem z publicznym demo)
- [x] Test przekrojowy: każda trasa poza publicznymi odpowiada bez sesji `401` (`apps/api/src/routes.test.ts`, także w trybie demo) (13 listopada 2026)
- [x] Jednorazowy skan OWASP ZAP na lokalnym demo: bazowy bez sesji i aktywny API z sesją rodzica i dziecka, bez podatności (rozdział 5) (13 listopada 2026)
- [x] T1: test dymny e2e na zbudowanej aplikacji (`npm run test:smoke`, także w CI): logowanie, „Dziś”, service worker, start bez sieci, CSP bez naruszeń, nagłówki pamięci podręcznej (13 listopada 2026)
- [x] T5: skrypt aktualizacji sprawdza migracje na świeżej kopii (`backup verify`) przed zatrzymaniem starej wersji; po błędzie wraca kodem na dysku do poprzedniego commita (13 listopada 2026)
- [x] T6: ślady Playwright i raport HTML zapisywane w CI po błędzie (artefakt na 7 dni), adnotacje GitHub także dla testów zaliczonych za drugim razem (13 listopada 2026)
- [x] T7: test e2e trybu demo na drugim serwerze testu dymnego z `DEMO_MODE=true` (13 listopada 2026)
- [x] Powtórzenie skanu ZAP z trasami kont, bez `DEMO_MODE`: rodzic, dziecko, zmiana hasła, bez sesji, kreator na pustej bazie i bazowy front, bez podatności; poprawione atrybuty usuwanego cookie sesji (rozdział 5) (14 listopada 2026)

## 1. Zakres i metoda

Przegląd odpowiada na cztery pytania:

1. Czy API są zabezpieczone, w szczególności zakładanie kont?
2. Czy potrzebujemy panelu administracyjnego (konta, logi)?
3. Czy planujemy pentesty lub testy bezpieczeństwa?
4. Czy testy e2e są wystarczające?

**Co zostało sprawdzone:**

- Kod: `apps/api/src/app.ts`, wszystkie trasy w `routes/`, katalog `auth/`, `cli.ts`, `config.ts`, `index.ts`, schematy w `packages/shared`, warstwa HTTP frontu, `push-sw.js`.
- Wdrożenie: skrypty instalacji (w tym konfiguracja nginx i skrypt aktualizacji), `Dockerfile`, `docker-compose.yml`, konfiguracja publicznego demo, workflowy w `.github`.
- Testy: listy scenariuszy e2e i testów API, `e2e/playwright.config.ts`. Testy API zostały uruchomione: 242 przechodzą.
- Próba na żywo: lokalne API z jednorazową bazą, `NODE_ENV=production`, konto rodzica i dziecka, żądania przez `curl`.
- Zależności: `npm audit --omit=dev` pokazuje 0 podatności; pełny `npm audit` 4 niskie, wszystkie w narzędziach budowania (`vite-plugin-pwa`, `workbox-build`).

**Czego nie dało się sprawdzić stąd:** samej produkcji (jak proxy hostingu traktuje nagłówki i czy porty serwera są widoczne z internetu), prawdziwych telefonów oraz przebiegu testów e2e. Sprawdzenia do wykonania na produkcji są w rozdziale 8.

## 2. Co działa

Potwierdzone próbą na żywo albo testami:

- **Kont nie da się założyć przez API.** Takiej trasy nie ma: `POST /api/users` bez sesji daje `401`, a z sesją dziecka `404`. Konta powstają tylko przez CLI na serwerze (`user add`), czyli wymagają dostępu SSH.
- **Wszystko poza logowaniem i `/api/health` wymaga sesji.** Dziewięć sprawdzonych tras odpowiada bez sesji `401`.
- **Role egzekwuje API.** Dziecko dostaje `403` na regułach cyklicznych, kalendarzach i stawkach kieszonkowego.
- **Nie da się podmienić roli.** `PATCH /api/users/me` z polami `role` i `name` zmienia tylko kolor.
- **CSRF.** Żądanie zmieniające dane z obcym `Origin` dostaje `403`, a cookie ma `SameSite=Lax`.
- **Sesje i hasła.** Losowy token 256 bitów, w bazie tylko jego skrót, cookie `HttpOnly` i `Secure` na produkcji; hasła `scrypt`; odpowiedź nie zdradza, czy login istnieje, także czasem odpowiedzi.
- **Kalendarze i push.** Ochrona przed SSRF, szyfrowanie linków i lista usług push mają własne testy (opis: [KALENDARZE-PROJEKT.md](KALENDARZE-PROJEKT.md), rozdział 5).
- **Front.** Brak `dangerouslySetInnerHTML` i `innerHTML`; tytuły wydarzeń z obcych kalendarzy są czyszczone przy imporcie.

## 3. Ustalenia bezpieczeństwa

| Nr | Ustalenie | Skutek | Waga | Stan |
|---|---|---|---|---|
| B1 | Blokada po 5 złych hasłach liczy się na sam login | Obcy może w kółko blokować logowanie wybranej osoby na 15 minut | Średnia | Naprawione 13 listopada 2026: blokada na parę login i adres |
| B2 | API nasłuchuje na wszystkich interfejsach, a kod zakłada „tylko lokalnie za nginx” | Jeśli hosting wystawia porty serwera, port 3001 omija nginx i HTTPS | Niska: port niewidoczny z internetu | Naprawione 13 listopada 2026 (`HOST`); sprawdzenie na produkcji: port nieosiągalny |
| B3 | Limit prób na adres IP ufa nagłówkowi `X-Real-IP` przekazanemu dalej bez zmian | Jeśli proxy hostingu nie nadpisuje nagłówka, limit na IP da się obejść | Brak na produkcji | Proxy hostingu nadpisuje nagłówek (sprawdzenie 13 listopada 2026); `X-Forwarded-Host` ustawia nginx |
| B4 | Nieudane logowania i blokady nie zostawiają żadnego śladu | Zgadywanie haseł jest niewidoczne | Średnia | Naprawione 13 listopada 2026: tabela `auth_events` |
| B5 | Brak nagłówków bezpieczeństwa (CSP, `nosniff`, `Referrer-Policy`) | Brak drugiej linii obrony przed XSS | Niska | Naprawione 13 listopada 2026 (`secureHeaders`, skrypt motywu w `theme.js`) |
| B6 | Brak limitu rozmiaru żądania w aplikacji | Serwer przyjmuje duże żądania przed logowaniem | Niska | Naprawione 13 listopada 2026 (`bodyLimit`, 100 kB) |
| B7 | Kontami, hasłami i sesjami zarządza się tylko przez SSH | Nowe konto, zapomniane hasło albo zgubiony telefon wymaga administratora | Średnia (operacyjna) | W większości naprawione 13 listopada 2026: zmiana hasła, „Wyloguj inne urządzenia”, zaproszenia i sekcja „Rodzina” ([KONTA.md](../plany/KONTA.md), kroki 1 i 2); pierwszego rodzica nadal zakłada CLI, do czasu kreatora |
| B8 | Błędy walidacji nie mają postaci `{ error: 'tekst' }` | Użytkownik widzi „Serwer odpowiedział kodem 400” | Niska (jakość, nie bezpieczeństwo) | Naprawione 13 listopada 2026 (`validate`, `app.onError`) |
| B9 | CI nie sprawdza zależności, a Dependabot obejmuje tylko npm | Podatność w zależności albo akcji wychodzi dopiero przy okazji | Niska | Naprawione 13 listopada 2026; ochrona gałęzi `main` czeka na publikację repozytorium |

### B1. Blokada konta przez obcego

`createLoginLimiter` (`apps/api/src/auth/rateLimit.ts`) liczy nieudane próby osobno na login i na adres IP. Limit na login nie zależy od tego, kto próbuje. W próbie sześć żądań ze złym hasłem dla loginu `tata` wystarczyło, żeby poprawne hasło dostało `429` na 15 minut. Atak można powtarzać bez końca, a loginy są łatwe do zgadnięcia.

Skutek jest ograniczony: zalogowane telefony działają dalej (sesja trwa 90 dni), więc blokada dotyka tylko nowego logowania. Adresu produkcji nie ma w dokumentach, ale repozytorium ma zostać upublicznione ([PUBLIKACJA.md](../plany/PUBLIKACJA.md)): przykładowe loginy i kod blokady będą wtedy jawne, więc tę poprawkę trzeba wdrożyć przed publikacją.

**Propozycja:**

- Blokadę po 5 próbach liczyć na parę login i adres IP, a nie na sam login. Obcy blokuje wtedy tylko siebie.
- Zostawić ogólny limit na login jako bezpiecznik przed zgadywaniem z wielu adresów, ale znacznie wyższy (np. 100 prób na godzinę), z wpisem w dzienniku logowań (B4).
- Adresy IPv6 grupować po prefiksie `/64`, bo jeden abonent ma ich pulę.
- Warunek: wiarygodny adres klienta, czyli najpierw B3. **Spełniony:** proxy hostingu nadpisuje `X-Real-IP` (rozdział 8).

**Wykonanie (13 listopada 2026)** w `auth/rateLimit.ts`: para login i adres 5 prób na 15 minut (udane logowanie ją zeruje), adres 20 prób na 15 minut, login 100 prób na godzinę bez zerowania po udanym logowaniu. Bez nagłówka z adresem para to sam login, jak dawniej. Liczniki zostają w pamięci procesu.

**Wariant zapasowy**, jeśli adresowi klienta nie da się zaufać: „znane urządzenie”. Telefon, który raz zalogował się poprawnie, dostaje długie cookie urządzenia i nie podlega blokadzie wywołanej przez obcych. Jest to bardziej złożone, więc tylko wtedy, gdy B3 wypadnie źle. **Niepotrzebny:** B3 wypadło dobrze.

### B2. Nasłuch na wszystkich interfejsach

`serve({ fetch: app.fetch, port })` w `apps/api/src/index.ts` nie podaje adresu, więc Node otwiera port na wszystkich interfejsach. W próbie serwer odpowiadał także na zewnętrznym adresie maszyny. Tymczasem komentarze w `auth/middleware.ts` i `routes/auth.ts` opierają zaufanie do nagłówków `X-Forwarded-Host` i `X-Real-IP` na założeniu, że API jest dostępne tylko dla nginx.

Jeśli hosting wystawia porty serwera do internetu, port 3001 pozwala ominąć nginx: ruch idzie bez HTTPS, bez limitu 1 MB i z dowolnie ustawionymi nagłówkami. Trzeba to sprawdzić na produkcji (rozdział 8).

**Propozycja:**

- Nowa zmienna `HOST`, domyślnie `127.0.0.1`. `Dockerfile` ustawia `HOST=0.0.0.0`, bo w kontenerze Dockera port wystawia dopiero mapowanie, a `docker-compose.yml` już ogranicza je do `127.0.0.1`.
- Serwer testowy e2e i `npm run dev` zostają na adresie lokalnym: Vite łączy się z API przez `localhost`.
- Zmiana obejmuje `config.ts`, `index.ts`, `Dockerfile`, konfigurację publicznego demo (łączyło się z kontenerem po adresie wewnętrznym) i opis w [WDROZENIE.md](../instrukcje/WDROZENIE.md). Zadanie `container` w CI sprawdzi, że obraz nadal odpowiada.

### B3. Zaufanie do nagłówków od proxy

Konfiguracja nginx produkcji przekazuje `X-Real-IP` tak, jak przyszedł (`$http_x_real_ip`), bo prawdziwy adres zna dopiero proxy hostingu. Jeśli to proxy nagłówek nadpisuje, wszystko jest w porządku. Jeśli tylko go przepuszcza, klient może wpisać dowolny adres i ominąć limit 20 prób na IP. W próbie lokalnej 25 logowań z 25 podrobionymi adresami przeszło bez blokady.

Drugi nagłówek, `X-Forwarded-Host`, nginx w ogóle nie ustawia, więc wartość od klienta dociera do API. Przeglądarka nie pozwoli obcej stronie go dodać (wymagałoby to zgody CORS, której API nie daje), więc ochrony przed CSRF to nie osłabia, ale warto zamknąć temat.

**Propozycja:**

- Sprawdzić zachowanie proxy hostingu jednym testem (rozdział 8) i zapisać wynik w WDROZENIE.md.
- W `nginx.conf` dodać `proxy_set_header X-Forwarded-Host $host;`, żeby wartość od klienta nie docierała do API.
- Jeśli proxy hostingu nie nadpisuje `X-Real-IP`: brać adres z nagłówka, który proxy na pewno ustawia samo (do ustalenia), albo przyjąć wariant zapasowy z B1.

### B4. Brak śladu po próbach logowania

Aplikacja niczego nie loguje przy złym haśle ani przy blokadzie. W `app.log` są tylko start, backup, synchronizacja i błędy zadań w tle. Zgadywania haseł nie da się więc zauważyć ani odtworzyć po fakcie.

**Propozycja:** dziennik logowań w bazie, tabela `auth_events` opisana w [KONTA.md](../plany/KONTA.md) (rozdział „Model danych”). Powstaje przed kontami, bo potrzebuje go nowa blokada z B1. W dzienniku nie zapisujemy wpisanego loginu, jeśli nie pasuje do istniejącego konta: ludzie wpisują czasem hasło w pole loginu.

**Wykonanie (13 listopada 2026):**

- Wpisy: `login_ok`, `login_failed` (z powodem w `detail`: `bad_password`, `disabled`, `unknown_login`), `locked` (zakres blokady: `pair`, `ip` albo `login`, jeden wpis na początek blokady), `logout`, a z CLI `account_created`, `password_reset`, `account_disabled`, `account_enabled` (`detail: cli`). Każdy z adresem klienta i opisem przeglądarki przyciętym do 200 znaków.
- Względem szkicu w KONTA.md doszły kolumna `detail` i rodzaj `account_created` (konto z CLI).
- Próby na nieistniejące loginy trafiają do dziennika najwyżej raz na minutę na adres, a żądania odrzucone przez trwającą blokadę (`429`) nie są zapisywane, więc z zewnątrz nie da się zapchać tabeli.
- Podgląd przed sekcją „Rodzina”: `user log [--limit N]` w CLI. Trasa `GET /api/auth/events` powstaje z krokiem 2 kont.
- Harmonogram usuwa wpisy starsze niż 90 dni razem z wygasłymi sesjami (3:45).

### B5. Nagłówki bezpieczeństwa

Odpowiedzi API i frontu nie mają `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy` ani `Permissions-Policy`. Nie znalazłem miejsca, w którym dałoby się wstrzyknąć skrypt, więc to obrona w głąb.

**Propozycja:**

- Middleware `secureHeaders` z Hono (jest w zainstalowanej wersji) na całej aplikacji.
- CSP: `default-src 'self'`, bez zewnętrznych źródeł, bo kroje pisma są dołączone do aplikacji. Skrypt w `index.html`, który ustawia motyw przed pierwszym malowaniem, jest wpisany w stronę, więc potrzebuje skrótu `sha256` w `script-src` albo przeniesienia do osobnego pliku. **Wykonanie:** osobny plik `public/theme.js` (zwykły, blokujący skrypt, w pamięci service workera), bo skrót trzeba by pilnować przy każdej zmianie skryptu.
- `frame-ancestors 'none'`, żeby aplikacji nie dało się osadzić w ramce.
- HSTS tylko wtedy, gdy nie dodaje go już proxy hostingu (sprawdzenie w rozdziale 8). **Wynik:** proxy dodaje `max-age=63072000`, więc aplikacja go nie wysyła. HSTS należy do tego, kto kończy TLS; dotyczy to też instalacji z Dockerem i własnym proxy.
- Test e2e na zbudowanej aplikacji (T1 w rozdziale 6) pokaże, czy CSP nie blokuje service workera ani stylów.

### B6. Limit rozmiaru żądania

Aplikacja nie ma własnego limitu. W próbie `POST /api/auth/login` z ciałem 20 MB został przyjęty i sparsowany bez logowania (odpowiedź `400`). Na produkcji chroni przed tym `client_max_body_size 1m` w nginx, ale obraz Dockera i publiczne demo nie mają tej warstwy.

**Propozycja:** middleware `bodyLimit` z Hono dla `/api/*`, np. 100 kB (największe prawdziwe żądanie to czyszczenie koszyka z 500 identyfikatorami, około 20 kB), z odpowiedzią `{ error: 'Za duże żądanie' }` i kodem `413`.

### B7. Konta, hasła i sesje tylko przez SSH

- Konto zakłada wyłącznie administrator przez CLI na serwerze.
- Hasło ma jeden wymóg: co najmniej 8 znaków.
- Nikt nie zmieni hasła w aplikacji, także własnego.
- Wylogowanie dotyczy jednego urządzenia. „Wyloguj wszędzie” robi dopiero `user passwd` w CLI.
- Drugi rodzic nie ma dostępu do serwera, więc nie pomoże dziecku, które zapomniało hasła.

**Propozycja:** [KONTA.md](../plany/KONTA.md).

### B8. Postać błędów walidacji

`zValidator` bez własnej obsługi odpowiada obiektem Zod (`{ success: false, error: { name: 'ZodError', … } }`), a niepoprawny JSON tekstem `Malformed JSON in request body`. Kontrakt mówi `{ error: 'komunikat po polsku' }`, więc front pokazuje wtedy „Serwer odpowiedział kodem 400”. Dziś widać to rzadko, bo formularze walidują dane tymi samymi schematami przed wysłaniem.

**Propozycja:** jeden wspólny `validate(cel, schemat)` w API, który zwraca pierwszy komunikat ze schematu jako `{ error }`, oraz `app.onError` dla nieoczekiwanych błędów (`{ error: 'Coś poszło nie tak' }`, szczegóły tylko w logu).

### B9. Łańcuch dostaw i CI

- `ci.yml` nie uruchamia `npm audit`.
- `.github/dependabot.yml` obejmuje tylko `npm`, bez `github-actions` i `docker`.
- `demo.yml` używa akcji wdrażającej demo z nieprzypiętej gałęzi (`@master`), w zadaniu z sekretem dostępu do hostingu demo.
- Merge do `main` wdraża produkcję w kilka minut, więc ochrona gałęzi `main` (wymagane CI, zakaz bezpośredniego pusha) jest częścią bezpieczeństwa. **Wynik z 13 listopada 2026:** ochrona gałęzi i reguły (rulesets) nie są dostępne dla prywatnego repozytorium na darmowym planie GitHub (API odpowiada `403`). Do czasu publikacji chroni tylko zadanie `promote`: gałąź `prod`, z której wdraża serwer, przesuwa się wyłącznie po zielonym `test` i `container`, także po bezpośrednim pushu na `main`.

**Propozycja:** rozdział 5.

## 4. Konta w aplikacji

Odpowiedź na ustalenie B7 i na pytanie o panel administracyjny ma osobny plan: [KONTA.md](../plany/KONTA.md) (zaproszenia, sekcja „Rodzina”, kreator pierwszego uruchomienia, szkic API i modelu danych). Pełnego panelu administracyjnego nie budujemy.

## 5. Testy bezpieczeństwa

**Stan przed przeglądem:** automatycznych testów bezpieczeństwa w CI nie ma, poza cotygodniowym Dependabotem dla npm. Pentestu nikt nie planował.

**Wniosek: płatny pentest jest nieproporcjonalny** do prywatnej aplikacji dla czterech osób. Zamiast niego:

1. **Poprawki z rozdziału 3** (B1 do B6, B8). Ten dokument jest pierwszą częścią przeglądu.
2. **`npm audit --omit=dev --audit-level=high` w CI**, jako krok zadania `test`. Tylko zależności produkcyjne i tylko wysokie, żeby niska podatność w narzędziu budowania nie blokowała wdrożeń.
3. **Dependabot dla `github-actions` i `docker`** oraz przypięcie akcji wdrażającej demo do wersji.
4. **Analiza statyczna.** CodeQL na prywatnym repozytorium jest, według mojej wiedzy, płatny (wymaga licencji GitHub Code Security); przed decyzją trzeba to potwierdzić w ustawieniach repozytorium. Po upublicznieniu repozytorium CodeQL i skan sekretów są darmowe i warto je włączyć. Darmowa alternatywa to Semgrep z regułami dla TypeScriptu w CI. Do decyzji, czy w ogóle warto przy tej wielkości kodu.
5. **Jednorazowy skan OWASP ZAP** (tryb „baseline”, a potem z sesją rodzica i dziecka) na lokalnym `npm run demo`. Nigdy na produkcji z danymi rodziny.
6. **Lista kontrolna przeglądu** powtarzana przed większym wydaniem: trasy przed `requireSession` w `app.ts`, `requireRole` na nowych trasach, test uprawnień dziecka dla każdej nowej trasy, sekrety poza repozytorium, `npm audit`.
7. **Ochrona gałęzi `main`** w GitHubie: wymagane zielone CI, brak bezpośredniego pusha. Na prywatnym repozytorium niedostępna bez płatnego planu; włączyć zaraz po upublicznieniu ([PUBLIKACJA.md](../plany/PUBLIKACJA.md)).

Testy uprawnień są już częścią testów API (grupy „role”, „uprawnienia i widoczność”, „wymaga zalogowania”). Warto dodać jeden test przekrojowy: lista wszystkich tras z `app.ts` i sprawdzenie, że każda poza jawnie publicznymi odpowiada bez sesji `401`. Nowa trasa dodana przed `requireSession` przez pomyłkę nie przejdzie wtedy niezauważona.

**Wykonanie (13 listopada 2026):** `apps/api/src/routes.test.ts` zbiera trasy z `app.routes`, więc nie wymaga ręcznej listy chronionych tras. Publiczne są tylko `GET /api/health`, `POST /api/auth/login`, `POST /api/auth/logout`, od kroku 2a kont także `POST /api/invites/preview` i `POST /api/invites/accept`, a w trybie demo dodatkowo `GET /api/demo` i `POST /api/demo/login`; nowa trasa publiczna wymaga świadomego dopisania do listy w teście. Próba z celowo dodaną trasą przed `requireSession` kończy test błędem.

### Wynik skanu ZAP (13 listopada 2026)

**Jak:** obraz `ghcr.io/zaproxy/zaproxy:stable` w Dockerze, cel `npm run demo` z `NODE_ENV=production` na jednorazowej bazie. Dwa przebiegi:

1. **Bazowy** (`zap-baseline.py` ze spiderem i spiderem AJAX, reguły alfa): sam front i trasy publiczne, bez sesji, tylko reguły pasywne.
2. **Aktywny API** (`zap-api-scan.py`): ręcznie spisana specyfikacja OpenAPI wszystkich 31 tras z rozdziału 5 `PROJEKT.md` z prawdziwymi identyfikatorami, cookie sesji wstrzykiwane regułą zamiany. Raz z sesją rodzica, raz dziecka. Reguły aktywne: wstrzyknięcia SQL, XSS odbity i trwały, przejście katalogów, wstrzyknięcie poleceń i szablonów, XSLT i inne. Ładunki trafiły do bazy (ponad 130 nowych zadań), więc skan naprawdę zapisywał; sesje przeżyły oba przebiegi.

**Wynik:** 0 błędów (FAIL) w obu przebiegach, 123 reguły zaliczone w skanie API. Ostrzeżenia i ocena:

| Ostrzeżenie ZAP | Ocena |
|---|---|
| `503` z `/api/push/subscriptions` i `/api/push/test` | Zamierzone: demo nie ma kluczy VAPID |
| Nieoczekiwany typ treści dla losowych ścieżek (`200`, HTML) | Zamierzone: front bez routera dostaje `index.html` dla każdej ścieżki poza `/api`; nieznane `/api/...` odpowiada `404` w JSON |
| Treść możliwa do zapisania w pamięci podręcznej | Strona ma `no-cache`, pliki z hashem `immutable`. Odpowiedzi API nie mają `Cache-Control`; bez `ETag` i `Last-Modified` przeglądarka ich nie zapisuje. Niskie ryzyko, ewentualnie `no-store` dla `/api` |
| Brak `Cross-Origin-Embedder-Policy` | Niepotrzebny: aplikacja nie używa `SharedArrayBuffer` ani izolacji międzydomenowej |
| Base64 w odpowiedzi `POST /api/demo/login` i w CSS | Fałszywy alarm: identyfikatory i dane obrazków w CSS, token sesji jest tylko w cookie `HttpOnly` |
| Brak nagłówków `Sec-Fetch-*` | Dotyczy żądań samego ZAP, nie aplikacji |

Ręczna próba uzupełniająca: zadanie o tytule `<img src=x onerror=alert(1)>XSS` wyświetla się na tablicy jako tekst, w stronie nie powstaje element `img`.

**Czego skan nie pokrył:** trasy kont w aplikacji (powstały później tego samego dnia: zaproszenia, konta, dziennik, zmiana hasła), logika uprawnień między osobami (tę sprawdzają testy API) i tryb bez `DEMO_MODE` (różnice to tylko trasy demo, reset i limity wierszy). Warto powtórzyć przebieg 2 z nowymi trasami, w tym publicznymi `POST /api/invites/preview` i `/accept`. W `DEMO_MODE` zaproszenia, zmiana hasła i wyłączanie kont odpowiadają `403`, więc ten przebieg wymaga instancji bez trybu demo, z jednorazową bazą. Powtórzenie jest opisane niżej.

### Powtórzenie skanu ZAP z trasami kont (14 listopada 2026)

**Jak:** ten sam obraz ZAP i ten sam przebieg 2 (`zap-api-scan.py`, reguły aktywne i alfa), ale cel to zbudowana aplikacja z `NODE_ENV=production` **bez** `DEMO_MODE`, z kluczami VAPID i kluczem kalendarzy, żeby trasy push i kalendarzy nie kończyły się na `503`. Baza jednorazowa, wypełniona `cli demo seed`, plus konta i dane dopisane pod skan: dodatkowe dziecko do wyłączania, trzy zaproszenia (do podglądu, do przyjęcia i do unieważnienia) i prawdziwy kalendarz Google ze świętami. Specyfikację OpenAPI spisano od nowa z rozdziału 5 `PROJEKT.md`: 46 operacji, a przykładowe ciała z prawdziwymi identyfikatorami, tokenami i hasłem potwierdzającym rodzica sprawdzono przed skanem na serwerze. Przebiegi:

| Przebieg | Sesja | Trasy | Wynik |
|---|---|---|---|
| Rodzic | tata | wszystkie z sesją oprócz wylogowania i zmiany hasła | 0 FAIL, 122 reguły zaliczone |
| Dziecko | kasia | jak wyżej (trasy rodzica dają `403`) | 0 FAIL, 122 zaliczone |
| Konto | mama | zmiana hasła, „wyloguj inne urządzenia” | 0 FAIL, 123 zaliczone |
| Bez sesji | — | wszystkie, w tym publiczne: logowanie, podgląd i przyjęcie zaproszenia, kreator, trasy demo | 0 FAIL, 121 zaliczone (po poprawce cookie: 123) |
| Kreator | — | `GET` i `POST /api/setup` na osobnym serwerze z pustą bazą, z prawdziwym kodem z logu | 0 FAIL, 123 zaliczone |
| Bazowy | — | front (spider i spider AJAX) | 0 FAIL, 66 zaliczonych |

Wylogowanie i zmiana hasła mają osobne przebiegi, bo inaczej skan zakończyłby własną sesję albo zmienił hasło potwierdzające, którego używają trasy zaproszeń. W kreatorze przykład ma poprawny kod i za krótkie hasło: ładunki w imieniu i loginie przechodzą wtedy przez sprawdzenie kodu aż do zapisu, który odrzuca hasło. Ładunki trafiły do bazy (133 zadania i 137 reguł cyklicznych ze skanu).

**Ostrzeżenia i ocena** (bez powtórzonych z pierwszego skanu: `index.html` dla nieznanych ścieżek, brak `Cross-Origin-Embedder-Policy`, `Sec-Fetch-*`, pamięć podręczna, Base64 w CSS):

| Ostrzeżenie ZAP | Ocena |
|---|---|
| SQL injection (wysokie, średnia pewność) w polu `endpoint` `POST /api/push/subscriptions` | Fałszywy alarm. API nie ma ani jednego surowego zapytania SQL, wszystkie idą przez parametryzowane `eq()` Drizzle. Odpowiedzi różnią się, bo trasa jest stanowa: nowe urządzenie dostaje `201`, powtórzone `200`, a liczba urządzeń w odpowiedzi rośnie. Odtworzone ręcznie: `… AND 1=1 --` i `… AND 1=2 --` zapisują się jako dwa osobne adresy |
| Cookie bez `HttpOnly` i bez `SameSite` w odpowiedzi `POST /api/auth/logout` | Puste cookie z `Max-Age=0`, więc bez ryzyka, ale **poprawione**: `clearSessionCookie` ustawia teraz te same atrybuty co przy logowaniu; pilnuje tego test w `auth/auth.test.ts`. Powtórzony przebieg bez sesji nie zgłasza już tego ostrzeżenia |
| Base64 w `GET /api/push/config` | Klucz publiczny VAPID, jawny z założenia |

**Ręczne próby uzupełniające:**

- Zaproszenie z imieniem `<img src=x onerror=alert(1)>`, przyjęte zaproszenie z imieniem `<svg onload=alert(3)>` i logowanie z takim nagłówkiem `User-Agent`: tablica (lista osób), „Rodzina” (konta i oczekujące zaproszenia) i dziennik logowań pokazują imiona jako tekst, a `User-Agent` interfejs w ogóle nie wyświetla (trafia tylko do bazy i `cli user log`). W stronie nie powstaje żaden wstrzyknięty element, a podstawiony `alert` nie został wywołany.
- Limity zadziałały pod skanem: złe hasła potwierdzające zablokowały logowanie taty i mamy (5 prób), ponad 20 złych tokenów zaproszeń dało `429`, a w kreatorze limit 5 złych kodów z adresu zatrzymał zgadywanie, zanim kod wygasł; kreator nadal czekał na pierwsze konto. Szóste oczekujące zaproszenie API odrzuciło.
- Wylogowanie odpowiada `Set-Cookie: ogarniacz_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`.

**Czego skan nie pokrył:** logika uprawnień między osobami (sprawdzają ją testy API), produkcja (nigdy z danymi rodziny) oraz skutki limitów: po blokadzie część ładunków dostała `429` zamiast przejść przez sprawdzenie hasła. Te same trasy przeszły jednak zanim limit zadziałał, a walidację wejścia sprawdzają schematy wspólne z testami.

## 6. Testy e2e i pozostałe

**Stan w chwili przeglądu (11 listopada 2026):** 32 scenariusze e2e na dwóch profilach telefonu (iPhone 15, Pixel 7) i 242 testy API. Po poprawkach i kontach w aplikacji (13 listopada 2026): 39 scenariuszy e2e, 7 scenariuszy testu dymnego i 297 testów API. Główne ścieżki są pokryte, łącznie z odmowami dla dziecka i pracą listy zakupów bez sieci. Luki wynikają głównie z konstrukcji testów, nie z ich liczby.

| Nr | Luka | Skutek | Propozycja |
|---|---|---|---|
| T1 | Testy biegną na serwerze deweloperskim Vite, nie na zbudowanej aplikacji | Service worker, start bez sieci, serwowanie frontu przez API i nagłówki pamięci podręcznej nie są sprawdzane automatycznie; zadanie `container` w CI pyta tylko o `/api/health` | Mały projekt Playwright „smoke” na `npm run build && npm start`: logowanie, „Dziś”, rejestracja `app-sw.js`, otwarcie aplikacji bez sieci |
| T2 | Brak testów jednostkowych frontu | `ShoppingSync` (kolejka w IndexedDB, ponawianie, zmiana konta) to najtrudniejszy kod po stronie telefonu, a pokrywają go 2 scenariusze e2e | Vitest dla `apps/web` z atrapą IndexedDB: kolejność wysyłki, błąd 5xx zostawia zmianę, ostateczna odmowa ją pomija, zalogowanie innej osoby porzuca kolejkę |
| T3 | Serwer testowy używa prawdziwego zegara | Przepływy zależne od czasu mają tylko testy API. Przykład: przycisk „Wypłacone” za zamknięty tydzień nie ma scenariusza e2e | Zmienna tylko do testów (wzorem `CALENDAR_ALLOW_HTTP`, odrzucana na produkcji), która przesuwa zegar serwera, albo przygotowanie danych wstecz przez skrypt seedujący bazę e2e |
| T4 | Logowanie ma 3 scenariusze | Nie ma testu wygaśnięcia sesji w trakcie pracy (`401` ma pokazać logowanie i nie zgubić kolejki zakupów), komunikatu o blokadzie ani wyłączonego konta | Trzy scenariusze w `auth.spec.ts`; sesję unieważnia `actor.api` albo CLI na osobnym koncie |
| T5 | Migracje nie są sprawdzane na istniejących danych | Każdy test startuje od pustej bazy. Skrypt aktualizacji robi kopię przed aktualizacją, ale nową wersję uruchamia od razu na bazie produkcyjnej, a po nieudanym starcie nie wraca do poprzedniej | W skrypt aktualizacji po buildzie, a przed restartem: `cli backup verify` nowym kodem na świeżej kopii (odtwarza ją obok i wykonuje migracje). Błąd przerywa aktualizację, zanim stara wersja zostanie zatrzymana |
| T6 | CI nie zapisuje śladów Playwright | Błąd widoczny tylko w CI trudno odtworzyć; jedna ponowna próba może ukrywać niestabilny test | `actions/upload-artifact` z `e2e/test-results` po błędzie; reporter, który wypisuje testy zaliczone dopiero za drugim razem |
| T7 | Tryb demo nie ma testu e2e | Regresja wejścia jednym przyciskiem wyjdzie dopiero przy ręcznym `npm run demo` | Po 1.0; ten sam serwer co T1 można uruchomić drugi raz z `DEMO_MODE=true` |
| T8 | Brak automatycznego sprawdzenia dostępności | Testy opierają się na rolach i etykietach, ale nic nie pilnuje kontrastu ani brakujących nazw | `@axe-core/playwright` na każdym ekranie w obu trybach, jako jeden scenariusz |

**Wykonanie T1 (13 listopada 2026):** `e2e/playwright.smoke.config.ts` i `e2e/smoke/build.spec.ts`. Serwer `e2e/src/setup/smokeServer.mjs` uruchamia `node dist/index.cjs` z `NODE_ENV=production` na porcie 3090 i jednorazowej bazie z jednym kontem, a po zakończeniu ją usuwa. Trzy scenariusze na iPhonie i Androidzie: logowanie i „Dziś” bez naruszeń CSP, przejęcie strony przez `app-sw.js` i start bez sieci z zapamiętaną osobą, nagłówki `Cache-Control` (pliki z hashem niezmienne, strona, `app-sw.js` i `theme.js` zawsze świeże). Próba z wpisanym w stronę skryptem kończy pierwszy scenariusz błędem. To miejsce na scenariusz kreatora (KONTA.md).

**Wykonanie T7 (13 listopada 2026):** ten sam `smokeServer.mjs` z `SMOKE_DEMO=true` startuje drugi raz, na porcie 3091 i z `DEMO_MODE=true`, bez konta testowego, bo dane przykładowe wgrywa sam serwer. Scenariusze w `e2e/smoke/demo.spec.ts` biegną w projektach `demo-iphone` i `demo-android`: rodzic wchodzi przyciskiem i widzi baner, ekran „Cykliczne” i listę zakupów z danych przykładowych; dziecko wchodzi przyciskiem i nie ma ekranów rodzica; hasło demo działa w zwykłym formularzu; `POST /api/demo/login` odrzuca konto spoza listy demo (`404`), a `X-Robots-Tag` i `robots.txt` blokują indeksowanie. Zwykły test dymny sprawdza odwrotność: bez trybu demo ekran logowania nie pokazuje wyboru kont. Próba z wyłączonym `DEMO_MODE` na serwerze demo kończy wszystkie cztery scenariusze błędem.

**Wykonanie T5 (13 listopada 2026):** po buildzie, a przed restartem skrypt aktualizacji uruchamia `cli backup verify` nowym kodem na kopii zrobionej chwilę wcześniej. Błąd migracji przerywa aktualizację: stara wersja działa dalej, kod na dysku wraca do poprzedniego commita (żeby ewentualny restart procesu podniósł starą wersję), a automatyczna aktualizacja nie ponawia tego commita. Sprawdzone lokalnie: kopia z celowo zepsutym stanem migracji kończy `backup verify` kodem 1.

**Zostaje ręczne:** instalacja na ekranie głównym i prawdziwy push na iPhonie i Androidzie. Emulacja telefonu w Playwright tego nie zastąpi.

Testy kont w aplikacji (trasy zaproszeń, scenariusze e2e, kreator na serwerze z pustą bazą) opisuje [KONTA.md](../plany/KONTA.md), rozdział „Testy”.

## 7. Proponowana kolejność

1. **Sprawdzenia na produkcji** z rozdziału 8. Bez zmian w kodzie, a wynik decyduje o wadze B2 i kształcie B1.
2. **Jeden PR z utwardzeniem:** B2 (nasłuch), B6 (limit żądania), B5 (nagłówki), B8 (postać błędów), `X-Forwarded-Host` w nginx z B3. Bez zmian schematu bazy.
3. **Dziennik logowań i nowa blokada:** B4 i B1 razem, bo nowa blokada ma zostawiać ślad. Pierwsza migracja z tego dokumentu (`auth_events`).
4. **CI:** `npm audit`, Dependabot dla akcji i Dockera, ślady Playwright (T6), test przekrojowy tras bez sesji.
5. **Test dymny na zbudowanej aplikacji** (T1) i sprawdzenie migracji na kopii w skrypcie aktualizacji (T5).
6. **Konta w aplikacji** ([KONTA.md](../plany/KONTA.md)), w trzech krokach: najpierw zmiana własnego hasła i „wyloguj wszędzie”, potem zaproszenia z sekcją „Rodzina”, na końcu kreator pierwszego uruchomienia. Kreator jest ostatni, bo produkcja rodziny ma już konta i nic na nim nie zyskuje.
7. **Pozostałe testy** (T2, T3, T4, T7, T8) według tego, co zacznie sprawiać kłopot.

**Przed wersją 1.0:** kroki 1 do 6. Konta w aplikacji są ustalone (decyzja z 11 listopada 2026). Kroki 1 do 5 to nadal propozycja do potwierdzenia, ale konta od nich zależą: dziennik logowań (B4), limit rozmiaru żądania (B6) i nowa blokada logowania (B1) chronią publiczne trasy zaproszeń i kreatora, a test dymny (T1) jest miejscem na scenariusz kreatora. Krok 7 zostaje po 1.0.

Skutek dla etapu 8: przestaje być samym okresem stabilizacji. Dwa tygodnie bez awarii warto liczyć od wdrożenia kont, bo to ostatnia duża zmiana przed 1.0.

## 8. Do sprawdzenia na produkcji

Wszystkie polecenia uruchamia się z komputera poza serwerem, chyba że opis mówi inaczej. `DOMENA` to adres sprawdzanej instalacji.

**1. Czy port API jest widoczny z internetu (B2).** Oczekiwany wynik: przekroczenie czasu albo odmowa połączenia. Odpowiedź `{"status":"ok"}` oznacza, że B2 ma wysoką wagę i idzie na początek.

```bash
curl -m 5 http://DOMENA:3001/api/health
```

**2. Czy proxy hostingu nadpisuje `X-Real-IP` (B3).** Test wysyła 22 nieudane logowania na nieistniejące konta, każde z innym podrobionym adresem. Nie blokuje nikogo z rodziny, a tylko adres, z którego jest uruchomiony, na 15 minut.

```bash
for i in $(seq 1 22); do curl -s -o /dev/null -w '%{http_code} ' -X POST -H 'Content-Type: application/json' -H "X-Real-IP: 10.9.9.$i" -d "{\"login\":\"test-$i\",\"password\":\"zle\"}" https://DOMENA/api/auth/login; done; echo
```

- Na końcu pojawia się `429`: proxy nadpisuje nagłówek, limit na IP działa.
- Same `401`: nagłówek od klienta dociera do API (albo nie dociera żaden) i limit na IP nie działa. Wtedy B3 wymaga zmiany, a B1 wariantu zapasowego.

**3. Czy proxy hostingu dodaje HSTS (B5).**

```bash
curl -sI https://DOMENA/ | grep -i strict-transport-security
```

**4. Ochrona gałęzi `main` (B9).** W ustawieniach repozytorium na GitHubie: wymagane zadania `test` i `container`, brak bezpośredniego pusha.

Wyniki warto dopisać do WDROZENIE.md w postaci ogólnej (jak zachowuje się proxy hostingu), bo opisują zachowanie hostingu, którego nie widać w kodzie. Wyniki dotyczące konkretnej instancji zostają poza repozytorium.

### Wyniki z 13 listopada 2026

| Sprawdzenie | Wynik | Wniosek |
|---|---|---|
| 1. Port API z internetu | Przekroczenie czasu | Port niewidoczny; B2 to obrona w głąb, nie pilna luka |
| 2. `X-Real-IP` od klienta | 20 × `401`, potem `429` | Proxy hostingu nadpisuje nagłówek, limit na IP działa. B1 w wariancie podstawowym (para login i adres), bez „znanego urządzenia” |
| 3. HSTS | `strict-transport-security: max-age=63072000` | Dodaje go proxy; aplikacja nie wysyła własnego |
| 4. Ochrona gałęzi `main` | Niedostępna (prywatne repozytorium, darmowy plan) | Wdrożenie chroni `promote` (tylko po zielonym CI); ochronę włączyć po publikacji |
