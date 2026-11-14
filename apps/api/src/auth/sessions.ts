import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull, lt, ne } from 'drizzle-orm';
import type { Db } from '../db/client';
import { sessions, users } from '../db/schema';
import type { UserRow } from './users';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Długa sesja, bo ponowne logowanie w PWA na iOS jest uciążliwe. Każde użycie ją przedłuża. */
export const SESSION_TTL_MS = 90 * DAY_MS;

/** Przedłużamy sesję najwyżej raz na godzinę, żeby nie zapisywać bazy przy każdym żądaniu. */
const RENEW_AFTER_MS = 60 * 60 * 1000;

/** Identyfikator sesji w bazie: SHA-256 tokenu z cookie. */
export function sessionId(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSession(db: Db, userId: string, now = new Date()) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  db.insert(sessions)
    .values({ id: sessionId(token), userId, createdAt: now, lastSeenAt: now, expiresAt })
    .run();
  return { token, expiresAt };
}

export type ActiveSession = { user: UserRow; renewedUntil?: Date };

/** Zwraca użytkownika ważnej sesji. `renewedUntil` oznacza, że trzeba odświeżyć cookie. */
export function findSession(db: Db, token: string, now = new Date()): ActiveSession | undefined {
  const id = sessionId(token);
  const row = db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, id), isNull(users.disabledAt)))
    .get();

  if (!row) return undefined;
  if (row.session.expiresAt.getTime() <= now.getTime()) {
    db.delete(sessions).where(eq(sessions.id, id)).run();
    return undefined;
  }

  if (now.getTime() - row.session.lastSeenAt.getTime() < RENEW_AFTER_MS) {
    return { user: row.user };
  }

  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  db.update(sessions).set({ lastSeenAt: now, expiresAt }).where(eq(sessions.id, id)).run();
  return { user: row.user, renewedUntil: expiresAt };
}

/** Usuwa sesję i zwraca konto, do którego należała (do dziennika logowań). */
export function deleteSession(db: Db, token: string): string | undefined {
  return db.delete(sessions).where(eq(sessions.id, sessionId(token))).returning({ userId: sessions.userId }).get()?.userId;
}

/** „Wyloguj inne urządzenia”: usuwa sesje osoby poza bieżącą i zwraca, ile ich było. */
export function deleteOtherSessions(db: Db, userId: string, keepToken: string): number {
  return db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.id, sessionId(keepToken))))
    .run().changes;
}

export function deleteExpiredSessions(db: Db, now = new Date()) {
  return db.delete(sessions).where(lt(sessions.expiresAt, now)).run().changes;
}
