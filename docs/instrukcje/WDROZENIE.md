# Wdrożenie i utrzymanie

Ogarniacz to jeden proces Node.js z bazą SQLite w pliku. Da się go uruchomić w Dockerze albo bezpośrednio na Node.js 24, na dowolnym serwerze z HTTPS. `DOMENA` oznacza niżej adres Twojej instalacji. Adres, klucze i inne dane konkretnej instancji trzymaj poza repozytorium.

## Wymagania każdej instalacji

- **HTTPS.** Wymagają go instalacja PWA, powiadomienia push i cookie sesji z flagą `Secure` (domyślną przy `NODE_ENV=production`). Sam serwer po `http` wystarczy do obejrzenia aplikacji na komputerze, ale nie do używania na telefonach.
- **Własna domena albo subdomena.** Aplikacja działa w korzeniu adresu (`/api`, zakres service workera, `start_url`). Instalacja pod ścieżką, np. `/ogarniacz/`, nie jest obsługiwana.
- **Jedna instancja.** Harmonogram i limit prób logowania żyją w pamięci procesu, więc aplikacji nie wolno uruchamiać w kilku kopiach naraz.
- **Proxy przed aplikacją** kończy TLS i przekazuje adres klienta w nagłówku z `CLIENT_IP_HEADER` (domyślnie `X-Real-IP`). Proxy musi ten nagłówek **nadpisać**, a nie przepuścić wartość od klienta, bo inaczej limit prób logowania na adres da się obejść. Jeśli przed Twoim proxy stoi jeszcze jedno (np. u dostawcy hostingu), sprawdź, które z nich zna prawdziwy adres.
- **HSTS** ustawia ten, kto kończy TLS. Aplikacja go nie wysyła.
- **Założenia wpisane w kod:** język polski, strefa `Europe/Warsaw`, kwoty w złotych.

API nasłuchuje domyślnie tylko na `127.0.0.1` (zmienna `HOST`), więc do aplikacji da się dojść wyłącznie przez proxy. Poza Dockerem nie ustawiaj `HOST=0.0.0.0`: nagłówki z adresem klienta i hosta przestałyby być wiarygodne. Nagłówki bezpieczeństwa (CSP i pozostałe) ustawia sama aplikacja, a proxy tylko je przekazuje.

## Ustawienia

Wszystkie ustawienia to zmienne środowiskowe. Pełna lista z opisem jest w [`apps/api/.env.example`](../../apps/api/.env.example), a źródłem prawdy jest `apps/api/src/config.ts`. Bez żadnej zmiennej aplikacja startuje; kalendarze, powiadomienia i kopia poza serwerem włączają się dopiero po ustawieniu swoich kluczy.

| Zmienna | Po co |
|---|---|
| `NODE_ENV=production` | Cookie tylko przez HTTPS i tryb produkcyjny |
| `DATABASE_PATH`, `BACKUP_DIR` | Plik bazy i katalog kopii; trzymaj je poza katalogiem z kodem |
| `CLIENT_IP_HEADER` | Nagłówek z adresem klienta, który ustawia Twoje proxy |
| `BACKUP_REMOTE`, `RCLONE_PATH` | Kopia poza serwerem, opis w [BACKUP.md](BACKUP.md) |
| `CALENDAR_ENCRYPTION_KEY` | Kalendarze ICS, opis w [KALENDARZE.md](KALENDARZE.md), rozdział 10 |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Powiadomienia push (niżej) |

Klucz kalendarzy i klucze VAPID zapisz w menedżerze haseł: nie ma ich w kopii bazy, a ich utrata albo zmiana wyłącza odpowiednio kalendarze i subskrypcje powiadomień.

## Droga 1: Docker

Obraz działa jako użytkownik `node`, trzyma bazę i kopie na wolumenie `/data`, a migracje wykonuje sam przy starcie. Gotowy obraz dla `linux/amd64` i `linux/arm64` jest w GHCR (`ghcr.io/piekutlukasz/ogarniacz`), publikowany przy każdym wydaniu. Oba pliki compose wskazują tag `1`, czyli ostatnie wydanie 1.x; konkretną wersję daje tag pełny, np. `1.0.0`. `HEALTHCHECK` obrazu co 30 sekund sprawdza `/api/health`, a `docker ps` pokazuje wynik (`healthy`). Wymagany Docker Compose 2.24 lub nowszy.

Ustawienia z tabeli wyżej wpisz do pliku `.env` obok pliku compose; wzór z opisem to [`deploy/docker/.env.example`](../../deploy/docker/.env.example). Bez pliku aplikacja startuje z wartościami domyślnymi. Trzymaj go poza repozytorium (`chmod 600 .env`).

**Wariant A: gotowy zestaw z HTTPS** ([`deploy/docker`](../../deploy/docker)). Aplikacja i Caddy, który sam zdobywa i odnawia certyfikat Let's Encrypt, nadpisuje `X-Real-IP` adresem klienta i ustawia HSTS. Wystarczą trzy pliki z tego katalogu, bez klonowania repozytorium: `docker-compose.yml`, `Caddyfile` i `.env.example`.

