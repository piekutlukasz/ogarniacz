import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { parseArgs } from 'node:util';
import { ZodError } from 'zod';
import { userRoleSchema } from '@ogarniacz/shared';
import { AUTH_EVENTS_KEEP_DAYS, listAuthEvents, recordAuthEvent } from './auth/events';
import { createUser, findUserByLogin, listUsers, setDisabled, setPassword } from './auth/users';
import { DEMO_PASSWORD, seedDemo } from './demo';
import { loadConfig } from './config';
import { openDatabase } from './db/client';
import { calendars, tasks } from './db/schema';
import { isNull } from 'drizzle-orm';
import { CalendarKeyError, parseEncryptionKey } from './calendars/crypto';
import { DEFAULT_ALLOWED_HOSTS } from './calendars/fetch';
import { runCalendarSync } from './calendars/sync';
import { createBackup, listBackups, pruneBackups, restoreBackup } from './jobs/backup';
import { uploadBackups } from './jobs/offsite';

const HELP = `Ogarniacz: zarządzanie kontami i kopiami zapasowymi

Konta:
  user list
  user add --login <login> --name <imię> --role parent|child
  user passwd <login>
  user disable <login>       wyłącza konto i wylogowuje je ze wszystkich urządzeń
  user enable <login>
  user log [--limit N]       dziennik logowań: udane i nieudane próby, blokady, zmiany kont
                             (ostatnie ${AUTH_EVENTS_KEEP_DAYS} dni, domyślnie 50 wpisów)

Kopie zapasowe:
  backup                     robi kopię teraz (serwer może działać) i wysyła ją poza serwer,
                             jeśli ustawiono BACKUP_REMOTE
  backup list
  backup verify [plik]       próba odtworzenia: odtwarza kopię (domyślnie najnowszą) obok,
                             pokazuje konta i liczbę zadań, potem ją usuwa; serwer działa dalej
  restore <plik> --yes       podmienia bazę na kopię; najpierw zatrzymaj serwer

Kalendarze:
  calendar list              kalendarze: serwis, ostatni udany odczyt, kod błędu (bez linków)
  calendar sync              wymusza synchronizację wszystkich kalendarzy i wypisuje wynik;
                             wymaga CALENDAR_ENCRYPTION_KEY

Demo:
  demo seed                  wgrywa przykładowe konta, zadania i zakupy do pustej bazy
                             (konta: tata, mama, kasia; hasło: ${DEMO_PASSWORD})

Hasło jest wpisywane bez wyświetlania. Z --password-stdin czyta je ze standardowego wejścia.`;

async function readStdin(): Promise<string> {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data.replace(/\r?\n$/, '');
}

function promptHidden(question: string): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

async function readNewPassword(fromStdin: boolean): Promise<string> {
  if (fromStdin) return readStdin();
  const first = await promptHidden('Hasło: ');
  const second = await promptHidden('Powtórz hasło: ');
  if (first !== second) throw new Error('Hasła się różnią');
  return first;
}

