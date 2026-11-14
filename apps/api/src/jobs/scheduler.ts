import type Database from 'better-sqlite3';
import cron from 'node-cron';
import { deleteOldAuthEvents } from '../auth/events';
import { deleteExpiredSessions } from '../auth/sessions';
import type { Db } from '../db/client';
import { createBackup, pruneBackups } from './backup';
import { uploadBackups } from './offsite';
import { DEMO_RESET_CRON, resetDemo } from '../demo';
import { type CalendarSettings, runCalendarSync } from '../calendars/sync';
import { runDueReminders, runMorningSummaries } from '../push/jobs';
import type { PushSettings } from '../push/sender';
import { runRecurrenceJob } from './recurrences';

const TIMEZONE = 'Europe/Warsaw';

type SchedulerOptions = {
  db: Db;
  sqlite: Database.Database;
  backupDir: string;
  backupKeepDays: number;
  offsite?: { remote: string; keepDays: number; rclone: string };
  /** Tryb demo: zamiast kopii zapasowych co godzinę wraca stan początkowy. */
  demo?: boolean;
  /** Synchronizacja kalendarzy ICS. Bez niej (brak klucza, demo) zadanie nie rusza. */
  calendars?: CalendarSettings;
  /** Powiadomienia push. Bez nich (brak kluczy, demo) zadania poranne i terminowe nie ruszają. */
  push?: PushSettings;
  now?: () => Date;
};

export async function runNightlyBackup({ sqlite, backupDir, backupKeepDays, offsite }: SchedulerOptions) {
  try {
    const path = await createBackup(sqlite, backupDir);
    const removed = pruneBackups(backupDir, backupKeepDays);
    console.log(`[backup] zapisano ${path}${removed.length ? `, usunięto stare: ${removed.join(', ')}` : ''}`);
  } catch (error) {
    console.error('[backup] BŁĄD kopii zapasowej', error);
    return;
  }

  if (!offsite) return;
  try {
    await uploadBackups(backupDir, offsite);
    console.log(`[backup] wysłano kopie do ${offsite.remote}`);
  } catch (error) {
    console.error('[backup] BŁĄD wysyłki kopii poza serwer', error);
  }
}

export function startScheduler(options: SchedulerOptions) {
  // Po restarcie od razu nadrabiamy zadania cykliczne, a potem sprawdzamy co godzinę. Ponowne uruchomienie niczego nie dubluje.
  runRecurrenceJob(options.db);
  const jobs = [
    cron.schedule('5 * * * *', () => runRecurrenceJob(options.db), { timezone: TIMEZONE }),
    options.demo
      ? cron.schedule(
          DEMO_RESET_CRON,
          () => {
            resetDemo(options.db).then(
              () => console.log('[demo] przywrócono dane początkowe'),
              (error: unknown) => console.error('[demo] BŁĄD resetu', error),
            );
          },
          { timezone: TIMEZONE },
        )
      : cron.schedule('30 3 * * *', () => runNightlyBackup(options), { timezone: TIMEZONE }),
    cron.schedule('45 3 * * *', () => {
      const removed = deleteExpiredSessions(options.db);
      if (removed) console.log(`[sesje] usunięto wygasłe: ${removed}`);
      const oldEvents = deleteOldAuthEvents(options.db);
      if (oldEvents) console.log(`[dziennik logowań] usunięto starsze niż 90 dni: ${oldEvents}`);
    }, { timezone: TIMEZONE }),
  ];
  const calendarSettings = options.calendars;
  if (calendarSettings) {
    const now = options.now ?? (() => new Date());
    const sync = () => {
      runCalendarSync(options.db, calendarSettings, now).catch(() => console.error('[kalendarze] BŁĄD zadania synchronizacji'));
    };
    // Przy starcie od razu nadrabiamy, ale kalendarze z odstępem po błędach czekają na swój czas (`next_sync_at`).
    sync();
    jobs.push(cron.schedule('*/15 * * * *', sync, { timezone: TIMEZONE }));
  }

  const push = options.push;
  if (push) {
    const now = options.now ?? (() => new Date());
    const notify = () => {
      // Godzinę podsumowania wybiera każda osoba, więc sprawdzamy co 5 minut, a klucz w `notifications` pilnuje jednej wysyłki dziennie.
      runMorningSummaries(options.db, push, now)
        .then(() => runDueReminders(options.db, push, now))
        .catch(() => console.error('[push] BŁĄD zadania powiadomień'));
    };
    // Po restarcie serwera zaległe podsumowanie nadrabiamy od razu, o ile wciąż jest przed południem.
    notify();
    jobs.push(cron.schedule('*/5 * * * *', notify, { timezone: TIMEZONE }));
  }

  return () => {
    for (const job of jobs) {
      job.stop();
    }
  };
}
