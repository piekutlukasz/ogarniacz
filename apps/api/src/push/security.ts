import { isQuietHour } from '@ogarniacz/shared';
import { and, eq, isNull, ne } from 'drizzle-orm';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import { getPrefs, notifyUser } from './notify';
import { warsawHour } from './jobs';
import type { PushSettings } from './sender';

type SecurityNotice = {
  /** Wspólny początek klucza; każdy rodzic dostaje własny klucz `<key>:<rodzic>`. */
  key: string;
  title: string;
  body: string;
  /** Konto, którego dotyczy powiadomienie, gdy samo wykonało operację (np. ustawiło nowe hasło): ono go nie dostaje. */
  exceptUserId?: string;
  /** Blokady logowania może wywołać obcy w nocy, więc szanują ciszę nocną; zmiany kont nie. */
  respectQuietHours?: boolean;
};

/**
 * Powiadomienie bezpieczeństwa dla wszystkich aktywnych rodziców (docs/plany/KONTA.md: zmiana kont nie może przejść
 * po cichu). Wywoływane bez czekania na wynik, więc błędy wysyłki tylko zapisujemy w logu, bez treści.
 */
export async function notifyParents(db: Db, push: PushSettings | undefined, now: () => Date, notice: SecurityNotice): Promise<void> {
  if (!push) return;
  const conditions = [eq(users.role, 'parent'), isNull(users.disabledAt)];
  if (notice.exceptUserId) conditions.push(ne(users.id, notice.exceptUserId));
  const parents = db.select({ id: users.id }).from(users).where(and(...conditions)).all();
  for (const parent of parents) {
    if (notice.respectQuietHours && isQuietHour(warsawHour(now()), getPrefs(db, parent.id))) continue;
    try {
      await notifyUser(db, push, now, {
        userId: parent.id,
        kind: 'security',
        dedupeKey: `${notice.key}:${parent.id}`,
        title: notice.title,
        body: notice.body,
        screen: 'today',
      });
    } catch {
      console.error('[push] nie udało się wysłać powiadomienia bezpieczeństwa');
    }
  }
}