async function main(argv: string[]) {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      login: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string' },
      'password-stdin': { type: 'boolean', default: false },
      yes: { type: 'boolean', default: false },
      limit: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [command, subcommand, argument] = positionals;

  if (values.help || !command) {
    console.log(HELP);
    return;
  }

  const config = loadConfig();

  if (command === 'backup' && subcommand === 'verify') {
    const file = argument ?? listBackups(config.BACKUP_DIR).map((name) => join(config.BACKUP_DIR, name)).at(-1);
    if (!file) throw new Error(`Brak kopii w ${config.BACKUP_DIR}`);
    const dir = mkdtempSync(join(tmpdir(), 'ogarniacz-proba-'));
    try {
      const target = join(dir, 'ogarniacz.db');
      restoreBackup(file, target);
      const restored = openDatabase(target, config.MIGRATIONS_DIR);
      try {
        const accounts = listUsers(restored.db);
        const taskCount = restored.db.select().from(tasks).all().length;
        console.log(`Kopia ${file} odtwarza się poprawnie.`);
        console.log(`Konta (${accounts.length}): ${accounts.map((user) => `${user.login} (${user.role})`).join(', ')}`);
        console.log(`Zadania: ${taskCount}`);
      } finally {
        restored.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    return;
  }

  if (command === 'restore') {
    if (!subcommand) throw new Error('Podaj plik kopii, np. restore data/backups/ogarniacz-2026-11-08.db');
    if (!values.yes) throw new Error('Odtworzenie podmienia bazę. Zatrzymaj serwer i dodaj --yes');
    const previous = restoreBackup(subcommand, config.DATABASE_PATH);
    // Otwarcie bazy uruchamia migracje, więc starsza kopia od razu dostaje aktualny schemat.
    openDatabase(config.DATABASE_PATH, config.MIGRATIONS_DIR).close();
    console.log(`Odtworzono ${config.DATABASE_PATH} z ${subcommand}.`);
    if (previous) console.log(`Poprzednia baza: ${previous}`);
    return;
  }

  const { db, sqlite, close } = openDatabase(config.DATABASE_PATH, config.MIGRATIONS_DIR);
  try {
    if (command === 'backup') {
      if (subcommand === 'list') {
        for (const name of listBackups(config.BACKUP_DIR)) console.log(name);
        return;
      }
      const path = await createBackup(sqlite, config.BACKUP_DIR);
      pruneBackups(config.BACKUP_DIR, config.BACKUP_KEEP_DAYS);
      console.log(`Zapisano ${path}`);
      if (config.BACKUP_REMOTE) {
        await uploadBackups(config.BACKUP_DIR, {
          remote: config.BACKUP_REMOTE,
          keepDays: config.BACKUP_REMOTE_KEEP_DAYS,
          rclone: config.RCLONE_PATH,
        });
        console.log(`Wysłano kopie do ${config.BACKUP_REMOTE}`);
      } else {
        console.log('BACKUP_REMOTE nie jest ustawione, kopia została tylko na serwerze.');
      }
      return;
    }

    if (command === 'demo') {
      if (subcommand !== 'seed') throw new Error(`Nieznane polecenie: demo ${subcommand ?? ''}\n\n${HELP}`);
      const { accounts } = await seedDemo(db);
      console.log(`Wgrano dane demo. Konta (hasło ${DEMO_PASSWORD}):`);
      for (const account of accounts) console.log(`  ${account.login}\t${account.role}\t${account.name}`);
      return;
    }

    if (command === 'calendar') {
      if (subcommand === 'list') {
        for (const row of db.select().from(calendars).where(isNull(calendars.archivedAt)).all()) {
          const last = row.lastSuccessAt ? row.lastSuccessAt.toISOString() : 'nigdy';
          console.log(`${row.name}\t${row.urlHost}\t${row.scope}\tostatnio: ${last}\tbłąd: ${row.lastError ?? 'brak'}`);
        }
        return;
      }
      if (subcommand === 'sync') {
        if (!config.CALENDAR_ENCRYPTION_KEY) throw new Error('Brak CALENDAR_ENCRYPTION_KEY w ustawieniach serwera');
        let key: Buffer;
        try {
          key = parseEncryptionKey(config.CALENDAR_ENCRYPTION_KEY);
        } catch (error) {
          if (error instanceof CalendarKeyError) throw new Error(error.message);
          throw error;
        }
        const extra = (config.CALENDAR_ALLOWED_HOSTS ?? '').split(',').map((host) => host.trim()).filter(Boolean);
        const summary = await runCalendarSync(
          db,
          { key, fetch: { allowedHosts: [...DEFAULT_ALLOWED_HOSTS, ...extra], allowInsecure: config.CALENDAR_ALLOW_HTTP } },
          () => new Date(),
          { force: true },
        );
        console.log(`Zsynchronizowano: ${summary.ok}, bez zmian: ${summary.unchanged}, błędy: ${summary.failed}`);
        return;
      }
      throw new Error(`Nieznane polecenie: calendar ${subcommand ?? ''}\n\n${HELP}`);
    }

    if (command !== 'user') throw new Error(`Nieznane polecenie: ${command}\n\n${HELP}`);

    switch (subcommand) {
      case 'list': {
        for (const user of listUsers(db)) {
          const status = user.disabledAt ? ' (wyłączone)' : '';
          console.log(`${user.login}\t${user.role}\t${user.name}${status}`);
        }
        return;
      }
      case 'add': {
        const parsedRole = userRoleSchema.safeParse(values.role);
        if (!parsedRole.success) throw new Error('Podaj --role parent (rodzic) albo --role child (dziecko)');
        const role = parsedRole.data;
        if (!values.login || !values.name) throw new Error('Podaj --login i --name');
        const password = await readNewPassword(values['password-stdin']);
        const user = await createUser(db, { login: values.login, name: values.name, role, password });
        recordAuthEvent(db, { type: 'account_created', userId: user.id, detail: 'cli' });
        console.log(`Utworzono konto ${user.login} (${user.role}).`);
        return;
      }
      case 'passwd': {
        if (!argument) throw new Error('Podaj login');
        await setPassword(db, argument, await readNewPassword(values['password-stdin']));
        recordAuthEvent(db, { type: 'password_reset', userId: findUserByLogin(db, argument)?.id, detail: 'cli' });
        console.log(`Zmieniono hasło ${argument}. Konto wylogowano ze wszystkich urządzeń.`);
        return;
      }
      case 'disable':
      case 'enable': {
        if (!argument) throw new Error('Podaj login');
        setDisabled(db, argument, subcommand === 'disable');
        recordAuthEvent(db, {
          type: subcommand === 'disable' ? 'account_disabled' : 'account_enabled',
          userId: findUserByLogin(db, argument)?.id,
          detail: 'cli',
        });
        console.log(`${subcommand === 'disable' ? 'Wyłączono' : 'Włączono'} konto ${argument}.`);
        return;
      }
      case 'log': {
        const limit = Number(values.limit ?? 50);
        if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit: liczba wpisów, np. --limit 100');
        const time = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'short', timeStyle: 'medium' });
        for (const event of listAuthEvents(db, limit)) {
          console.log([time.format(event.createdAt), event.type, event.login ?? '-', event.detail ?? '-', event.ip ?? '-', event.userAgent ?? ''].join('\t'));
        }
        return;
      }
      default:
        throw new Error(`Nieznane polecenie: user ${subcommand ?? ''}\n\n${HELP}`);
    }
  } finally {
    close();
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  if (error instanceof ZodError) {
    console.error(error.issues.map((issue) => issue.message).join('\n'));
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
});
