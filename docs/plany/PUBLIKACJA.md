# Instalacja dla innych i publikacja repozytorium

Stan na 18 listopada 2026. Plan z [PLAN.md](../PLAN.md).

Dwa cele:

1. Aplikację ma dać się wygodnie postawić **z Dockerem albo bez niego**, na dowolnym serwerze, bez zależności od jednego dostawcy hostingu.
2. Repozytorium ma być **publiczne** i nie może zawierać danych wrażliwych ani opisu konkretnej instalacji.

## 0. Lista kontrolna

- [x] Repozytorium z czystą historią, bez danych konkretnej instalacji, z licencją MIT (14 listopada 2026)
- [x] Ogólna instrukcja wdrożenia, bez wskazywania dostawcy: [instrukcje/WDROZENIE.md](../instrukcje/WDROZENIE.md) (14 listopada 2026)
- [x] Docker: konfiguracja przez `env_file`, gotowy zestaw z Caddy w `deploy/docker`, `HEALTHCHECK` (D1, D2, D5; 18 listopada 2026)
- [ ] Zwykły serwer: `deploy/systemd` z jednostką usługi i przykładem proxy; skrypt aktualizacji z kopią i migracjami na kopii (N1, N2)
- [ ] `rclone` w obrazie, skrypt aktualizacji w Dockerze, wymagania systemu (D3, D7, N4)
- [x] Oznaczone wydania i gotowy obraz w GHCR dla `amd64` i `arm64`, `docker-compose.yml` wskazuje tag `1` (D4, N3; 18 listopada 2026, wydanie 1.0.0)
- [x] Publiczne repozytorium z ustawieniami według rozdziału 3 (14 listopada 2026)

## 1. Co już jest

Obie drogi instalacji działają; brakuje wygody, nie możliwości. Obraz z `Dockerfile` został zbudowany i uruchomiony z wolumenem na dane (11 listopada 2026): start i migracje, front i service worker, pierwsze konto, logowanie, kopia i próba jej odtworzenia, dane po restarcie, proces jako użytkownik `node`, strefa `Europe/Warsaw`.

| Obszar | Stan |
|---|---|
| Konfiguracja | Wyłącznie zmienne środowiskowe albo plik `.env`; wartości domyślne pozwalają wystartować bez żadnej |
| Dane | Jeden plik SQLite i katalog kopii, ścieżki z `DATABASE_PATH` i `BACKUP_DIR` |
| Migracje | Wykonują się same przy starcie |
| Front | Serwowany przez ten sam proces; jedna domena, bez CORS |
| Zadania w tle | W procesie API; bez crona systemowego, kolejek i osobnych usług |
| Adres klienta za proxy | Nagłówek wybiera `CLIENT_IP_HEADER` |
| Kalendarze i push | Włączane kluczami w konfiguracji; bez nich aplikacja działa dalej |
| Pierwsze konto | Kreator pierwszego uruchomienia z kodem z logu |
| Obsługa | CLI (`dist/cli.cjs`) działa tak samo w kontenerze i poza nim |
| Obraz Docker | Budowany i uruchamiany w CI przy każdym PR, razem z zestawem z Caddy; gotowy w GHCR od 1.0.0, z `HEALTHCHECK` |

Wymagania wspólne dla każdej instalacji (HTTPS, własna domena, jedna instancja, proxy nadpisujące adres klienta) opisuje [instrukcje/WDROZENIE.md](../instrukcje/WDROZENIE.md).

## 2. Czego brakuje

### 2.1. Docker

| Nr | Brak | Skutek | Propozycja | Rozmiar |
|---|---|---|---|---|
| D1 | `docker-compose.yml` nie ma miejsca na konfigurację | Kluczy kalendarzy i push nie da się ustawić bez edycji pliku | Zrobione 18 listopada 2026: opcjonalny `.env` w obu plikach compose, wzór w `deploy/docker/.env.example` | S |
| D2 | Brak HTTPS | Telefony nie zainstalują aplikacji ani nie dostaną push | Zrobione 18 listopada 2026: `deploy/docker` z Caddy (certyfikat, `X-Real-IP`, HSTS), domena jako jedyna wymagana zmienna; CI sprawdza HTTPS i limit logowań z podrobionym adresem | S |
| D3 | W obrazie nie ma `rclone` | `BACKUP_REMOTE` w Dockerze nie zadziała; kopia zostaje tylko na wolumenie | `rclone` w obrazie (decyzja w rozdziale 4) i konfiguracja `rclone.conf` na wolumenie | S |
| D4 | Brak gotowego obrazu | Każdy musi sklonować repozytorium i budować | Zrobione 18 listopada 2026: obraz w GHCR przy wydaniu; aktualizacja to `docker compose pull && docker compose up -d` | M |
| D5 | Brak `HEALTHCHECK` | Docker nie wie, czy aplikacja odpowiada | Zrobione 18 listopada 2026: `HEALTHCHECK` na `/api/health` w `Dockerfile` (przez Node, obraz nie ma curl); Caddy czeka na zdrową aplikację | S |
| D7 | Aktualizacja w Dockerze nie sprawdza migracji na kopii | Błąd migracji wychodzi dopiero na prawdziwej bazie | Krótki skrypt: kopia przez CLI, nowy obraz, `backup verify` w nowym obrazie, restart, sprawdzenie `/api/health` | S |

