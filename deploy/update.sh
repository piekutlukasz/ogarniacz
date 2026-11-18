#!/usr/bin/env bash
# Aktualizacja instalacji bez Dockera, z próbą migracji na kopii, zanim nowa wersja dotknie prawdziwej bazy.
# Uruchom jako użytkownik, do którego należy klon (np. sudo -u ogarniacz), z dowolnego katalogu:
#   deploy/update.sh            gałąź prod: każdy commit z main po zielonym CI
#   deploy/update.sh v1.2.0     wybrane oznaczone wydanie (także powrót do starszego)
# Kroki: kopia bazy, nowa wersja, npm ci i build, `backup verify` nowym kodem, restart, sprawdzenie /api/health.
# Błąd przed restartem przywraca poprzedni commit i build, a stara wersja działa dalej; błąd po restarcie
# przywraca poprzednią wersję i restartuje ją. Opis: docs/instrukcje/WDROZENIE.md, „Aktualizacja”.
#
# Ustawienia (zmienne środowiskowe):
#   RESTART_CMD   polecenie restartu, domyślnie `sudo systemctl restart ogarniacz`
#   HEALTH_URL    domyślnie http://127.0.0.1:3000/api/health
#   HEALTH_TRIES  liczba prób co 2 s po restarcie, domyślnie 30
set -euo pipefail

TARGET=${1:-prod}
RESTART_CMD=${RESTART_CMD:-sudo systemctl restart ogarniacz}
HEALTH_URL=${HEALTH_URL:-http://127.0.0.1:3000/api/health}
HEALTH_TRIES=${HEALTH_TRIES:-30}

REPO=$(cd "$(dirname "$0")/.." && pwd)
cd "$REPO"

log() { printf '[update] %s\n' "$*"; }
fail() { printf '[update] BŁĄD: %s\n' "$*" >&2; exit 1; }
cli() { (cd apps/api && node dist/cli.cjs "$@"); }

# Blokada przed równoległym uruchomieniem (mkdir jest atomowe także bez flock); w .git, żeby nie brudzić klonu.
LOCK=.git/ogarniacz-update.lock
mkdir "$LOCK" 2>/dev/null || fail "aktualizacja już trwa (usuń katalog $LOCK, jeśli to pozostałość po przerwanym przebiegu)"
trap 'rmdir "$LOCK"' EXIT

git diff --quiet HEAD || fail "klon ma lokalne zmiany w plikach z repozytorium; aktualizacja by je nadpisała"

build() {
  # --include=dev: przy NODE_ENV=production npm pominąłby narzędzia builda.
  npm ci --include=dev --no-audit --no-fund && npm run build
}

restart_and_check() {
  log "restart: $RESTART_CMD"
  bash -c "$RESTART_CMD"
  for _ in $(seq 1 "$HEALTH_TRIES"); do
    curl -fsS -o /dev/null "$HEALTH_URL" 2>/dev/null && return 0
    sleep 2
  done
  return 1
}

old=$(git rev-parse HEAD)

# Powrót do commita sprzed aktualizacji, z buildem; restart tylko, gdy nowa wersja już działała.
rollback() {
  local reason=$1 restart=${2:-}
  log "powrót do ${old:0:12}"
  git checkout -q --detach "$old"
  build || fail "$reason; build poprzedniej wersji też się nie udał, sprawdź ręcznie przed restartem"
  if [ -n "$restart" ]; then
    restart_and_check || fail "$reason; poprzednia wersja też nie odpowiada, sprawdź logi usługi"
    fail "$reason; działa poprzednia wersja (${old:0:12})"
  fi
  fail "$reason; aplikacja działa bez zmian (${old:0:12})"
}

log "kopia bazy"
cli backup

log "pobieranie: $TARGET"
git fetch -q --tags origin
if [ "$TARGET" = prod ]; then
  git checkout -q -B prod origin/prod
elif git rev-parse -q --verify "refs/tags/$TARGET^{commit}" >/dev/null; then
  git checkout -q --detach "refs/tags/$TARGET"
else
  fail "nie ma gałęzi ani tagu $TARGET (wydania: git tag -l 'v*')"
fi
new=$(git rev-parse HEAD)
if [ "$new" = "$old" ]; then
  log "wersja bez zmian (${new:0:12}), nic do zrobienia"
  exit 0
fi
log "zmiana ${old:0:12} -> ${new:0:12}"

log "zależności i build"
build || rollback "build nowej wersji się nie udał"

# Nowy kod odtwarza najnowszą kopię w katalogu tymczasowym i wykonuje na niej swoje migracje.
log "migracje nowej wersji na kopii (backup verify)"
cli backup verify || rollback "nowa wersja nie przeszła próby na kopii"

restart_and_check || rollback "nowa wersja nie odpowiada na $HEALTH_URL" restart
log "gotowe: działa ${new:0:12}"
