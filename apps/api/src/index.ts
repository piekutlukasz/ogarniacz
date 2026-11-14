import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { CalendarKeyError, parseEncryptionKey } from './calendars/crypto';
import { createSetupGate, formatSetupCode, generateSetupCode, hasAnyUser } from './auth/setup';
import { DEFAULT_ALLOWED_HOSTS } from './calendars/fetch';
import type { CalendarSettings } from './calendars/sync';
import { loadConfig } from './config';
import { openDatabase } from './db/client';
import { isDemoDatabase, seedDemoIfEmpty } from './demo';
import { startScheduler } from './jobs/scheduler';
import { type PushSettings, createWebPushSettings } from './push/sender';

const config = loadConfig();
const { db, sqlite, close } = openDatabase(config.DATABASE_PATH, config.MIGRATIONS_DIR);

/**
 * Kalendarze działają tylko z kluczem szyfrującym i nigdy w trybie demo (każdy jest tam „rodzicem”,
 * więc pobieranie adresów podanych przez gościa byłoby otwartym serwerem pośredniczącym).
 */
function calendarSettings(): CalendarSettings | undefined {
  if (config.DEMO_MODE) return undefined;
  if (!config.CALENDAR_ENCRYPTION_KEY) {
    console.warn('[kalendarze] brak CALENDAR_ENCRYPTION_KEY: kalendarze wyłączone');
    return undefined;
  }
  try {
    return {
      key: parseEncryptionKey(config.CALENDAR_ENCRYPTION_KEY),
      fetch: {
        allowedHosts: [...DEFAULT_ALLOWED_HOSTS, ...(config.CALENDAR_ALLOWED_HOSTS ?? '').split(',').map((host) => host.trim()).filter(Boolean)],
        allowInsecure: config.CALENDAR_ALLOW_HTTP,
      },
    };
  } catch (error) {
    if (error instanceof CalendarKeyError) {
      console.error(`[kalendarze] ${error.message}. Kalendarze wyłączone`);
      return undefined;
    }
    throw error;
  }
}

/** Powiadomienia działają tylko z kompletem kluczy VAPID i nigdy w trybie demo (wysyłałyby na telefony gości). */
function pushSettings(): PushSettings | undefined {
  if (config.DEMO_MODE) return undefined;
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject } = config;
  if (!publicKey || !privateKey || !subject) {
    console.warn('[push] brak VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY lub VAPID_SUBJECT: powiadomienia wyłączone');
    return undefined;
  }
  return createWebPushSettings({ publicKey, privateKey, subject });
}

// Bundle jest w CommonJS, więc bez top-level await: start przechodzi przez funkcję.
async function main() {
  if (config.DEMO_MODE) {
    // Demo co godzinę czyści całą bazę i wpuszcza na konta przykładowe bez hasła. Przy prawdziwych
    // kontach to utrata danych i otwarte drzwi, więc taki start odrzucamy, zanim cokolwiek ruszy.
    if (!(await isDemoDatabase(db))) {
      throw new Error(
        'DEMO_MODE=true, ale baza ma konta spoza demo. Odmawiam startu, bo reset skasowałby prawdziwe dane. ' +
          'Wyłącz DEMO_MODE albo wskaż pustą bazę w DATABASE_PATH.',
      );
    }
    // Nowy kontener startuje z pustą bazą.
    if (await seedDemoIfEmpty(db)) console.log('[demo] wgrano dane przykładowe do pustej bazy');
  }

  // Pusta baza (poza demo): kreator pierwszego uruchomienia z jednorazowym kodem z logu (docs/plany/KONTA.md, krok 3).
  let setup: ReturnType<typeof createSetupGate> | undefined;
  if (!config.DEMO_MODE && !hasAnyUser(db)) {
    const code = generateSetupCode();
    setup = createSetupGate(code);
    console.log(`[start] pusta baza, kod pierwszego uruchomienia: ${formatSetupCode(code)}`);
    console.log('[start] otwórz aplikację w przeglądarce i załóż konto rodzica w kreatorze (zapasowo: CLI `user add`)');
  }

  const calendars = calendarSettings();
  const push = pushSettings();
  const hasBuiltFrontend = existsSync(join(config.PUBLIC_DIR, 'index.html'));
  const app = createApp({
    db,
    publicDir: hasBuiltFrontend ? config.PUBLIC_DIR : undefined,
    cookieSecure: config.COOKIE_SECURE,
    clientIpHeader: config.CLIENT_IP_HEADER,
    demo: config.DEMO_MODE,
    setup,
    calendars,
    push,
  });

  const stopScheduler = startScheduler({
    db,
    sqlite,
    backupDir: config.BACKUP_DIR,
    backupKeepDays: config.BACKUP_KEEP_DAYS,
    demo: config.DEMO_MODE,
    calendars,
    push,
    // Demo nie robi kopii, więc nie ma czego wysyłać poza serwer.
    offsite: config.BACKUP_REMOTE && !config.DEMO_MODE
      ? { remote: config.BACKUP_REMOTE, keepDays: config.BACKUP_REMOTE_KEEP_DAYS, rclone: config.RCLONE_PATH }
      : undefined,
  });
  const server = serve({ fetch: app.fetch, port: config.PORT, hostname: config.HOST }, (info) => {
    console.log(`Ogarniacz API nasłuchuje na ${config.HOST}:${info.port}`);
  });

  function shutdown() {
    stopScheduler();
    server.close(() => {
      close();
      process.exit(0);
    });
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error('[start] BŁĄD', error);
  process.exit(1);
});
