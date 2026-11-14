# Instalacja dla innych i publikacja repozytorium

Stan na 14 listopada 2026. Plan z [PLAN.md](../PLAN.md).

Dwa cele:

1. Aplikację ma dać się wygodnie postawić **z Dockerem albo bez niego**, na dowolnym serwerze, bez zależności od jednego dostawcy hostingu.
2. Repozytorium ma być **publiczne** i nie może zawierać danych wrażliwych ani opisu konkretnej instalacji.

## 0. Lista kontrolna

- [x] Repozytorium z czystą historią, bez danych konkretnej instalacji, z licencją MIT (14 listopada 2026)
- [x] Ogólna instrukcja wdrożenia, bez wskazywania dostawcy: [instrukcje/WDROZENIE.md](../instrukcje/WDROZENIE.md) (14 listopada 2026)
- [ ] Docker: konfiguracja przez `env_file`, proxy z HTTPS (Caddy) w compose, `HEALTHCHECK` (D1, D2, D5)
- [ ] Zwykły serwer: `deploy/systemd` z jednostką usługi i przykładem proxy; skrypt aktualizacji z kopią i migracjami na kopii (N1, N2)
- [ ] Kopia poza serwer w Dockerze, opis aktualizacji, wymagania systemu (D3, D7, N4)
- [ ] Oznaczone wydania i gotowy obraz w GHCR (D4, N3)
- [ ] Ustawienia publicznego repozytorium według rozdziału 3

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
| Obraz Docker | Budowany i uruchamiany w CI przy każdym PR |

Wymagania wspólne dla każdej instalacji (HTTPS, własna domena, jedna instancja, proxy nadpisujące adres klienta) opisuje [instrukcje/WDROZENIE.md](../instrukcje/WDROZENIE.md).

## 2. Czego brakuje

### 2.1. Docker

| Nr | Brak | Skutek | Propozycja | Rozmiar |
|---|---|---|---|---|
| D1 | `docker-compose.yml` nie ma miejsca na konfigurację | Kluczy kalendarzy i push nie da się ustawić bez edycji pliku | `env_file: .env` z przykładowym `deploy/docker/.env.example` | S |
| D2 | Brak HTTPS | Telefony nie zainstalują aplikacji ani nie dostaną push | Drugi serwis w compose: Caddy z automatycznym certyfikatem i przekazaniem adresu klienta; domena jako jedyna wymagana zmienna | S |
| D3 | W obrazie nie ma `rclone` | `BACKUP_REMOTE` w Dockerze nie zadziała; kopia zostaje tylko na wolumenie | Do decyzji: `rclone` w obrazie (większy obraz, jedna droga) albo opis kopiowania wolumenu z hosta | S |
| D4 | Brak gotowego obrazu | Każdy musi sklonować repozytorium i budować | Publikacja obrazu w GHCR z CI przy wydaniu; aktualizacja to wtedy `docker compose pull && docker compose up -d` | M |
| D5 | Brak `HEALTHCHECK` | Docker nie wie, czy aplikacja odpowiada | `HEALTHCHECK` na `/api/health` w `Dockerfile` | S |
| D7 | Aktualizacja w Dockerze nie sprawdza migracji na kopii | Błąd migracji wychodzi dopiero na prawdziwej bazie | Krótki skrypt: kopia przez CLI, nowy obraz, `backup verify` w nowym obrazie, restart, sprawdzenie `/api/health` | S |

Obraz ma około 450 MB. Da się go zmniejszyć, ale nie jest to potrzebne do działania.

### 2.2. Bez Dockera

| Nr | Brak | Propozycja | Rozmiar |
|---|---|---|---|
| N1 | Nie ma gotowej konfiguracji usługi | `deploy/systemd/`: jednostka usługi (`Restart=always`, `EnvironmentFile`, osobny użytkownik), przykładowa konfiguracja nginx albo Caddy z certyfikatem | S |
| N2 | Aktualizację trzeba przeprowadzić ręcznie, krok po kroku | `deploy/update.sh`: blokada przed równoległym uruchomieniem, kopia, wersja z `prod` albo z tagu, `npm ci`, build, `backup verify` nowym kodem, restart, sprawdzenie `/api/health`, powrót do poprzedniego commita po błędzie; polecenie restartu jako ustawienie | M |
| N3 | Aktualizacja idzie za gałęzią `prod` | Dla instalacji innych osób bezpieczniej za oznaczonymi wydaniami (tagi `v1.0.0`) | S |
| N4 | Brak listy wymagań systemu | Node 24, miejsce i pamięć na build frontu na serwerze, `rclone` tylko dla kopii poza serwerem | S |

### 2.3. Proponowany układ

```text
deploy/
  docker/     compose z proxy HTTPS, .env.example, skrypt aktualizacji
  systemd/    jednostka usługi, przykład nginx/Caddy
  update.sh   wspólna aktualizacja dla instalacji bez Dockera
```

Kolejność: D1, D2, D5 (najkrótsza droga dla kogoś z zewnątrz), potem N1 i N2, potem D3, D7, N3, N4, na końcu D4 razem z pierwszym oznaczonym wydaniem.

## 3. Publiczne repozytorium

Publiczne repozytorium zaczyna się od jednego commita z czystą historią; wcześniejsza historia nie jest publikowana. Przed upublicznieniem i zaraz po nim:

