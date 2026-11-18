import { randomUUID } from 'node:crypto';
import { latestOccurrence, warsawDate } from '@ogarniacz/shared';
import { and, eq, isNull, ne } from 'drizzle-orm';
import type { Db } from '../db/client';
import { recurrences, taskEvents, tasks, users } from '../db/schema';

export type GenerateResult = { created: number; skipped: number };

function later(a: string, b: string | null): string {
  return b !== null && b > a ? b : a;
}

/**
 * Tworzy zadania z reguł cyklicznych na dziś (czas polski). Bezpieczne do wywołania dowolnie często:
 * kursor `lastDueOn` i zadanie zapisują się w jednej transakcji, a indeks unikalny blokuje duplikat dnia.
 *
 * - Powstaje tylko najpóźniejsze zaległe wystąpienie, np. po kilku dniach przestoju serwera jedno, nie kilka.
 * - Gdy poprzednie zadanie z reguły jest jeszcze otwarte, nowe nie powstaje, a dzień przepada.
 * - Dni pauzy są pomijane. Pauza do daty kończy się sama następnego dnia.
 */
export function generateRecurringTasks(db: Db, now: Date, onlyId?: string): GenerateResult {
  const today = warsawDate(now);
  const result: GenerateResult = { created: 0, skipped: 0 };

  db.transaction((tx) => {
    const rules = tx
      .select()
      .from(recurrences)
      .where(onlyId ? and(isNull(recurrences.archivedAt), eq(recurrences.id, onlyId)) : isNull(recurrences.archivedAt))
      .all();

    for (const rule of rules) {
      if (rule.pausedAt && rule.pausedUntil === null) continue;

      let cursor = rule.pausedAt ? later(rule.lastDueOn, rule.pausedUntil) : rule.lastDueOn;
      if (rule.pausedAt && rule.pausedUntil !== null && today > rule.pausedUntil) {
        tx.update(recurrences)
          .set({ pausedAt: null, pausedUntil: null, lastDueOn: cursor, updatedAt: now })
          .where(eq(recurrences.id, rule.id))
          .run();
      }

      const dueOn = latestOccurrence(rule.pattern, rule.startOn, cursor, today);
      if (!dueOn) continue;
      cursor = dueOn;

      const open = tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.recurrenceId, rule.id), isNull(tasks.archivedAt), ne(tasks.status, 'done')))
        .get();

      if (open) {
        result.skipped += 1;
      } else {
        const assignee = rule.assigneeId
          ? tx.select({ disabledAt: users.disabledAt }).from(users).where(eq(users.id, rule.assigneeId)).get()
          : undefined;
        // Wyłączone konto nie dostaje nowych zadań: wystąpienie trafia do puli „dla chętnych”.
        const assigneeId = assignee && assignee.disabledAt === null ? rule.assigneeId : null;
        const values = { title: rule.title, assigneeId, dueOn, reward: rule.reward, recurrenceId: rule.id };
        const created = tx
          .insert(tasks)
          .values({
            id: randomUUID(),
            ...values,
            assignedById: assigneeId ? rule.createdById : null,
            createdById: rule.createdById,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing()
          .returning()
          .get();
        if (created) {
          tx.insert(taskEvents)
            .values({ taskId: created.id, type: 'created', changes: values, actorId: null, createdAt: now })
            .run();
          result.created += 1;
        }
      }

      tx.update(recurrences).set({ lastDueOn: cursor }).where(eq(recurrences.id, rule.id)).run();
    }
  });

  return result;
}

export function runRecurrenceJob(db: Db, now = new Date()) {
  try {
    const { created, skipped } = generateRecurringTasks(db, now);
    if (created || skipped) {
      console.log(`[cykliczne] utworzono: ${created}, pominięto przy otwartym zadaniu: ${skipped}`);
    }
  } catch (error) {
    console.error('[cykliczne] BŁĄD tworzenia zadań', error);
  }
}
