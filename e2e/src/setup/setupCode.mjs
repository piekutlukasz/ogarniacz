// Kod pierwszego uruchomienia serwera testu dymnego z pustą bazą. Serwer wypisuje go tylko w logu, więc
// smokeServer.mjs wyłuskuje go z wyjścia i zapisuje tutaj, a scenariusz kreatora czyta (docs/plany/KONTA.md, krok 3).
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Plik z kodem dla serwera na danym porcie. */
export function setupCodeFile(port) {
  return join(tmpdir(), `ogarniacz-smoke-setup-${port}.code`);
}

/** Linia z logu serwera: `[start] pusta baza, kod pierwszego uruchomienia: K7M2-9QXD`. */
export const SETUP_CODE_LINE = /kod pierwszego uruchomienia: ([2-9A-Z]{4}-[2-9A-Z]{4})/;