Obraz ma około 450 MB. Da się go zmniejszyć, ale nie jest to potrzebne do działania.

### 2.2. Bez Dockera

| Nr | Brak | Propozycja | Rozmiar |
|---|---|---|---|
| N1 | Nie ma gotowej konfiguracji usługi | `deploy/systemd/`: jednostka usługi (`Restart=always`, `EnvironmentFile`, osobny użytkownik), przykładowa konfiguracja nginx albo Caddy z certyfikatem | S |
| N2 | Aktualizację trzeba przeprowadzić ręcznie, krok po kroku | `deploy/update.sh`: blokada przed równoległym uruchomieniem, kopia, wersja z `prod` albo z tagu, `npm ci`, build, `backup verify` nowym kodem, restart, sprawdzenie `/api/health`, powrót do poprzedniego commita po błędzie; polecenie restartu jako ustawienie | M |
| N3 | Aktualizacja idzie za gałęzią `prod` | Zrobione 14 listopada 2026: oznaczone wydania (tagi `vX.Y.Z`) obok `prod` | S |
| N4 | Brak listy wymagań systemu | Node 24, miejsce i pamięć na build frontu na serwerze, `rclone` tylko dla kopii poza serwerem | S |

### 2.3. Proponowany układ

```text
deploy/
  docker/     compose z Caddy, Caddyfile, .env.example (są); skrypt aktualizacji (D7)
  systemd/    jednostka usługi, przykład nginx/Caddy
  update.sh   wspólna aktualizacja dla instalacji bez Dockera
```

Kolejność: D1, D2, D5 i D4 są zrobione; dalej N1 i N2, potem D3, D7 i N4.

## 3. Publiczne repozytorium

Publiczne repozytorium zaczyna się od jednego commita z czystą historią; wcześniejsza historia nie jest publikowana. Przed upublicznieniem i zaraz po nim:

- [x] `gitleaks` na historii publicznego repozytorium: 6 trafień, wszystkie to hasła testowe, wpisane do `.gitleaksignore` (14 listopada 2026)
- [x] `SECURITY.md`: zgłoszenia przez prywatne zgłaszanie podatności na GitHubie (14 listopada 2026)
- [x] README dla czytelnika z zewnątrz: czym jest projekt, dla kogo, jak uruchomić demo lokalnie, jak zainstalować (14 listopada 2026)
- [x] Ochrona gałęzi `main` i `prod` rulesetami z `.github/rulesets` (opis niżej); merge do `main` przesuwa `prod`, więc w publicznym repozytorium to warunek (14 listopada 2026)
- [x] Ustawienia Actions: pull requesty z forków bez dostępu do sekretów i z ręczną zgodą na uruchomienie dla każdej osoby z zewnątrz (14 listopada 2026)
- [x] Włączone darmowe dla publicznych repozytoriów: skan sekretów z blokadą pusha, alerty i poprawki bezpieczeństwa Dependabota, prywatne zgłaszanie podatności, CodeQL w konfiguracji domyślnej (14 listopada 2026)
- [x] Commity tylko z adresem `noreply` z GitHuba (ustawienie konta „Keep my email addresses private” i `git config user.email`); sprawdzone na całej historii (14 listopada 2026)

### Ochrona gałęzi

Rulesety z `.github/rulesets` i `.github/CODEOWNERS` działają od upublicznienia (14 listopada 2026; na prywatnym repozytorium w darmowym planie GitHub ich nie udostępnia). Pliki są źródłem prawdy: zmiana zasad to PR z plikiem, a potem ta sama zmiana w ustawieniach repozytorium.

