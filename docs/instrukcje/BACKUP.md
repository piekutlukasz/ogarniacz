# Kopie zapasowe

Baza Ogarniacza to jeden plik SQLite. Chroni go kopia na dwóch poziomach:

| Gdzie | Kiedy | Jak długo | Po co |
|---|---|---|---|
| Serwer, katalog `backups` obok bazy | Co noc o 3:30 czasu polskiego | 14 dni | Szybkie cofnięcie błędu |
| Google Drive, zaszyfrowany katalog | Zaraz po kopii na serwerze | 60 dni | Utrata serwera albo konta u dostawcy hostingu |

Kopia powstaje przez backupowe API SQLite, więc jest spójna nawet wtedy, gdy serwer akurat zapisuje. Przed zapisaniem przechodzi `PRAGMA integrity_check`.

Wysyłkę na Google Drive robi [rclone](https://rclone.org) przez szyfrowany katalog (`crypt`). Google widzi tylko zaszyfrowane pliki o losowych nazwach. rclone ma dostęp wyłącznie do plików, które sam utworzył (zakres `drive.file`), a nie do reszty Dysku.

> **Hasła szyfrowania zapisz w menedżerze haseł.** Bez nich kopii z Google Drive nie da się odczytać, także w razie utraty serwera.

## Konfiguracja na serwerze

Polecenia uruchamiasz na serwerze przez SSH, chyba że opis mówi inaczej. Przykłady zakładają bash na serwerze (Linux) i zsh na Macu, dlatego polecenia `read` wyglądają w obu miejscach inaczej. Konfigurację robisz raz, a rclone trzyma ją w `~/.config/rclone/rclone.conf`, czyli w trwałym katalogu domowym.

### 1. Instalacja rclone

Oficjalna paczka do `~/.local/bin`, ze sprawdzeniem sumy SHA-256:

```bash
command -v unzip >/dev/null || sudo apt-get install -y unzip
cd /tmp && V=$(curl -fsSL https://downloads.rclone.org/version.txt | awk '{print $2}') && curl -fsSLO "https://downloads.rclone.org/$V/rclone-$V-linux-amd64.zip" && curl -fsSL "https://downloads.rclone.org/$V/SHA256SUMS" | grep " rclone-$V-linux-amd64.zip$" | sha256sum -c - && unzip -q "rclone-$V-linux-amd64.zip" && mkdir -p ~/.local/bin && install -m 755 "rclone-$V-linux-amd64/rclone" ~/.local/bin/ && rm -rf "rclone-$V-linux-amd64"* && cd ~ && ~/.local/bin/rclone version | head -1
```

### 2. Własny klient Google, w przeglądarce

rclone wycofuje w 2026 roku swój wspólny identyfikator klienta Google Drive, więc potrzebny jest własny. Robisz to raz, w [Google Cloud Console](https://console.cloud.google.com/), na koncie Google, na którym mają leżeć kopie:

1. Utwórz projekt, np. „Ogarniacz backup”.
2. **APIs & Services → Library**: wyszukaj **Google Drive API** i kliknij **Enable**.
3. **Google Auth Platform → Branding**: nazwa aplikacji (np. „Ogarniacz backup”) i Twój e-mail kontaktowy.
4. **Audience**: typ **External**, potem **Publish app**, żeby status był **In production**. W trybie testowym Google unieważnia dostęp po 7 dniach i nocna wysyłka by przestała działać. Zakres `drive.file` nie wymaga weryfikacji aplikacji przez Google.
5. **Data access → Add or remove scopes**: zaznacz `.../auth/drive.file` i zapisz.
6. **Clients → Create client**: typ **Desktop app**, dowolna nazwa. Zapisz **Client ID** i **Client secret** w menedżerze haseł.

Przy logowaniu w kroku 3 Google może pokazać ostrzeżenie o niezweryfikowanej aplikacji. To Twoja własna aplikacja, więc wybierz **Advanced → Go to Ogarniacz backup**.

### 3. Zgoda Google, na Macu

Serwer nie ma przeglądarki, więc zgodę dajesz na Macu (rclone: `brew install rclone`). Polecenie zapyta o Client ID i Client secret z kroku 2:

```bash
read -r "CID?Client ID: " && read -rs "CSEC?Client secret: " && echo && rclone authorize "drive" "$(printf '{"client_id":"%s","client_secret":"%s","scope":"drive.file"}' "$CID" "$CSEC" | base64 | tr -d '=\n')"; unset CSEC
```

Otworzy się przeglądarka: zaloguj się na to samo konto Google i zatwierdź dostęp. W terminalu pojawi się token między liniami `--->` i `<---End paste`. Skopiuj go w całości, razem z nawiasami `{}`.

### 4. Połączenie z Google Drive, na serwerze

Polecenie zapyta o Client ID, Client secret i token z Maca. Nic z tego nie trafi do historii powłoki:

```bash
read -rp "Client ID: " CID && read -rsp "Client secret: " CSEC && echo && read -rsp "Token z Maca: " TOKEN && echo && ~/.local/bin/rclone config create gdrive drive client_id="$CID" client_secret="$CSEC" scope=drive.file token="$TOKEN" config_refresh_token=false config_change_team_drive=false --non-interactive >/dev/null && unset CSEC TOKEN && ~/.local/bin/rclone lsd gdrive: && echo "Połączenie z Google Drive działa"
```

### 5. Zaszyfrowany katalog na kopie

Polecenie generuje dwa losowe hasła, tworzy szyfrowany katalog `Ogarniacz-backup` na Dysku i **wyświetla hasła jeden raz**. Zapisz oba w menedżerze haseł, zanim zamkniesz terminal:

```bash
P1=$(openssl rand -base64 32) && P2=$(openssl rand -base64 32) && ~/.local/bin/rclone config create ogarniacz-backup crypt remote=gdrive:Ogarniacz-backup password="$(~/.local/bin/rclone obscure "$P1")" password2="$(~/.local/bin/rclone obscure "$P2")" >/dev/null && chmod 600 ~/.config/rclone/rclone.conf && printf '\nZAPISZ W MENEDŻERZE HASEŁ (Ogarniacz, kopie zapasowe):\n  password:  %s\n  password2: %s\n\n' "$P1" "$P2" && unset P1 P2
```

### 6. Ustawienia aplikacji

W ustawieniach aplikacji ([WDROZENIE.md](WDROZENIE.md), „Ustawienia”) dopisz cel kopii i pełną ścieżkę do rclone z kroku 1 (`echo ~/.local/bin/rclone` ją pokaże):

```bash
BACKUP_REMOTE=ogarniacz-backup:
RCLONE_PATH=/home/UŻYTKOWNIK/.local/bin/rclone
```

Obraz Docker nie zawiera rclone. W Dockerze kopię poza serwer robi się z hosta, z katalogu kopii na wolumenie.

Opcjonalnie `BACKUP_REMOTE_KEEP_DAYS` zmienia czas przechowywania na Dysku (domyślnie 60 dni).

### 7. Sprawdzenie

Ręczna kopia i wysyłka, potem lista plików w szyfrowanym katalogu:

```bash
node dist/cli.cjs backup && ~/.local/bin/rclone ls ogarniacz-backup:
```

Na Dysku Google, w katalogu `Ogarniacz-backup`, powinny być pliki o nieczytelnych nazwach.

## Odtworzenie z Google Drive

Gdy serwer działa, ale trzeba cofnąć zmiany, wystarczy kopia lokalna (`node dist/cli.cjs backup list`). Kopia z Dysku jest potrzebna, gdy lokalne kopie zniknęły.

Na nowym serwerze najpierw odtwórz konfigurację rclone: krok 1, kroki 3–4 z Client ID i Client secret z menedżera haseł, a zamiast kroku 5 szyfrowany katalog z **tymi samymi hasłami**:

```bash
read -rsp "password: " P1; echo; read -rsp "password2: " P2; echo; ~/.local/bin/rclone config create ogarniacz-backup crypt remote=gdrive:Ogarniacz-backup password="$(~/.local/bin/rclone obscure "$P1")" password2="$(~/.local/bin/rclone obscure "$P2")" >/dev/null && unset P1 P2 && ~/.local/bin/rclone ls ogarniacz-backup:
```

Potem zatrzymaj aplikację, pobierz wybraną kopię i odtwórz bazę:

```bash
mkdir -p ~/restore && ~/.local/bin/rclone copy ogarniacz-backup:ogarniacz-2026-11-10.db ~/restore/
```

```bash
node dist/cli.cjs restore ~/restore/ogarniacz-2026-11-10.db --yes
```

Poprzednia baza zostaje obok z dopiskiem `.before-restore-<czas>`. Po odtworzeniu uruchom aplikację i zaloguj się, żeby sprawdzić dane.

Przy kalendarzach (etap 6) zadbaj jeszcze o `CALENDAR_ENCRYPTION_KEY` z ustawień aplikacji. Kopia zawiera linki do kalendarzy tylko w postaci zaszyfrowanej, a klucz jest poza kopią, więc **zapisz go w menedżerze haseł** razem z hasłami rclone. Na nowym serwerze ustaw ten sam klucz przed uruchomieniem. Bez niego kalendarze pokażą błąd „nie mogę odczytać zapisanego linku” i trzeba dodać je ponownie; pozostałe dane nie są dotknięte. Opis: [KALENDARZE.md](KALENDARZE.md), rozdział 10.

## Kontrola

- Logi serwera pokazują co noc `[backup] zapisano` i `[backup] wysłano kopie`. Błąd zaczyna się od `[backup] BŁĄD`.
- Raz w miesiącu sprawdź, czy na Dysku jest kopia z ostatniej nocy (`~/.local/bin/rclone ls ogarniacz-backup:`), i zrób próbę odtworzenia: `node dist/cli.cjs backup verify`.
- Token Google odnawia się sam, dopóki rclone go używa. Jeśli wysyłka zacznie zgłaszać błąd autoryzacji, sprawdź, czy aplikacja w Google Cloud ma status In production, i powtórz kroki 3 i 4.
