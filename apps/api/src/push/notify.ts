import { randomUUID } from 'node:crypto';
import {
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationLogKind,
  type NotificationPrefs,
  type NotificationScreen,
} from '@ogarniacz/shared';
import { eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import { notificationPrefs, notifications, pushSubscriptions } from '../db/schema';
import type { PushSettings } from './sender';

/** Urządzenie, które kilka razy z rzędu nie przyjęło powiadomienia, uznajemy za martwe. */
export const MAX_FAILURES = 5;

export function getPrefs(db: Db, userId: string): NotificationPrefs {
  const row = db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, userId)).get();
  if (!row) return DEFAULT_NOTIFICATION_PREFS;
  const { userId: _userId, ...prefs } = row;
  return prefs;
}

export function savePrefs(db: Db, userId: string, prefs: NotificationPrefs) {
  db.insert(notificationPrefs)
    .values({ userId, ...prefs })
    .onConflictDoUpdate({ target: notificationPrefs.userId, set: prefs })
    .run();
}

export function screenUrl(screen: NotificationScreen): string {
  return `/?ekran=${screen}`;
}

export type NotifyInput = {
  userId: string;
  kind: NotificationLogKind;
  /** Ten sam klucz nie wyśle się drugi raz, np. `morning:2026-11-10:<osoba>`. */
  dedupeKey: string;
  title: string;
  body: string;
  screen: NotificationScreen;
};

export type NotifyOutcome = 'sent' | 'duplicate' | 'no_device' | 'failed';

/**
 * Wysyła powiadomienie na wszystkie urządzenia osoby. Wiersz w `notifications` powstaje przed wysyłką,
 * więc drugie uruchomienie (restart, nakładające się zadania) trafia na unikalny klucz i nic nie robi.
 * Gdy osoba nie ma żadnego urządzenia, klucza nie zajmujemy: po włączeniu powiadomień jeszcze tego samego dnia
 * podsumowanie nadal może dotrzeć.
 */
export async function notifyUser(db: Db, push: PushSettings, now: () => Date, input: NotifyInput): Promise<NotifyOutcome> {
  const devices = db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, input.userId)).all();
  if (devices.length === 0) return 'no_device';

  const url = screenUrl(input.screen);
  const id = randomUUID();
  const claimed = db
    .insert(notifications)
    .values({ id, userId: input.userId, kind: input.kind, dedupeKey: input.dedupeKey, title: input.title, body: input.body, url, createdAt: now() })
    .onConflictDoNothing()
    .returning({ id: notifications.id })
    .get();
  if (!claimed) return 'duplicate';

  const payload = { title: input.title, body: input.body, url, tag: input.kind };
  const results = await Promise.all(devices.map((device) => push.send(device, payload).then((result) => ({ device, result }))));

  const at = now();
  const dead: string[] = [];
  let delivered = false;
  for (const { device, result } of results) {
    if (result.ok) {
      delivered = true;
      db.update(pushSubscriptions).set({ lastSuccessAt: at, lastError: null, failures: 0 }).where(eq(pushSubscriptions.id, device.id)).run();
    } else if (result.statusCode === 404 || result.statusCode === 410) {
      // Usługa push już nie zna tej subskrypcji: telefon ją cofnął albo aplikację odinstalowano.
      dead.push(device.id);
    } else {
      const failures = device.failures + 1;
      if (failures >= MAX_FAILURES) dead.push(device.id);
      else {
        db.update(pushSubscriptions)
          .set({ lastError: String(result.statusCode ?? 'network'), failures })
          .where(eq(pushSubscriptions.id, device.id))
          .run();
      }
    }
  }
  if (dead.length > 0) db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, dead)).run();
  if (delivered) db.update(notifications).set({ sentAt: at }).where(eq(notifications.id, id)).run();
  return delivered ? 'sent' : 'failed';
}