```bash
cp .env.example .env    # wpisz DOMAIN
docker compose up -d
```

Wcześniej rekord DNS domeny musi wskazywać na serwer, a porty 80 i 443 (także 443/udp dla HTTP/3) muszą być otwarte; aplikacja nie wystawia żadnego portu, dostaje ją tylko Caddy. Docker zachowuje adres klienta dla ruchu IPv4. Dla IPv6 bez włączonego IPv6 w Dockerze kontener widzi adres bramy sieci, więc limit prób logowania liczy wtedy wszystkich klientów IPv6 razem. Sprawdzenie, że podrobiony nagłówek nie omija limitu, jest w CI (zadanie `container`).

**Wariant B: własne proxy** (`docker-compose.yml` w katalogu głównym repozytorium). Aplikacja na `127.0.0.1:3000`, dla nginx albo innego proxy na tym samym serwerze, skonfigurowanego jak w rozdziale „Proxy z HTTPS”. Plik `.env` leży wtedy w katalogu głównym klonu.

```bash
docker compose pull
docker compose up -d
```

Obraz z własnego klonu repozytorium, np. z gałęzi `prod`, buduje `docker compose up -d --build`.

Konta i kopie obsługuje CLI w kontenerze:

```bash
docker compose exec ogarniacz node dist/cli.cjs user list
```

## Droga 2: Node.js bez Dockera

Wymagany Node.js 24. Build frontu potrzebuje na serwerze kilkuset MB pamięci.

```bash
git clone <adres repozytorium> ogarniacz && cd ogarniacz
npm ci --include=dev && npm run build
cp apps/api/.env.example apps/api/.env && chmod 600 apps/api/.env
npm start
```

`npm start` uruchamia `node dist/index.cjs` w `apps/api` i czyta ustawienia z `apps/api/.env`. Proces powinien pilnować menedżer usług (np. systemd z `Restart=always`), żeby aplikacja wstawała po awarii i po restarcie serwera. CLI do kont i kopii:

```bash
cd apps/api && node dist/cli.cjs user list
```

## Proxy z HTTPS