| Plik | Gałąź | Zasady | Wyjątek |
|---|---|---|---|
| `main-przeglad.json` | `main` | Zmiana tylko przez PR, scalany squashem; zatwierdzenie nie jest wymagane (od 15 listopada 2026) | Admin, tylko przy scalaniu PR |
| `main-ci.json` | `main` | Zielone `test` i `container` z GitHub Actions, zakaz force pusha i usunięcia | Brak |
| `prod.json` | `prod` | Zakaz force pusha i usunięcia | Admin, zawsze |

Decyzje:

- **Bez wymogu zatwierdzenia, z auto-merge (15 listopada 2026).** GitHub nie pozwala zatwierdzić własnego PR-a, a auto-merge nie korzysta z wyjątku admina, więc przy wymaganym zatwierdzeniu własny PR nigdy nie scaliłby się sam. Scalać może tylko właściciel (jedyna osoba z prawem zapisu), więc PR z forka albo od Dependabota i tak wchodzi wyłącznie jego decyzją; `CODEOWNERS` dalej prosi go o przegląd. Auto-merge jest włączony w ustawieniach repozytorium i włącza się go na każdym PR osobno (`gh pr merge --auto --squash`); PR scala się po zielonych `test` i `container`, czyli trafia na produkcję bez ostatniego spojrzenia. Wyjątek admina w trybie `pull_request` zostaje, ale nie pozwala pushować prosto na `main`.
- Odrzucone: zatwierdzenie wymagane od wszystkich z wyjątkiem admina (stan do 15 listopada 2026). Własne PR-y trzeba było scalać ręcznie przez `gh pr merge --admin`.
- **CI w osobnym rulesecie, bez wyjątku.** Wyjątek obejmuje cały ruleset, więc gdyby wymagane kontrole były w `main-przeglad.json`, własny PR dałoby się scalić z czerwonym CI.
- **Bez wymogu aktualnej gałęzi** (`strict_required_status_checks_policy: false`). Inaczej każdy scalony PR Dependabota wymuszałby rebase i nowy przebieg pozostałych. Połączenie zmian sprawdza CI na `main`, a `promote` przesuwa `prod` dopiero po jego zielonym wyniku.
- **`prod` przesuwa się tylko do przodu.** Zadanie `promote` pushuje tokenem Actions zawsze fast-forward, więc zakaz force pusha go nie blokuje. Ręczne cofnięcie wersji (force push na `prod`) robi admin dzięki wyjątkowi.

Odtworzenie ustawień (na przykład po usunięciu rulesetów), z katalogu repozytorium:

```bash
for f in .github/rulesets/*.json; do gh api -X POST 'repos/{owner}/{repo}/rulesets' --input "$f"; done
gh api -X PUT 'repos/{owner}/{repo}/actions/permissions/fork-pr-contributor-approval' -f approval_policy=all_external_contributors
gh api -X PATCH 'repos/{owner}/{repo}' -F allow_auto_merge=true
```

Sprawdzone po włączeniu: wyjątek w `main: przegląd` i `prod: tylko do przodu` to rola admina (identyfikator `5`; API pokazuje adminowi `current_user_can_bypass` jako `pull_requests_only` i `always`, a dla `main: CI i historia` jako `never`), a próbny PR bez zatwierdzenia nie dał się scalić bez obejścia. Od 15 listopada 2026 zatwierdzenie nie jest wymagane (decyzje wyżej).

Loginy typu `tata` i `mama` są w dokumentach i testach przykładami, a imiona w demo i testach są fikcyjne.

## 4. Decyzje do podjęcia

Otwartych decyzji nie ma.

Podjęte: licencja MIT (11 listopada 2026), imiona w demo i testach są fikcyjne (11 listopada 2026), publikacja jako nowe repozytorium z czystą historią (14 listopada 2026), kanał aktualizacji: oznaczone wydania (tagi `vX.Y.Z`, wersje przed 1.0 z sufiksem `-beta`), a `prod` dla tych, którzy chcą każdą wersję po CI; pierwsze wydanie `v0.9.0-beta` bez obrazu GHCR, przed zamknięciem etapu 8 (14 listopada 2026), gotowy obraz w GHCR od wydania 1.0.0, dla `amd64` i `arm64`, a `docker-compose.yml` wskazuje tag `1` z możliwością budowy z klonu przez `--build` (18 listopada 2026), proxy w przykładzie Dockera to Caddy, bo sam zdobywa certyfikat, a `docker-compose.yml` w katalogu głównym zostaje dla instalacji z własnym proxy (18 listopada 2026), `rclone` trafi do obrazu, żeby kopia poza serwer miała jedną drogę w obu wariantach instalacji (18 listopada 2026).
