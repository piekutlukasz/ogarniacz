#!/usr/bin/env bash
# Aktualizacja instalacji w Dockerze z próbą migracji na kopii, zanim nowa wersja dotknie prawdziwej bazy.
# Uruchom w katalogu z docker-compose.yml (deploy/docker albo katalog główny klonu):
#   ./update.sh            gotowy obraz z GHCR (docker compose pull)
#   ./update.sh --build    obraz z klonu repozytorium (docker compose build), np. po git pull
# Kroki: kopia bazy w działającym kontenerze, nowy obraz, `backup verify` nowym obrazem na tej kopii,
# restart, sprawdzenie /api/health. Błąd przed restartem zostawia starą wersję działającą; błąd po restarcie
# przywraca poprzedni obraz. Opis: docs/instrukcje/WDROZENIE.md, „Aktualizacja”.
set -euo pipefail

SERVICE=${SERVICE:-ogarniacz}
HEALTH_TRIES=${HEALTH_TRIES:-30}
MODE=pull
case "${1:-}" in
  '') ;;
  --build) MODE=build ;;
  *) echo "Użycie: $0 [--build]" >&2; exit 2 ;;
esac

log() { printf '[update] %s\n' "$*"; }
fail() { printf '[update] BŁĄD: %s\n' "$*" >&2; exit 1; }

# Blokada przed równoległym uruchomieniem (mkdir jest atomowe także bez flock).
LOCK=.update.lock
mkdir "$LOCK" 2>/dev/null || fail "aktualizacja już trwa (usuń katalog $LOCK, jeśli to pozostałość po przerwanym przebiegu)"
trap 'rmdir "$LOCK"' EXIT

compose() { docker compose "$@"; }

# Sprawdza /api/health z wnętrza kontenera: port aplikacji nie musi być wystawiony na hosta.
healthy() {
  compose exec -T "$SERVICE" node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))" >/dev/null 2>&1
}

wait_healthy() {
  for _ in $(seq 1 "$HEALTH_TRIES"); do
    healthy && return 0
    sleep 2
  done
  return 1
}

container=$(compose ps -q "$SERVICE")
[ -n "$container" ] || fail "kontener $SERVICE nie działa; pierwszy start to: docker compose up -d"
image=$(docker inspect --format '{{.Config.Image}}' "$container")
old_id=$(docker inspect --format '{{.Image}}' "$container")
log "obecny obraz: $image (${old_id:7:12})"

log "kopia bazy"
compose exec -T "$SERVICE" node dist/cli.cjs backup

if [ "$MODE" = build ]; then
  log "budowa nowego obrazu"
  compose build "$SERVICE"
else
  log "pobieranie nowego obrazu"
  compose pull "$SERVICE"
fi
new_id=$(docker image inspect --format '{{.Id}}' "$image")
if [ "$new_id" = "$old_id" ]; then
  log "obraz bez zmian, nic do zrobienia"
  exit 0
fi

# Nowy kod odtwarza najnowszą kopię w katalogu tymczasowym i wykonuje na niej swoje migracje.
log "migracje nowej wersji na kopii (backup verify)"
if ! compose run --rm --no-deps -T "$SERVICE" node dist/cli.cjs backup verify; then
  docker tag "$old_id" "$image"
  fail "nowa wersja nie przeszła próby na kopii; przywrócony poprzedni obraz, aplikacja działa bez zmian"
fi

log "restart z nową wersją"
compose up -d
if wait_healthy; then
  log "gotowe: /api/health odpowiada (${new_id:7:12})"
  exit 0
fi

log "nowa wersja nie odpowiada, powrót do poprzedniego obrazu"
docker tag "$old_id" "$image"
compose up -d --force-recreate "$SERVICE"
wait_healthy || fail "poprzednia wersja też nie odpowiada; sprawdź: docker compose logs $SERVICE"
fail "przywrócona poprzednia wersja (${old_id:7:12}); sprawdź: docker compose logs $SERVICE"