W wariancie A dla Dockera proxy jest już skonfigurowane (`deploy/docker/Caddyfile`). Przykład dla nginx, który sam kończy TLS (certyfikat np. z Let's Encrypt):

```nginx
server {
    listen 443 ssl;
    server_name DOMENA;
    # ssl_certificate i ssl_certificate_key według Twojej konfiguracji certyfikatu

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        # Nadpisane, żeby wartość od klienta nie docierała do API (ochrona przed CSRF porównuje go z Origin).
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 1m;
    }
}
```

Gdy przed nginx stoi jeszcze proxy dostawcy, które samo nadpisuje `X-Real-IP` prawdziwym adresem, przekaż jego wartość (`$http_x_real_ip`) zamiast `$remote_addr`. Sprawdź to testem z [archiwum/UTWARDZENIE-PRZEGLAD.md](../archiwum/UTWARDZENIE-PRZEGLAD.md), rozdział 8: kilkanaście nieudanych logowań z podrobionym nagłówkiem musi skończyć się blokadą (`429`).

## Pierwsze konto

Pierwszy start z pustą bazą wypisuje w logu aplikacji jednorazowy kod (w Dockerze: `docker compose logs ogarniacz`):

```
[start] pusta baza, kod pierwszego uruchomienia: K7M2-9QXD
```

Otwórz adres aplikacji na telefonie. Zamiast logowania pojawi się kreator pierwszego uruchomienia: wpisz imię, login, hasło i ten kod. Kreator zakłada konto rodzica, loguje je i otwiera w ustawieniach „Rodzinę”, w której zaprosisz pozostałe osoby linkiem albo kodem QR. Login to małe litery bez polskich znaków, cyfry, kropka albo myślnik; hasło ma co najmniej 8 znaków i nie zawiera loginu ani imienia.

Kod zmienia się przy każdym starcie, także po automatycznym restarcie, więc ważny jest ten z ostatniego wpisu w logu. Wygasa po założeniu konta albo po 20 złych próbach (wtedy uruchom aplikację ponownie i przepisz nowy). Kreator działa tylko, dopóki w bazie nie ma żadnego konta.

**Droga zapasowa** (np. gdy log jest niedostępny albo trzeba odzyskać konto bez działającej aplikacji) to CLI, z hasłem wpisywanym bez wyświetlania:

```bash
node dist/cli.cjs user add --login tata --name Tata --role parent
```

Zaproszenie: **Ustawienia → Rodzina → Zaproś osobę** (imię, login, rola i hasło rodzica). Link i kod QR są jednorazowe i ważne 24 godziny, a zapraszana osoba otwiera link na swoim telefonie i sama ustawia hasło.

## Telefony

Na iPhonie (Safari): otwórz adres, zaloguj się, a potem **Udostępnij → Do ekranu początkowego** i zaloguj się jeszcze raz w aplikacji z ikony. Na iPhonie zainstalowana aplikacja ma dane oddzielne od Safari. Na Androidzie (Chrome): menu → **Zainstaluj aplikację**.

## Powiadomienia

Wygeneruj klucze VAPID na swoim komputerze (`npm run vapid -w @ogarniacz/api`) i ustaw trzy zmienne: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` i `VAPID_SUBJECT=mailto:twój@adres`. Klucze muszą być stałe: ich zmiana unieważnia subskrypcje na wszystkich telefonach i każdy musi włączyć powiadomienia od nowa. Bez kompletu trzech zmiennych aplikacja działa, w logu jest ostrzeżenie `[push] ... powiadomienia wyłączone`, a pozycji „Powiadomienia” nie ma w menu ustawień.

Próba na telefonach: dodaj aplikację do ekranu głównego, zaloguj się w niej, włącz powiadomienia w ustawieniach i użyj „Wyślij testowe powiadomienie”; potem zablokuj telefon i ustaw podsumowanie na najbliższą godzinę.

## Kopie i próba odtworzenia

Aplikacja robi kopię bazy każdej nocy i trzyma ją przez 14 dni. Kopię poza serwerem, zaszyfrowaną na Google Drive, opisuje [BACKUP.md](BACKUP.md).

Próba odtworzenia działa na kopii, bez zatrzymywania aplikacji: odtwarza najnowszą kopię w katalogu tymczasowym, pokazuje z niej konta i liczbę zadań, a potem ją usuwa. Warto ją powtarzać raz w miesiącu, także na kopii pobranej z Dysku (`backup verify <plik>`):

```bash
node dist/cli.cjs backup verify
```

## Monitoring dostępności

Ustaw dowolną usługę, która co kilka minut sprawdza `https://DOMENA/api/health` i powiadamia Cię, gdy adres nie odpowiada. `/api/health` jest publiczny i nie zdradza żadnych danych.

## Aktualizacja

Są dwa kanały aktualizacji. Oznaczone wydania (tagi `vX.Y.Z`, [lista wydań](https://github.com/piekutlukasz/ogarniacz/releases)) zmieniają się rzadziej i mają opis zmian; w Dockerze to gotowy obraz z GHCR. Gałąź `prod` wskazuje ostatni commit z `main`, który przeszedł całe CI (zadanie `promote` w `.github/workflows/ci.yml`), więc daje każdą sprawdzoną zmianę od razu. Bez Dockera w kroku 2 niżej zamiast `prod` można wskazać tag: `git fetch --tags origin && git checkout v1.0.0`.

Bezpieczna aktualizacja bez Dockera, w tej kolejności:

1. Kopia bazy: `node dist/cli.cjs backup` w `apps/api`.
2. Nowa wersja: `git fetch origin prod && git checkout -B prod origin/prod`.
3. Zależności i build: `npm ci --include=dev && npm run build`. `--include=dev` jest potrzebne, bo przy `NODE_ENV=production` npm pominąłby narzędzia builda.
4. Migracje nowej wersji na kopii, a nie na prawdziwej bazie: `node dist/cli.cjs backup verify` w `apps/api`. Błąd oznacza powrót do poprzedniego commita i ponowny build, bez restartu; stara wersja działa dalej.
5. Restart procesu i sprawdzenie `curl -fsS http://127.0.0.1:3000/api/health`.

Migracje wykonują się same przy starcie. Tylko dodają kolumny i tabele, więc starsza wersja działa na nowszej bazie, a powrót do poprzedniej wersji to te same kroki z wybranym commitem.

W Dockerze: kopia przez CLI w kontenerze, potem `docker compose pull && docker compose up -d` (gotowy obraz) albo `git pull && docker compose up -d --build` (obraz z klonu).

Jeśli nowa wersja psuje dane, zatrzymaj aplikację i odtwórz kopię zrobioną przed aktualizacją:

```bash
node dist/cli.cjs backup list
node dist/cli.cjs restore <ścieżka do kopii> --yes
```

## Codzienna obsługa

Polecenia CLI uruchamiaj w `apps/api` (bez Dockera) albo przez `docker compose exec ogarniacz` (w Dockerze).

| Potrzeba | Polecenie |
|---|---|
| Czy działa | `curl -s 127.0.0.1:3000/api/health` |
| Nowe hasło (wylogowuje urządzenia tej osoby) | `node dist/cli.cjs user passwd <login>` |
| Wyłączenie konta (także rodzica) | `node dist/cli.cjs user disable <login>` |
| Dziennik logowań (próby, blokady, zmiany kont) | `node dist/cli.cjs user log --limit 50` |
| Lista kopii | `node dist/cli.cjs backup list` |
| Próba odtworzenia najnowszej kopii | `node dist/cli.cjs backup verify` |

Nowa osoba, zapomniane hasło, wyłączenie konta dziecka i dziennik logowań są też w aplikacji, dla rodzica: **Ustawienia → Rodzina**. Zgubiony telefon: jego właściciel wybiera na innym urządzeniu **Ustawienia → Hasło i urządzenia → Wyloguj inne urządzenia**, a gdy nie ma innego urządzenia, rodzic wystawia mu link do nowego hasła, którego użycie wylogowuje tę osobę wszędzie. CLI zostaje na sytuacje awaryjne: żaden rodzic nie ma dostępu albo konto rodzica trzeba wyłączyć.
