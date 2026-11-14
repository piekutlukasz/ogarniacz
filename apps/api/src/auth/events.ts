import { randomUUID } from 'node:crypto';
import type { AuthEventType } from '@ogarniacz/shared';
import { desc, eq, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Db } from '../db/client';
import { authEvents, users } from '../db/schema';

/** Jak długo trzymamy dziennik logowań. Adres IP to dana osobowa, a dziennik nie jest daną rodziny. */
export const AUTH_EVENTS_KEEP_DAYS = 90;
const USER_AGENT_MAX = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AuthEventInput = {
  type: AuthEventType;
  userId?: string | null;
  actorId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  detail?: string | null;
};

export function recordAuthEvent(db: Db, event: AuthEventInput, now = new Date()) {
  db.insert(authEvents)
    .values({
      id: randomUUID(),
      createdAt: now,
      type: event.type,
      userId: event.userId ?? null,
      actorId: event.actorId ?? null,
      ip: event.ip ?? null,
      userAgent: event.userAgent ? event.userAgent.slice(0, USER_AGENT_MAX) : null,
      detail: event.detail ?? null,
    })
    .run();
}

/** Usuwa wpisy starsze niż `keepDays`; zwraca ich liczbę. */
export function deleteOldAuthEvents(db: Db, now = new Date(), keepDays = AUTH_EVENTS_KEEP_DAYS) {
  return db
    .delete(authEvents)
    .where(lt(authEvents.createdAt, new Date(now.getTime() - keepDays * DAY_MS)))
    .run().changes;
}

/** Ostatnie wpisy, od najnowszego, z loginem i imieniem konta, którego dotyczą, oraz imieniem wykonawcy. */
export function listAuthEvents(db: Db, limit = 100) {
  const actors = alias(users, 'actors');
  return db
    .select({
      createdAt: authEvents.createdAt,
      type: authEvents.type,
      login: users.login,
      name: users.name,
      actorName: actors.name,
      ip: authEvents.ip,
      userAgent: authEvents.userAgent,
      detail: authEvents.detail,
    })
    .from(authEvents)
    .leftJoin(users, eq(authEvents.userId, users.id))
    .leftJoin(actors, eq(authEvents.actorId, actors.id))
    .orderBy(desc(authEvents.createdAt))
    .limit(limit)
    .all();
}

/**
 * Ogranicza wpisy, które ktoś z zewnątrz może tworzyć bez końca (próby na nieistniejące loginy):
 * najwyżej jeden na klucz w danym oknie. W pamięci, jak limit prób logowania.
 */
export function createEventThrottle(windowMs = 60 * 1000) {
  const last = new Map<string, number>();
  return (key: string, now: number): boolean => {
    const previous = last.get(key);
    if (previous !== undefined && now - previous < windowMs) return false;
    last.set(key, now);
    // Bez sprzątania mapa rosłaby z każdym nowym adresem; wystarczy przy okazji wyrzucić stare klucze.
    if (last.size > 1000) {
      for (const [entry, at] of last) if (now - at >= windowMs) last.delete(entry);
    }
    return true;
  };
}
