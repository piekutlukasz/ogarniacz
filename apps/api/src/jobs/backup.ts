import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';

const BACKUP_FILE = /^ogarniacz-(\d{4}-\d{2}-\d{2})\.db$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Data w strefie Europe/Warsaw w formacie RRRR-MM-DD. */
function warsawDate(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(date);
}

function assertIntact(path: string) {
  if (!existsSync(path)) throw new Error(`Nie ma pliku ${path}`);
  const check = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const result = check.pragma('integrity_check', { simple: true });
    if (result !== 'ok') throw new Error(`Plik ${path} jest uszkodzony: ${String(result)}`);
  } finally {
    check.close();
  }
}

/**
 * Kopia przez backupowe API SQLite. Zwykłe kopiowanie pliku w trybie WAL mogłoby dać
 * niespójną kopię, gdy serwer akurat zapisuje. Jedna kopia na dzień, ponowna nadpisuje.
 */
export async function createBackup(sqlite: Database.Database, dir: string, now = new Date()): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const target = join(dir, `ogarniacz-${warsawDate(now)}.db`);
  const temporary = `${target}.tmp`;

  rmSync(temporary, { force: true });
  await sqlite.backup(temporary);
  assertIntact(temporary);
  renameSync(temporary, target);
  return target;
}

/** Usuwa kopie starsze niż `keepDays` dni. Zwraca nazwy usuniętych plików. */
export function pruneBackups(dir: string, keepDays: number, now = new Date()): string[] {
  if (!existsSync(dir)) return [];
  const oldest = warsawDate(new Date(now.getTime() - keepDays * DAY_MS));
  const removed: string[] = [];
  for (const name of readdirSync(dir)) {
    const date = BACKUP_FILE.exec(name)?.[1];
    if (date && date < oldest) {
      rmSync(join(dir, name));
      removed.push(name);
    }
  }
  return removed.sort();
}

export function listBackups(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => BACKUP_FILE.test(name))
    .sort();
}

/**
 * Podmienia bazę na kopię. Serwer musi być zatrzymany. Obecna baza nie znika:
 * trafia obok z dopiskiem `.before-restore-<czas>`, razem z plikami WAL.
 */
export function restoreBackup(backupPath: string, databasePath: string, now = new Date()): string | undefined {
  assertIntact(backupPath);
  mkdirSync(dirname(databasePath), { recursive: true });

  let previous: string | undefined;
  if (existsSync(databasePath)) {
    previous = `${databasePath}.before-restore-${now.toISOString().replaceAll(':', '-')}`;
    renameSync(databasePath, previous);
    for (const suffix of ['-wal', '-shm']) {
      if (existsSync(databasePath + suffix)) renameSync(databasePath + suffix, previous + suffix);
    }
  }

  copyFileSync(backupPath, databasePath);
  return previous;
}