- [x] `gitleaks` na historii publicznego repozytorium: 6 trafień, wszystkie to hasła testowe, wpisane do `.gitleaksignore` (14 listopada 2026)
- [x] `SECURITY.md`: zgłoszenia przez prywatne zgłaszanie podatności na GitHubie (14 listopada 2026)
- [x] README dla czytelnika z zewnątrz: czym jest projekt, dla kogo, jak uruchomić demo lokalnie, jak zainstalować (14 listopada 2026)
- [ ] Ochrona gałęzi `main` i `prod` rulesetami z `.github/rulesets` (opis niżej); merge do `main` przesuwa `prod`, więc w publicznym repozytorium to warunek
- [ ] Ustawienia Actions: pull requesty z forków bez dostępu do sekretów i z ręczną zgodą na uruchomienie (opis niżej)
- [ ] Włączone darmowe dla publicznych repozytoriów: skan sekretów z blokadą pusha, alerty Dependabota, prywatne zgłaszanie podatności, CodeQL
- [x] Commity tylko z adresem `noreply` z GitHuba (ustawienie konta „Keep my email addresses private” i `git config user.email`); sprawdzone na całej historii (14 listopada 2026)

### Ochrona gałęzi

Na prywatnym repozytorium w darmowym planie GitHub nie udostępnia ani ochrony gałęzi, ani rulesetów, więc gotowe ustawienia czekają w `.github/rulesets` i `.github/CODEOWNERS` na upublicznienie:

| Plik | Gałąź | Zasady | Wyjątek |
|---|---|---|---|
| `main-przeglad.json` | `main` | Zmiana tylko przez PR z zatwierdzeniem właściciela kodu (`CODEOWNERS`); nowy commit unieważnia zatwierdzenie, a zatwierdzić trzeba ostatni push | Admin, tylko przy scalaniu PR |
| `main-ci.json` | `main` | Zielone `test` i `container` z GitHub Actions, zakaz force pusha i usunięcia | Brak |
| `prod.json` | `prod` | Zakaz force pusha i usunięcia | Admin, zawsze |

Decyzje:

- **Wyjątek admina tylko przy PR.** GitHub nie pozwala zatwierdzić własnego PR-a, więc bez wyjątku właściciel nie scaliłby własnych zmian. Tryb `pull_request` pozwala scalić własny PR bez zatwierdzenia (w terminalu `gh pr merge --admin`), ale nie pozwala pushować prosto na `main`. PR-y z forków i od Dependabota wymagają zatwierdzenia.
- **CI w osobnym rulesecie, bez wyjątku.** Wyjątek obejmuje cały ruleset, więc gdyby wymagane kontrole były w `main-przeglad.json`, własny PR dałoby się scalić z czerwonym CI.
- **Bez wymogu aktualnej gałęzi** (`strict_required_status_checks_policy: false`). Inaczej każdy scalony PR Dependabota wymuszałby rebase i nowy przebieg pozostałych. Połączenie zmian sprawdza CI na `main`, a `promote` przesuwa `prod` dopiero po jego zielonym wyniku.
- **`prod` przesuwa się tylko do przodu.** Zadanie `promote` pushuje tokenem Actions zawsze fast-forward, więc zakaz force pusha go nie blokuje. Ręczne cofnięcie wersji (force push na `prod`) robi admin dzięki wyjątkowi.

Włączenie zaraz po upublicznieniu, z katalogu repozytorium:

```bash
for f in .github/rulesets/*.json; do gh api -X POST 'repos/{owner}/{repo}/rulesets' --input "$f"; done
gh api -X PUT 'repos/{owner}/{repo}/actions/permissions/fork-pr-contributor-approval' -f approval_policy=all_external_contributors
```

Potem w Settings → Rules → Rulesets sprawdź, że wyjątek w `main: przegląd` i `prod: tylko do przodu` to rola „Repository admin” (identyfikator `5` w plikach), a próbny PR bez zatwierdzenia nie daje się scalić bez zaznaczenia obejścia. Po włączeniu zaktualizuj zdanie o ochronie gałęzi w `PROJEKT.md` (rozdział 9) i dopisz do `CLAUDE.md` (rozdział „Wdrożenie”), że własny PR scala się przez `gh pr merge --admin`.

Loginy typu `tata` i `mama` są w dokumentach i testach przykładami, a imiona w demo i testach są fikcyjne.

## 4. Decyzje do podjęcia

| Pytanie | Propozycja |
|---|---|
| `rclone` w obrazie Docker | Tak: jedna droga kopii poza serwer w obu wariantach instalacji |
| Gotowy obraz w GHCR | Tak, od wydania 1.0 |
| Proxy w przykładzie Dockera | Caddy, bo sam zdobywa certyfikat |

Podjęte: licencja MIT (11 listopada 2026), imiona w demo i testach są fikcyjne (11 listopada 2026), publikacja jako nowe repozytorium z czystą historią (14 listopada 2026), kanał aktualizacji: oznaczone wydania (tagi `vX.Y.Z`, wersje przed 1.0 z sufiksem `-beta`), a `prod` dla tych, którzy chcą każdą wersję po CI; pierwsze wydanie `v0.9.0-beta` bez obrazu GHCR, przed zamknięciem etapu 8 (14 listopada 2026).
