import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/client';
import { tasks } from '../db/schema';
import { createBackup, listBackups, pruneBackups, restoreBackup } from './backup';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ogarniacz-backup-'));
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

function addTask(db: ReturnType<typeof openDatabase>['db'], title: string) {
  const now = new Date();
  db.insert(tasks).values({ id: crypto.randomUUID(), title, createdAt: now, updatedAt: now }).run();
}

describe('kopia zapasowa', () => {
  it('kopiuje działającą bazę w trybie WAL i nazywa plik datą z Warszawy', async () => {
    const database = openDatabase(join(dir, 'app.db'), './drizzle');
    addTask(database.db, 'Przed kopią');

    // 23:30 UTC to już następny dzień w Polsce.
    const path = await createBackup(database.sqlite, join(dir, 'backups'), new Date('2026-11-08T23:30:00Z'));
    database.close();

    expect(path.endsWith('ogarniacz-2026-11-09.db')).toBe(true);
    const copy = openDatabase(path, './drizzle');
    expect(copy.db.select().from(tasks).all().map((t) => t.title)).toEqual(['Przed kopią']);
    copy.close();
  });

  it('zostawia w katalogu kopii tylko plik kopii, bez plików pośrednich i WAL', async () => {
    const database = openDatabase(join(dir, 'app.db'), './drizzle');
    addTask(database.db, 'Przed kopią');
    const backups = join(dir, 'backups');

    await createBackup(database.sqlite, backups, new Date('2026-11-15T02:30:00Z'));
    database.close();

    expect(readdirSync(backups)).toEqual(['ogarniacz-2026-11-15.db']);
  });

  it('sprawdzenie starszej kopii w trybie WAL przed odtworzeniem nie zostawia plików obok niej', () => {
    // Kopie sprzed poprawki dziedziczyły tryb WAL po bazie.
    const backups = join(dir, 'backups');
    mkdirSync(backups);
    const backup = join(backups, 'ogarniacz-2026-11-14.db');
    openDatabase(backup, './drizzle').close();

    restoreBackup(backup, join(dir, 'proba', 'odtworzona.db'));

    expect(readdirSync(backups)).toEqual(['ogarniacz-2026-11-14.db']);
  });

  it('usuwa pliki pośrednie z poprzednich dni, a dzisiejszych nie rusza', () => {
    const backups = join(dir, 'backups');
    mkdirSync(backups);
    const names = [
      'ogarniacz-2026-11-14.db',
      'ogarniacz-2026-11-14.db.tmp-shm',
      'ogarniacz-2026-11-14.db.tmp-wal',
      'ogarniacz-2026-11-15.db.tmp',
    ];
    for (const name of names) writeFileSync(join(backups, name), '');

    const removed = pruneBackups(backups, 14, new Date('2026-11-15T10:00:00Z'));

    expect(removed).toEqual(['ogarniacz-2026-11-14.db.tmp-shm', 'ogarniacz-2026-11-14.db.tmp-wal']);
    expect(readdirSync(backups).sort()).toEqual(['ogarniacz-2026-11-14.db', 'ogarniacz-2026-11-15.db.tmp']);
  });

  it('usuwa tylko kopie starsze niż limit', () => {
    const backups = join(dir, 'backups');
    mkdirSync(backups);
    for (const name of ['ogarniacz-2026-10-20.db', 'ogarniacz-2026-10-25.db', 'ogarniacz-2026-11-08.db', 'notatki.txt']) {
      writeFileSync(join(backups, name), '');
    }

    const removed = pruneBackups(backups, 14, new Date('2026-11-08T10:00:00Z'));

    expect(removed).toEqual(['ogarniacz-2026-10-20.db']);
    expect(listBackups(backups)).toEqual(['ogarniacz-2026-10-25.db', 'ogarniacz-2026-11-08.db']);
    expect(existsSync(join(backups, 'notatki.txt'))).toBe(true);
  });

  it('odtwarza bazę z kopii i zachowuje poprzednią', async () => {
    const dbPath = join(dir, 'app.db');
    const database = openDatabase(dbPath, './drizzle');
    addTask(database.db, 'W kopii');
    const backup = await createBackup(database.sqlite, join(dir, 'backups'));
    addTask(database.db, 'Po kopii');
    database.close();

    const previous = restoreBackup(backup, dbPath);

    const restored = openDatabase(dbPath, './drizzle');
    expect(restored.db.select().from(tasks).all().map((t) => t.title)).toEqual(['W kopii']);
    restored.close();
    expect(previous && existsSync(previous)).toBe(true);
  });

  it('odtwarza do nowego katalogu, np. przy próbie na kopii', async () => {
    const database = openDatabase(join(dir, 'app.db'), './drizzle');
    addTask(database.db, 'Do sprawdzenia');
    const backup = await createBackup(database.sqlite, join(dir, 'backups'));
    database.close();

    const target = join(dir, 'proba', 'odtworzona.db');
    expect(restoreBackup(backup, target)).toBeUndefined();

    const restored = openDatabase(target, './drizzle');
    expect(restored.db.select().from(tasks).all().map((t) => t.title)).toEqual(['Do sprawdzenia']);
    restored.close();
  });

  it('nie odtwarza z uszkodzonego pliku', () => {
    const broken = join(dir, 'zepsuta.db');
    writeFileSync(broken, 'to nie jest baza');
    const dbPath = join(dir, 'app.db');
    openDatabase(dbPath, './drizzle').close();

    expect(() => restoreBackup(broken, dbPath)).toThrow();
    expect(readdirSync(dir)).toContain('app.db');
    expect(readdirSync(dir).some((name) => name.includes('before-restore'))).toBe(false);
  });
});
